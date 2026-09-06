"""Chapter 7 release checks. Uses a temporary DB, never live learning progress."""
import hashlib
import json
import sys
import tempfile
from pathlib import Path
import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from dictai_pipeline import load_validated_manifest, validate_proper_nouns

root = Path('/home/scpark/harry-concise-ch7')
payload, rows = load_validated_manifest(root/'ch007.json')
assert len(rows) == 136
assert rows[0]['display_text'] == 'Chapter Seven. The Ministry of Magic.'
validate_proper_nouns(json.loads((root/'ch007-proper-nouns.json').read_text()), rows, label='Chapter 7')
references=[set(),set()]
durations=[]
for row in rows:
    ids=[]
    for take in (1,2):
        folder=root/('audio-a' if take==1 else 'audio-b')
        wav=folder/f"{row['sentence_ordinal']:04d}.wav"
        receipt=json.loads(wav.with_suffix('.json').read_text())
        for field in ('sentence_id','sentence_ordinal','display_text','speak_text','display_hash','speak_hash'):
            assert receipt[field]==row[field],(wav,field)
        assert receipt['take_ordinal']==take
        assert receipt['sha256']==hashlib.sha256(wav.read_bytes()).hexdigest()
        audio,sr=sf.read(wav)
        assert audio.ndim==1 and sr>=16000 and np.isfinite(audio).all(),wav
        duration=len(audio)/sr
        assert .3<duration<40,(wav,duration)
        assert np.sqrt(np.mean(audio**2))>.001 and np.max(np.abs(audio))<.95,wav
        durations.append(duration)
        ids.append(receipt['reference_id']);references[take-1].add(ids[-1])
    assert ids[0]!=ids[1],row['sentence_id']
assert all(len(ids)==100 for ids in references)
with tempfile.TemporaryDirectory(prefix='dictai-ch7-check-') as tmp:
    server.DB=Path(tmp)/'test.sqlite3'
    with TestClient(server.app,base_url='https://testserver') as client:
        assert client.post('/api/book',json={'chapter':6}).status_code==200
        assert client.post('/api/level',json={'level':37}).status_code==200
        assert client.post('/api/book',json={'chapter':7}).json()['count']==136
        assert client.get('/api/bootstrap').json()['level']==1
        for ordinal in (1,6,16,53,100,136):
            assert client.post('/api/level',json={'level':ordinal}).status_code==200
            problem=client.post('/api/problem',json={}).json()
            assert problem['text']==rows[ordinal-1]['source_display_text']
            for take in (0,1):
                response=client.get(f"/api/problem/{problem['attempt_id']}/audio?take={take}",headers={'Range':'bytes=0-43'})
                assert response.status_code==206 and response.content[:4]==b'RIFF'
        assert client.post('/api/level',json={'level':137}).status_code==400
        client.post('/api/book',json={'chapter':6})
        assert client.get('/api/bootstrap').json()['level']==37
        client.post('/api/book',json={'chapter':7})
        assert client.get('/api/bootstrap').json()['level']==136
        server.SELECTED_BOOKS.clear()
        assert client.get('/api/bootstrap').json()['chapter']==7
        assert client.get('/api/bootstrap').json()['level']==136
print(json.dumps({'sentences':len(rows),'audio_files':len(durations),'distinct_references_per_take':[len(x) for x in references], 'min_duration':min(durations),'max_duration':max(durations),'text_hash_audio_and_progress_checks':'passed'}))
