"""Read-only production-content smoke checks, run on the game server."""
import hashlib
import ssl
import unittest
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://192.168.0.68:8775'

class GameSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        context = ssl.create_default_context(cafile=str(ROOT/'certs/server.crt'))
        cls.client = httpx.Client(base_url=URL, verify=context, timeout=30)
    @classmethod
    def tearDownClass(cls):
        cls.client.close()
    def test_all_levels_and_book_chapters(self):
        catalog=self.client.get('/game-api/catalog').json()
        cases=[dict(mode='conversation', level=level, topic='Random', count=2) for level in catalog['levels']]
        cases += [dict(mode='book',chapter=b['chapter'],count=2) for b in catalog['books']]
        for selection in cases:
            with self.subTest(selection=selection):
                response=self.client.post('/game-api/round',json=selection)
                self.assertEqual(response.status_code,200,response.text[:180])
                rows=response.json()['questions']
                self.assertGreater(len(rows),0)
                self.assertLessEqual(len(rows),2)
                self.assertEqual(len({q['id'] for q in rows}),len(rows))
                for q in rows:
                    self.assertTrue(q['words'])
                    self.assertGreater(q['duration'],0)
                    if q['turn_lengths']:
                        self.assertEqual(sum(q['turn_lengths']),len(q['words']))
                    audio=self.client.get(q['audio'],headers={'Range':'bytes=0-43'})
                    self.assertEqual(audio.status_code,206)
                    self.assertEqual(audio.content[:4],b'RIFF')
    def test_invalid_selection_and_paths(self):
        for body in [dict(mode='invalid'),dict(mode='book',chapter=999),dict(level='ZZ'),dict(count=21),dict(count=0),dict(topic='../secrets')]:
            self.assertGreaterEqual(self.client.post('/game-api/round',json=body).status_code,400)
        for url in ['/game-api/audio?mode=book&chapter=5&index=-1','/game-api/audio?mode=book&chapter=5&index=999999','/game/not-a-file','/game-api/audio?mode=conversation&topic=../../etc/passwd&index=0']:
            self.assertGreaterEqual(self.client.get(url).status_code,400)
    def test_game_does_not_write_practice_progress(self):
        database=Path('/home/scpark/apps/echostep-dev/progress.sqlite3')
        before=hashlib.sha256(database.read_bytes()).hexdigest()
        self.client.post('/game-api/round',json=dict(mode='book',chapter=5,count=1))
        self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(),before)
    def test_routes_and_assets(self):
        for path in ['/game','/game/game.js','/game/core.js','/game/voice.js','/game/game.css','/game/assets/sky.png','/game/assets/bubbles.png','/game/assets/neon.png','/game/assets/space.png','/game-voice-loader.js','/game-voice-bootstrap.js']:
            with self.subTest(path=path):
                r=self.client.get(path)
                self.assertEqual(r.status_code,200)
                self.assertGreater(len(r.content),100)
        home=self.client.get('/').text
        self.assertLess(home.index('🎮 Game Mode'),home.index('id="conversationPath"'))
    def test_live_main_source_is_untouched(self):
        for file in ['server.py','app.js','styles.css','index.html','practice-ui/app.js']:
            self.assertEqual((ROOT/file).read_bytes(),(Path('/home/scpark/apps/echostep-dev')/file).read_bytes())
    def test_voice_runtime_assets_and_isolated_settings(self):
        for filename in ['sherpa-onnx-asr.js','sherpa-onnx-wasm-main-asr.js','sherpa-onnx-wasm-main-asr-20m.js','sherpa-onnx-wasm-main-asr.wasm','sherpa-onnx-wasm-main-asr.data','sherpa-onnx-wasm-main-asr-20m.data']:
            response=self.client.get('/asr-wasm/'+filename,headers={'Range':'bytes=0-43'})
            self.assertEqual(response.status_code,206,filename)
            self.assertEqual(len(response.content),44)
        loader=self.client.get('/game-voice-loader.js').text
        bootstrap=self.client.get('/game-voice-bootstrap.js').text
        self.assertIn('dictai-game-voice-model',loader)
        self.assertIn('dictai-game-voice-settings',bootstrap)
        self.assertNotIn('localStorage.getItem("echostep-voice-',loader+bootstrap)

if __name__=='__main__':
    unittest.main(verbosity=2)
