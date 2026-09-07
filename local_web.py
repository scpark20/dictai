"""Local-only DictAI playback runtime. No TTS worker, GPU or remote server required."""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('DICTAI_LOCAL_DATA', ROOT / 'runtime')).resolve()
DB = RUNTIME / 'progress.sqlite3'
PROFILE = RUNTIME / 'local-profile.json'

# Set every active content dependency before the legacy web module is imported.
os.environ['DICTAI_ASR_WASM_ROOT'] = str(RUNTIME / 'asr-wasm')
os.environ['DICTAI_ASR_WASM_KO_ROOT'] = str(RUNTIME / 'asr-wasm-ko')
os.environ['DICTAI_CONVERSATION_ROOT'] = str(RUNTIME / 'conversation')
os.environ['DICTAI_KOREAN_CONVERSATION_ROOT'] = str(RUNTIME / 'conversation-ko')
os.environ['DICTAI_GREETINGS_AUDIO_ROOT'] = str(RUNTIME / 'conversation')
os.environ['DICTAI_CH3_ACCEPTED_AUDIO_ROOT'] = str(RUNTIME / 'chapters/3/audio-a')
for chapter in range(3, 10):
    folder = RUNTIME / 'chapters' / str(chapter)
    for suffix, name in [('MANIFEST', 'manifest.json'), ('PROPER_NOUNS', 'proper-nouns.json'),
                         ('AUDIO_ROOT', 'audio-a'), ('AUDIO_SECOND_ROOT', 'audio-b')]:
        os.environ[f'DICTAI_CH{chapter}_{suffix}'] = str(folder / name)

if not DB.exists():
    imported = RUNTIME / 'imported-progress.sqlite3'
    if imported.exists():
        with sqlite3.connect(imported) as src, sqlite3.connect(DB) as dst:
            src.backup(dst)

import server as practice  # noqa: E402

practice.DB = DB
practice.KOREAN_WHISPER_LOADER = practice.KOREAN_WHISPER_LOADER.replace(
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js',
    '/vendor/transformers/transformers.min.js',
).replace('env.allowLocalModels = false;', '''env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = '/models/';
    env.backends.onnx.wasm.wasmPaths = '/vendor/transformers/';''')

def profile_key() -> str | None:
    if PROFILE.exists():
        return json.loads(PROFILE.read_text())['visitor']
    return None

def local_visitor(_request: Request) -> str:
    key = profile_key()
    if not key:
        raise HTTPException(409, 'Choose your imported progress at /local-setup first.')
    return key

practice.visitor = local_visitor

def profiles() -> list[dict]:
    if not DB.exists():
        return []
    with sqlite3.connect(DB) as db:
        db.execute('CREATE TABLE IF NOT EXISTS progress(visitor TEXT PRIMARY KEY, level INTEGER NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS selection(visitor TEXT PRIMARY KEY, mode TEXT NOT NULL, language TEXT, course_level TEXT, topic TEXT, chapter INTEGER)')
        keys = [r[0] for r in db.execute('SELECT visitor FROM selection ORDER BY rowid')]
        result = []
        for index, key in enumerate(keys):
            positions = db.execute('SELECT visitor,level FROM progress WHERE visitor LIKE ?', (key + ':%',)).fetchall()
            book = []
            for path, level in positions:
                if ':book:harry-potter-5:chapter:' in path:
                    book.append({'chapter': int(path.rsplit(':', 1)[1]), 'sentence': level})
            result.append({'id': index, 'visitor': key, 'books': sorted(book, key=lambda x:x['chapter']),
                           'saved_positions': len(positions)})
        return result

app = FastAPI(title='DictAI Local Web', docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])

@app.middleware('http')
async def local_only(request: Request, call_next):
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origin = request.headers.get('origin')
        if origin and urlsplit(origin).netloc != request.url.netloc:
            return JSONResponse({'detail': 'Cross-origin writes are not allowed'}, status_code=403)
    if request.url.path in ('/', '/practice', '/practice/') and not profile_key():
        return RedirectResponse('/local-setup')
    # Generation/status routes are deliberately absent from this playback-only deployment.
    if request.url.path in ('/build-status', '/build-status/', '/api/build-status'):
        return JSONResponse({'detail': 'This local runtime has no generation service.'}, status_code=404)
    response = await call_next(request)
    response.headers['Content-Security-Policy'] = "connect-src 'self'; media-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'"
    return response

@app.get('/local-health')
def health():
    return {'product': 'DictAI', 'mode': 'local-only', 'chapters': list(practice.HARRY_CHAPTERS),
            'profile_selected': profile_key() is not None}

@app.get('/local-setup')
def setup_page():
    return FileResponse(ROOT / 'local-setup.html')

@app.get('/local-profiles')
def get_profiles():
    return [{k:v for k,v in row.items() if k != 'visitor'} for row in profiles()]

class ProfileChoice(BaseModel):
    id: int

@app.post('/local-profile')
def choose_profile(body: ProfileChoice):
    options = profiles()
    if body.id == -1:
        key = 'local:default'
    elif 0 <= body.id < len(options):
        key = options[body.id]['visitor']
    else:
        raise HTTPException(400, 'Unknown saved profile')
    temporary = PROFILE.with_suffix('.tmp')
    temporary.write_text(json.dumps({'visitor': key}) + '\n')
    temporary.replace(PROFILE)
    practice.SELECTED_BOOKS.clear()
    practice.SELECTED_COURSES.clear()
    return {'ok': True}

app.mount('/vendor/transformers', StaticFiles(directory=RUNTIME / 'vendor/transformers/dist'), name='transformers')
app.mount('/models', StaticFiles(directory=RUNTIME / 'models'), name='browser-models')
app.mount('/', practice.app)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8771)
