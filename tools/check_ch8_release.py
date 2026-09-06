"""Chapter 8 checks, isolated from real users' learning progress."""
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
from tools.build_harry_chapter import pdf_sentences, tts_sentences

root = Path('/home/scpark/harry-concise-ch8')
payload, rows = load_validated_manifest(root / 'ch008.json')
assert len(rows) == 161
assert rows[0]['display_text'] == 'Chapter Eight. The Hearing.'
assert payload['counts'] == {'sentences': 161, 'body_sentences': 160, 'takes': 322}
source_pdf, source_tts = root / 'source/reader.pdf', root / 'source/tts.txt'
assert payload['source']['pdf_sha256'] == hashlib.sha256(source_pdf.read_bytes()).hexdigest()
assert payload['source']['tts_sha256'] == hashlib.sha256(source_tts.read_bytes()).hexdigest()
assert [r['display_text'] for r in rows[1:]] == pdf_sentences(source_pdf, 72, 79, 160)
assert [r['speak_text'] for r in rows[1:]] == tts_sentences(
    source_tts, 'Chapter Eight. The Hearing.',
    'Chapter Nine. The Woes of Missus Weez-lee.', 160)
proper = json.loads((root / 'ch008-proper-nouns.json').read_text())
validate_proper_nouns(proper, rows, label='Chapter 8')
# Catch pronunciation-script leakage and errors around past-tense read/color red.
assert rows[33]['display_text'] == 'Fudge slowly read the official charges aloud.'
assert rows[71]['display_text'] == 'Mrs. Figg corrected herself with a red face.'
assert rows[59]['display_text'] == 'At last, Fudge called Mrs. Figg inside.'
for ordinal, names in ((21, {'Dolores', 'Umbridge'}), (59, {'Mrs', 'Figg'}),
                       (122, {'Dursleys'}), (147, {'Wizengamot'})):
    row = rows[ordinal]
    words = server.WORD_RE.findall(row['display_text'])
    indices = proper['sentences'][row['sentence_id']]['proper_noun_indices']
    assert names <= {words[i].removesuffix("'s") for i in indices}, (ordinal, words, indices)

references = [set(), set()]
durations = []
for row in rows:
    ids = []
    for take in (1, 2):
        wav = root / ('audio-a' if take == 1 else 'audio-b') / f"{row['sentence_ordinal']:04d}.wav"
        receipt = json.loads(wav.with_suffix('.json').read_text())
        for field in ('sentence_id', 'sentence_ordinal', 'display_text', 'speak_text', 'display_hash', 'speak_hash'):
            assert receipt[field] == row[field], (wav, field)
        assert receipt['take_ordinal'] == take
        assert receipt['sha256'] == hashlib.sha256(wav.read_bytes()).hexdigest()
        audio, sr = sf.read(wav)
        assert audio.ndim == 1 and sr >= 16000 and np.isfinite(audio).all(), wav
        duration = len(audio) / sr
        assert .3 < duration < 40, (wav, duration)
        assert np.sqrt(np.mean(audio ** 2)) > .001 and np.max(np.abs(audio)) < .95, wav
        durations.append(duration)
        ids.append(receipt['reference_id'])
        references[take - 1].add(ids[-1])
    assert ids[0] != ids[1], row['sentence_id']
assert all(len(ids) == 100 for ids in references)

with tempfile.TemporaryDirectory(prefix='dictai-ch8-check-') as tmp:
    server.DB = Path(tmp) / 'test.sqlite3'
    with TestClient(server.app, base_url='https://testserver') as client:
        assert client.post('/api/book', json={'chapter': 7}).status_code == 200
        assert client.post('/api/level', json={'level': 37}).status_code == 200
        assert client.post('/api/book', json={'chapter': 8}).json()['count'] == 161
        assert client.get('/api/bootstrap').json()['level'] == 1
        for ordinal in (1, 4, 22, 34, 60, 72, 123, 148, 161):
            assert client.post('/api/level', json={'level': ordinal}).status_code == 200
            problem = client.post('/api/problem', json={}).json()
            assert problem['text'] == rows[ordinal - 1]['source_display_text']
            for take in (0, 1):
                response = client.get(f"/api/problem/{problem['attempt_id']}/audio?take={take}", headers={'Range': 'bytes=0-43'})
                assert response.status_code == 206 and response.content[:4] == b'RIFF'
        assert client.post('/api/level', json={'level': 162}).status_code == 400
        client.post('/api/book', json={'chapter': 7})
        assert client.get('/api/bootstrap').json()['level'] == 37
        client.post('/api/book', json={'chapter': 8})
        assert client.get('/api/bootstrap').json()['level'] == 161
        server.SELECTED_BOOKS.clear()
        assert client.get('/api/bootstrap').json()['chapter'] == 8
        assert client.get('/api/bootstrap').json()['level'] == 161

print(json.dumps({'sentences': len(rows), 'audio_files': len(durations),
    'distinct_references_per_take': [len(x) for x in references],
    'min_duration': min(durations), 'max_duration': max(durations),
    'source_text_audio_and_progress_checks': 'passed'}))
