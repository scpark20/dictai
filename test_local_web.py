"""Playback-only migration checks; never modify the imported/live progress DB."""
import json
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
import local_web as local

class LocalWebTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = local.DB, local.PROFILE, local.practice.DB
        local.DB = Path(self.tmp.name) / 'progress.sqlite3'
        shutil.copy2(local.RUNTIME / 'imported-progress.sqlite3', local.DB)
        local.PROFILE = Path(self.tmp.name) / 'profile.json'
        local.practice.DB = local.DB
        local.practice.SELECTED_BOOKS.clear()
        local.practice.SELECTED_COURSES.clear()
        self.client = TestClient(local.app, base_url='http://localhost:8771')
    def tearDown(self):
        self.client.close()
        local.DB, local.PROFILE, local.practice.DB = self.saved
        self.tmp.cleanup()
    def choose(self):
        rows = self.client.get('/local-profiles').json()
        self.assertTrue(rows)
        self.assertNotIn('visitor', rows[0])
        self.assertEqual(self.client.post('/local-profile', json={'id': rows[-1]['id']}).status_code, 200)
    def test_progress_and_books(self):
        self.assertIn('Choose the saved progress', self.client.get('/').text)
        self.choose()
        with sqlite3.connect(local.DB) as db:
            originals = dict(db.execute('SELECT visitor,level FROM progress'))
        key = local.profile_key()
        for n, chapter in local.practice.HARRY_CHAPTERS.items():
            self.assertEqual(self.client.post('/api/book', json={'chapter': n}).status_code, 200)
            expected = originals.get(f'{key}:book:harry-potter-5:chapter:{n}', 1)
            self.assertEqual(self.client.get('/api/bootstrap').json()['level'], expected)
            for ordinal in (1, len(chapter['sentences'])):
                self.client.post('/api/level', json={'level': ordinal})
                response = self.client.post('/api/problem', json={})
                self.assertEqual(response.status_code, 200, response.text)
                problem = response.json()
                self.assertEqual(problem['text'], chapter['sentences'][ordinal-1]['display_text'])
                for take in (0, 1):
                    audio = self.client.get(f"/api/problem/{problem['attempt_id']}/audio?take={take}", headers={'Range':'bytes=0-43'})
                    self.assertEqual(audio.status_code, 206)
                    self.assertEqual(audio.content[:4], b'RIFF')
        for chapter in local.practice.HARRY_CHAPTERS.values():
            for ordinal in range(1, len(chapter['sentences'])+1):
                for field in ('audio', 'audio_second'):
                    self.assertTrue((chapter[field]/f'{ordinal:04d}.wav').is_file())
    def test_all_conversation_categories(self):
        self.choose()
        for language in ('en', 'ko'):
            root = local.practice.KOREAN_CONVERSATION_ROOT if language=='ko' else local.practice.CONVERSATION_ROOT
            for level, topics in local.practice.conversation_catalog(language).items():
                for topic, rows in topics.items():
                    for row in rows:
                        path = (root / row['audio']).resolve()
                        self.assertTrue(path.is_relative_to(root) and path.is_file(), str(path))
                    r = self.client.post('/api/course', json={'language':language,'level':level,'topic':topic})
                    self.assertEqual(r.status_code, 200, r.text)
                    problem = self.client.post('/api/problem', json={}).json()
                    r = self.client.get(f"/api/problem/{problem['attempt_id']}/audio", headers={'Range':'bytes=0-43'})
                    self.assertEqual(r.status_code, 206)
    def test_browser_assets_and_local_boundaries(self):
        self.choose()
        for path in ['/asr-wasm/sherpa-onnx-wasm-main-asr.data', '/asr-wasm/sherpa-onnx-wasm-main-asr-20m.data',
                     '/asr-wasm/sherpa-onnx-wasm-main-asr.wasm', '/vendor/transformers/transformers.min.js',
                     '/vendor/transformers/ort-wasm-simd-threaded.jsep.wasm',
                     '/models/onnx-community/whisper-base/onnx/encoder_model_quantized.onnx',
                     '/models/onnx-community/whisper-base/onnx/decoder_model_merged_quantized.onnx']:
            self.assertEqual(self.client.get(path, headers={'Range':'bytes=0-43'}).status_code, 206, path)
        self.client.post('/api/course',json={'language':'ko','level':'A1','topic':next(iter(local.practice.conversation_catalog('ko')['A1']))})
        script = self.client.get('/practice/persistent-model-loader.js').text
        self.assertIn('env.allowRemoteModels = false', script)
        self.assertNotIn('https://',script)
        self.assertEqual(self.client.get('/api/build-status').status_code,404)
        self.assertEqual(self.client.post('/local-profile',json={'id':-1},headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.get('/local-health',headers={'Host':'evil.example'}).status_code,400)

if __name__=='__main__': unittest.main(verbosity=2)
