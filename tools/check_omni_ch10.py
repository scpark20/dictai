"""Check regenerated Chapter 10 before changing the running service."""
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT=Path('/home/scpark/harry-concise-ch10-omni-v2')
ORIGINAL=Path('/home/scpark/harry-concise-ch10')
REFS=Path('/home/scpark/omni-reference-100-v2/selected')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name in ('ch010.json','ch010-proper-nouns.json'):
    assert sha(ROOT/name)==sha(ORIGINAL/name),name
payload=json.loads((ROOT/'ch010.json').read_text())
rows={b['sentence_ordinal']:b for b in payload['blocks']}
assert len(rows)==151
refs=[set(),set()]
durations=[]
for ordinal,row in rows.items():
    pair=[]
    for take,folder in enumerate(('audio-a','audio-b'),1):
        wav=ROOT/folder/f'{ordinal:04d}.wav'
        r=json.loads(wav.with_suffix('.json').read_text())
        for k in ('sentence_id','sentence_ordinal','display_text','speak_text','display_hash','speak_hash'):
            assert r[k]==row[k],(ordinal,k)
        assert r['engine']=='OmniVoice' and r['take_ordinal']==take
        assert r['sha256']==sha(wav)
        assert r['reference_sha256']==sha(REFS/(r['reference_id']+'.wav'))
        assert r['reference_text_sha256']==sha(REFS/(r['reference_id']+'.txt'))
        a,sr=sf.read(wav)
        assert a.ndim==1 and np.isfinite(a).all() and sr==24000
        assert .3<len(a)/sr<30 and np.sqrt(np.mean(a*a))>.001 and abs(a).max()<.95
        durations.append(len(a)/sr)
        pair.append(r['reference_id']);refs[take-1].add(r['reference_id'])
    assert pair[0]!=pair[1]
assert [len(x) for x in refs]==[100,100]

os.environ['DICTAI_CH10_AUDIO_ROOT']=str(ROOT/'audio-a')
os.environ['DICTAI_CH10_AUDIO_SECOND_ROOT']=str(ROOT/'audio-b')
sys.path.insert(0,'/home/scpark/apps/echostep-dev')
import server
from fastapi.testclient import TestClient
with tempfile.TemporaryDirectory(prefix='ch10-omni-check-') as tmp:
    server.DB=Path(tmp)/'progress.sqlite3'
    with TestClient(server.app,base_url='https://testserver') as c:
        c.post('/api/book',json={'chapter':9})
        c.post('/api/level',json={'level':37})
        assert c.post('/api/book',json={'chapter':10}).json()['count']==151
        for ordinal in (1,4,31,59,68,124,151):
            c.post('/api/level',json={'level':ordinal})
            p=c.post('/api/problem',json={}).json()
            assert p['text']==rows[ordinal]['display_text']
            for take,folder in enumerate(('audio-a','audio-b')):
                response=c.get(f'/api/problem/{p["attempt_id"]}/audio?take={take}')
                assert response.status_code==200
                assert hashlib.sha256(response.content).hexdigest()==sha(ROOT/folder/f'{ordinal:04d}.wav')
        c.post('/api/book',json={'chapter':9})
        assert c.get('/api/bootstrap').json()['level']==37
        c.post('/api/book',json={'chapter':10})
        assert c.get('/api/bootstrap').json()['level']==151
print(json.dumps({'sentences':151,'audio_files':len(durations),'reference_coverage':[len(x) for x in refs],
    'duration_range':[min(durations),max(durations)],'text_audio_progress_checks':'passed'}))
