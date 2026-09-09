import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import youtube_api as yt
from fastapi import FastAPI
from fastapi.testclient import TestClient

SRT = '''1
00:00:01,000 --> 00:00:03,000
Hello, there.

2
00:00:05,000 --> 00:00:08,000
Mr. Green didn't leave.

3
00:00:09,000 --> 00:00:12,000
We heard the rain.
'''

class CaptionTests(unittest.TestCase):
    def test_urls(self):
        for url in ('https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://youtu.be/jNQXAC9IVRw', 'https://youtube.com/shorts/jNQXAC9IVRw','https://m.youtube.com/live/jNQXAC9IVRw','jNQXAC9IVRw'):
            self.assertEqual(yt.parse_video_url(url)[0], 'jNQXAC9IVRw')
        self.assertEqual(yt.parse_video_url('https://youtu.be/jNQXAC9IVRw?t=1m5s')[1],65)
        self.assertEqual(yt.parse_video_url('https://www.youtube.com/watch?v=jNQXAC9IVRw#t=32')[1],32)
        for url in ('http://127.0.0.1:8771/', 'https://youtube.com.evil.test/watch?v=jNQXAC9IVRw','https://youtube.com@evil.test/watch?v=jNQXAC9IVRw','file:///etc/passwd','https://youtube.com:999/watch?v=jNQXAC9IVRw','https://youtube.com/playlist?list=anything'):
            with self.assertRaises(ValueError):yt.parse_video_url(url)

    def test_subtitles_and_wording(self):
        cues=yt.parse_subtitles(SRT)
        rows=yt.build_segments(cues)
        self.assertEqual(len(rows),3)
        self.assertEqual(rows[1]['text'],"Mr. Green didn't leave.")
        self.assertEqual(rows[1]['start'],5)
        self.assertEqual(yt.parse_subtitles('WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<i>Hi</i> &amp; hello.')[0]['start'],1)
        with self.assertRaises(ValueError):yt.parse_subtitles('Plain text without times.')
        with self.assertRaises(ValueError):yt.build_segments([{'start':float('nan'),'duration':3,'text':'No.'}])
        with self.assertRaises(ValueError):yt.build_segments([{'start':4,'duration':-2,'text':'No.'}])

    def test_fragment_merge_and_rolling(self):
        cues=[{'start':0,'duration':3,'text':'This is'}, {'start':2,'duration':3,'text':'This is a test.'}, {'start':6,'duration':1,'text':'[Music]'}, {'start':9,'duration':2,'text':'Again.'}, {'start':12,'duration':2,'text':'Again.'}]
        rows=yt.build_segments(cues)
        self.assertEqual([r['text'] for r in rows],['This is a test.','Again.','Again.'])
        self.assertEqual(rows[0]['end'],5)

    def test_api_cache_error_timeout(self):
        app=FastAPI();app.include_router(yt.router)
        payload=yt.package('jNQXAC9IVRw',0,'en',yt.parse_subtitles(SRT))
        yt._cache.clear()
        with TestClient(app) as c:
            self.assertEqual(c.post('/api/youtube/import',json={'url':'http://127.0.0.1'}).status_code,400)
            with patch.object(yt.subprocess,'run',return_value=subprocess.CompletedProcess([],0,json.dumps(payload))) as worker:
                a=c.post('/api/youtube/import',json={'url':'https://youtu.be/jNQXAC9IVRw?t=5'}).json()
                self.assertEqual(a['start_hint'],5)
                b=c.post('/api/youtube/import',json={'url':'https://youtu.be/jNQXAC9IVRw?t=12'}).json()
                self.assertTrue(b['cached']);self.assertEqual(b['start_hint'],12);self.assertEqual(worker.call_count,1)
            yt._cache.clear()
            with patch.object(yt.subprocess,'run',side_effect=subprocess.TimeoutExpired('test',45)):
                self.assertEqual(c.post('/api/youtube/import',json={'url':'jNQXAC9IVRw'}).status_code,504)
            with patch.object(yt.subprocess,'run',return_value=subprocess.CompletedProcess([],0,json.dumps({'error':'RequestBlocked','message':'Blocked'}))):
                self.assertEqual(c.post('/api/youtube/import',json={'url':'jNQXAC9IVRw'}).status_code,422)
            r=c.post('/api/youtube/subtitles',json={'url':'jNQXAC9IVRw','subtitles':SRT})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'uploaded')
            self.assertEqual(c.post('/api/youtube/subtitles',json={'url':'jNQXAC9IVRw','subtitles':'text'}).status_code,400)

    def test_existing_book_isolation(self):
        import server
        original_db=server.DB
        try:
            with tempfile.TemporaryDirectory(prefix='dictai-youtube-test-') as tmp:
                server.DB=Path(tmp)/'progress.sqlite3'
                with TestClient(server.app,base_url='https://testserver') as c:
                    self.assertEqual(c.post('/api/book',json={'chapter':11}).json()['count'],181)
                    c.post('/api/level',json={'level':18})
                    for path in ('/','/youtube','/youtube-assets/youtube.js','/youtube-assets/youtube-core.mjs','/practice/'):
                        self.assertEqual(c.get(path).status_code,200)
                    self.assertEqual(c.post('/api/youtube/subtitles',json={'url':'jNQXAC9IVRw','subtitles':SRT}).status_code,200)
                    self.assertEqual(c.get('/api/bootstrap').json()['level'],18)
                    self.assertEqual(c.get('/api/bootstrap').json()['chapter'],11)
        finally:server.DB=original_db

    def test_names_component(self):
        with patch.object(yt, 'name_indices', return_value=[0,1]):
            app=FastAPI();app.include_router(yt.router)
            with TestClient(app) as c:
                response=c.post('/api/youtube/names',json={'text':"Mr. Green didn't leave."})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.json()['indices'],[0,1])

if __name__=='__main__':unittest.main()
