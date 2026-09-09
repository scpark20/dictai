"""All upstream calls are fake; these tests never contact YouTube."""
import multiprocessing
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from youtube_guard import CaptionGuard, BLOCK_SECONDS, MIN_INTERVAL

DATA={'video_id':'jNQXAC9IVRw','language':'en','segments':[{'text':'Hi.','start':1,'end':2}],'version':'fixture'}

def parallel_worker(path, queue, start):
    start.wait()
    def fetch():
        queue.put(('fetch',True));time.sleep(.25);return DATA
    result=CaptionGuard(path).get('jNQXAC9IVRw','en',fetch)
    queue.put(('result',result))


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='caption-guard-test-')
        self.path=Path(self.tmp.name)/'cache.sqlite3'
        self.now=1000.
        self.guard=CaptionGuard(self.path,clock=lambda:self.now)
    def tearDown(self):self.tmp.cleanup()
    def test_cache_survives_new_instance_and_has_no_hour_expiry(self):
        fetch=Mock(return_value=DATA)
        self.guard.get('jNQXAC9IVRw','en',fetch)
        self.now+=86400*30
        other=CaptionGuard(self.path,clock=lambda:self.now)
        self.assertTrue(other.get('jNQXAC9IVRw','en',fetch)['cached'])
        self.assertEqual(fetch.call_count,1)
    def test_minimum_interval_and_language_keys(self):
        fetch=Mock(return_value=DATA)
        self.guard.get('jNQXAC9IVRw','en',fetch)
        self.assertEqual(self.guard.get('jNQXAC9IVRw','ko',fetch)['error'],'request_rate_limited')
        self.now+=MIN_INTERVAL
        self.guard.get('jNQXAC9IVRw','ko',fetch)
        self.assertEqual(fetch.call_count,2)
    def test_hourly_budget(self):
        fetch=Mock(return_value=DATA)
        for i in range(10):
            self.guard.get(str(i),'en',fetch);self.now+=MIN_INTERVAL
        self.assertEqual(self.guard.get('11','en',fetch)['error'],'request_rate_limited')
        self.assertEqual(fetch.call_count,10)
    def test_block_persists_across_instances_but_cache_works(self):
        self.guard.save('saved','en',DATA)
        block=Mock(return_value={'error':'IpBlocked','message':'blocked'})
        result=self.guard.get('new','en',block)
        self.assertEqual(result['error'],'requests_paused')
        self.assertEqual(result['blocked_until'],self.now+BLOCK_SECONDS)
        other=CaptionGuard(self.path,clock=lambda:self.now)
        self.assertTrue(other.status()['paused'])
        self.assertTrue(other.get('saved','en',block)['cached'])
        self.assertEqual(other.get('another','en',block)['error'],'requests_paused')
        self.assertEqual(block.call_count,1)
    def test_expiry_does_not_schedule_request(self):
        fetch=Mock(return_value=DATA);self.guard.pause()
        self.now+=BLOCK_SECONDS+1
        self.assertFalse(self.guard.status()['paused']);fetch.assert_not_called()
        self.guard.get('new','en',fetch);fetch.assert_called_once()
    def test_repeated_failures_are_coalesced(self):
        fetch=Mock(return_value={'error':'timeout','message':'timeout'})
        self.assertEqual(self.guard.get('x','en',fetch)['error'],'timeout')
        self.assertEqual(self.guard.get('x','en',fetch)['error'],'timeout')
        fetch.assert_called_once()
    def test_exception_releases_lease_without_automatic_retry(self):
        fetch=Mock(side_effect=RuntimeError('test'))
        self.assertEqual(self.guard.get('x','en',fetch)['error'],'import_failed')
        self.now+=MIN_INTERVAL
        result=self.guard.get('y','en',lambda:DATA)
        self.assertIn('segments',result)
    def test_expired_crash_lease_recovers(self):
        action,token=self.guard._claim(self.guard.key('old','en'))
        self.assertEqual(action,'fetch')
        self.now+=61
        self.assertIn('segments',self.guard.get('new','en',lambda:DATA))
        self.assertEqual(self.guard._finish(self.guard.key('old','en'),token,DATA)['error'],'request_expired')
    def test_different_inflight_video_is_not_queued(self):
        self.guard._claim(self.guard.key('one','en'))
        fetch=Mock(return_value=DATA)
        self.assertEqual(self.guard.get('two','en',fetch)['error'],'request_busy')
        fetch.assert_not_called()
    def test_storage_error_fails_closed(self):
        bad=Path(self.tmp.name)/'not-a-directory';bad.write_text('fixture')
        fetch=Mock(return_value=DATA)
        self.assertEqual(CaptionGuard(bad/'cache').get('x','en',fetch)['error'],'cache_unavailable')
        fetch.assert_not_called()
    def test_processes_share_one_upstream_request(self):
        ctx=multiprocessing.get_context('fork');queue=ctx.Queue();start=ctx.Event()
        processes=[ctx.Process(target=parallel_worker,args=(self.path,queue,start)) for _ in range(6)]
        for p in processes:p.start()
        start.set()
        for p in processes:p.join(10);self.assertEqual(p.exitcode,0)
        entries=[queue.get(timeout=1) for _ in range(7)]
        self.assertEqual(sum(kind=='fetch' for kind,_ in entries),1)
        self.assertEqual(sum(kind=='result' and 'segments' in value for kind,value in entries),6)

if __name__=='__main__':unittest.main()
