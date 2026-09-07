"""Chapter 9 checks, isolated from real users' learning progress."""
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

root = Path('/home/scpark/harry-concise-ch9')
payload, rows = load_validated_manifest(root / 'ch009.json')
assert len(rows) == 221
assert rows[0]['display_text'] == 'Chapter Nine. The Woes of Mrs. Weasley.'
assert rows[0]['speak_text'] == 'Chapter Nine. The Woes of Missus Weez-lee.'
assert payload['counts'] == {'sentences': 221, 'body_sentences': 220, 'takes': 442}
source_pdf, source_tts = root / 'source/reader.pdf', root / 'source/tts.txt'
assert payload['source']['pdf_sha256'] == hashlib.sha256(source_pdf.read_bytes()).hexdigest()
assert payload['source']['tts_sha256'] == hashlib.sha256(source_tts.read_bytes()).hexdigest()
assert [r['display_text'] for r in rows[1:]] == pdf_sentences(source_pdf, 80, 91, 220)
assert [r['speak_text'] for r in rows[1:]] == tts_sentences(
    source_tts, 'Chapter Nine. The Woes of Missus Weez-lee.',
    'Chapter Ten. Luna Lovegood.', 220)
proper = json.loads((root / 'ch009-proper-nouns.json').read_text())
validate_proper_nouns(proper, rows, label='Chapter 9')
# Both the title and body must retain canonical names, never TTS spelling.
assert rows[50]['display_text'] == 'Mrs. Weasley wiped joyful tears from her face.'
assert rows[220]['display_text'] == 'However, war now stood behind all of them.'
for ordinal, names in ((0, {'Mrs', 'Weasley'}), (46, {'Grimmauld', 'Place'}),
                       (110, {'Quirrell'}), (160, {'Gideon', 'Fabian', 'Prewett'})):
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

with tempfile.TemporaryDirectory(prefix='dictai-ch9-check-') as tmp:
    server.DB = Path(tmp) / 'test.sqlite3'
    with TestClient(server.app, base_url='https://testserver') as client:
        assert client.post('/api/book', json={'chapter': 8}).status_code == 200
        assert client.post('/api/level', json={'level': 37}).status_code == 200
        assert client.post('/api/book', json={'chapter': 9}).json()['count'] == 221
        assert client.get('/api/bootstrap').json()['level'] == 1
        for ordinal in (1, 6, 39, 47, 51, 82, 111, 161, 221):
            assert client.post('/api/level', json={'level': ordinal}).status_code == 200
            problem = client.post('/api/problem', json={}).json()
            assert problem['text'] == rows[ordinal - 1]['source_display_text']
            for take in (0, 1):
                response = client.get(f"/api/problem/{problem['attempt_id']}/audio?take={take}", headers={'Range': 'bytes=0-43'})
                assert response.status_code == 206 and response.content[:4] == b'RIFF'
        assert client.post('/api/level', json={'level': 222}).status_code == 400
        client.post('/api/book', json={'chapter': 8})
        assert client.get('/api/bootstrap').json()['level'] == 37
        client.post('/api/book', json={'chapter': 9})
        assert client.get('/api/bootstrap').json()['level'] == 221
        server.SELECTED_BOOKS.clear()
        assert client.get('/api/bootstrap').json()['chapter'] == 9
        assert client.get('/api/bootstrap').json()['level'] == 221

print(json.dumps({'sentences': len(rows), 'audio_files': len(durations),
    'distinct_references_per_take': [len(x) for x in references],
    'min_duration': min(durations), 'max_duration': max(durations),
    'source_text_audio_and_progress_checks': 'passed'}))
