"""Chapter 11 structural/playback checks; no spoken-script accuracy scoring."""
from pathlib import Path
import sys, json, hashlib, tempfile, os
import numpy as np
import soundfile as sf
sys.path.insert(0,'/home/scpark/apps/dictai-ch11')
import server
from fastapi.testclient import TestClient
from dictai_pipeline import load_validated_manifest, validate_proper_nouns

root=Path('/home/scpark/harry-concise-ch11')
refs=Path('/home/scpark/harry-concise-ch10-omni-repair/references')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
payload,rows=load_validated_manifest(root/'ch011.json')
assert len(rows)==181
assert rows[0]['display_text']=="Chapter Eleven. The Sorting Hat's New Song."
proper=json.loads((root/'ch011-proper-nouns.json').read_text())
validate_proper_nouns(proper,rows,label='Chapter 11')
assert rows[-1]['display_text']=='The enemy was using distance before using spells.'
ref_ids=[set(),set()]
for row in rows:
    paired=[]
    for take,folder in enumerate(('audio-a','audio-b'),1):
        p=root/folder/f"{row['sentence_ordinal']:04d}.wav"
        rec=json.loads(p.with_suffix('.json').read_text())
        for k in ('sentence_id','sentence_ordinal','display_text','speak_text','display_hash','speak_hash'):
            assert rec[k]==row[k]
        assert rec['engine']=='OmniVoice' and rec['speech_check']['speech_detected'] is True
        assert rec['sha256']==sha(p) and rec['reference_sha256']==sha(refs/(rec['reference_id']+'.wav'))
        assert rec['take_ordinal']==take
        a,sr=sf.read(p)
        assert sr==24000 and a.ndim==1 and np.isfinite(a).all() and .3<len(a)/sr<30
        paired.append(rec['reference_id']);ref_ids[take-1].add(rec['reference_id'])
    assert paired[0]!=paired[1]
assert [len(x) for x in ref_ids]==[100,100]

with tempfile.TemporaryDirectory(prefix='ch11-check-') as tmp:
    server.DB=Path(tmp)/'progress.sqlite3'
    with TestClient(server.app,base_url='https://testserver') as c:
        c.post('/api/book',json={'chapter':10});c.post('/api/level',json={'level':37})
        assert c.post('/api/book',json={'chapter':11}).json()['count']==181
        assert c.get('/api/bootstrap').json()['level']==1
        for ordinal in (1,2,22,33,37,62,132,134,139,181):
            c.post('/api/level',json={'level':ordinal})
            p=c.post('/api/problem',json={}).json()
            assert p['text']==rows[ordinal-1]['display_text']
            for take,folder in enumerate(('audio-a','audio-b')):
                r=c.get(f"/api/problem/{p['attempt_id']}/audio?take={take}")
                assert r.status_code==200 and hashlib.sha256(r.content).hexdigest()==sha(root/folder/f'{ordinal:04d}.wav')
        assert c.post('/api/level',json={'level':182}).status_code==400
        c.post('/api/book',json={'chapter':10});assert c.get('/api/bootstrap').json()['level']==37
        c.post('/api/book',json={'chapter':11});assert c.get('/api/bootstrap').json()['level']==181
        server.SELECTED_BOOKS.clear();assert c.get('/api/bootstrap').json()['chapter']==11
print(json.dumps({'sentences':181,'audio':362,'speech_presence':'all passed','references_per_take':[100,100],
    'playback_progress_checks':'passed','spoken_script_comparison':'not performed'}))
