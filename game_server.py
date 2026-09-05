"""Isolated Game Mode: content is read-only; no practice progress writes."""
import random
import re
import soundfile as sf
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import server as practice

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="DictAI Game Mode")
app.mount('/game/assets', StaticFiles(directory=ROOT / 'game/assets'), name='game-assets')
TOKENS = re.compile(r"(?:Mr|Mrs|Ms|Dr|Prof|St)\.|[A-Za-z]+(?:['’\-][A-Za-z]+)*|[가-힣]+|[0-9]+", re.I)

class RoundRequest(BaseModel):
    mode: str = 'conversation'
    language: str = 'en'
    level: str = 'A1'
    topic: str = 'Random'
    chapter: int = 5
    count: int = Field(default=20, ge=1, le=20)

def content(mode, language='en', level='A1', topic='Random', chapter=5):
    if mode == 'book':
        if chapter not in practice.HARRY_CHAPTERS:
            raise HTTPException(404, 'Chapter not found')
        book = practice.HARRY_CHAPTERS[chapter]
        for i, row in enumerate(book['sentences']):
            path = (book['audio'] / f'{i+1:04d}.wav').resolve()
            if path.is_file() and path.is_relative_to(book['audio'].resolve()):
                yield {'id': f'book-{chapter}-{i+1}', 'text': row['display_text'], 'turns': [],
                       'label': f'Chapter {chapter} · Sentence {i+1}', 'path': path,
                       'audio': f'/game-api/audio?mode=book&chapter={chapter}&index={i}'}
    elif mode == 'conversation':
        if language not in ('en', 'ko'):
            raise HTTPException(400, 'Unsupported language')
        from urllib.parse import urlencode
        topics = practice.conversation_catalog(language).get(level)
        if topics is None:
            raise HTTPException(404, 'Level not found')
        if topic != 'Random' and topic not in topics:
            raise HTTPException(404, 'Topic not found')
        root = practice.KOREAN_CONVERSATION_ROOT if language == 'ko' else practice.CONVERSATION_ROOT
        for name, rows in topics.items():
            if topic != 'Random' and name != topic:
                continue
            for i, row in enumerate(rows):
                path = (root / row['audio']).resolve()
                if path.is_file() and path.is_relative_to(root.resolve()):
                    yield {'id': f'conversation-{language}-{level}-{name}-{i}', 'text': row['text'],
                           'turns': row.get('turns', []), 'label': f'{level} · {name}', 'path': path,
                           'audio': '/game-api/audio?' + urlencode(dict(mode=mode, language=language, level=level, topic=name, index=i))}
    else:
        raise HTTPException(400, 'Unsupported mode')

@app.get('/game-api/catalog')
def catalog():
    levels = practice.conversation_catalog('en')
    return {'levels': {level: list(topics) for level, topics in levels.items()},
            'books': [{'chapter': n, 'title': c['title']} for n,c in practice.HARRY_CHAPTERS.items()]}

@app.post('/game-api/round')
def new_round(body: RoundRequest):
    rows = list(content(body.mode, body.language, body.level, body.topic, body.chapter))
    if not rows:
        raise HTTPException(503, 'No ready audio in this selection. Choose another topic.')
    chosen = random.sample(rows, min(len(rows), body.count))
    result = []
    for row in chosen:
        try:
            duration = sf.info(str(row['path'])).duration
        except (RuntimeError, OSError):
            continue
        words = TOKENS.findall(row['text'])
        if not words:
            continue
        row.pop('path')
        row.update(words=words, duration=duration, turn_lengths=[len(TOKENS.findall(t)) for t in row['turns']])
        result.append(row)
    if not result:
        raise HTTPException(503, 'Audio could not be read. Choose another topic.')
    return {'questions': result, 'available': len(rows), 'version': 1}

@app.get('/game-api/audio')
def audio(mode: str, language: str = 'en', level: str = 'A1', topic: str = 'Random', chapter: int = 5, index: int = Query(ge=0)):
    if mode == 'book':
        if chapter not in practice.HARRY_CHAPTERS:
            raise HTTPException(404)
        book = practice.HARRY_CHAPTERS[chapter]
        if index >= len(book['sentences']):
            raise HTTPException(404)
        root = book['audio'].resolve()
        path = (root / f'{index+1:04d}.wav').resolve()
    elif mode == 'conversation' and language in ('en', 'ko'):
        rows = practice.conversation_catalog(language).get(level, {}).get(topic, [])
        if index >= len(rows):
            raise HTTPException(404)
        root = (practice.KOREAN_CONVERSATION_ROOT if language == 'ko' else practice.CONVERSATION_ROOT).resolve()
        path = (root / rows[index]['audio']).resolve()
    else:
        raise HTTPException(404)
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path, media_type='audio/wav', headers={'Cache-Control': 'private, max-age=86400'})

@app.get('/game')
@app.get('/game/')
def game_page():
    return FileResponse(ROOT / 'game/index.html', headers={'Cache-Control':'no-store'})

@app.get('/game/{name}')
def game_file(name: str):
    if name not in {'game.js','core.js','voice.js','game.css'}:
        raise HTTPException(404)
    return FileResponse(ROOT / 'game' / name, headers={'Cache-Control':'no-store'})

# Isolated loader retains the existing Zipformer implementation and browser cache.
@app.get('/game-voice-loader.js')
def voice_loader():
    source = (ROOT / 'practice-ui/persistent-model-loader.js').read_text()
    source = source.replace('"dictai-voice-model"', '"dictai-game-voice-model"')
    source = source.replace(' || localStorage.getItem("echostep-voice-model")', '')
    source = source.replace('/wasm-asr-bootstrap.js?v=20260904-voice-restore-1', '/game-voice-bootstrap.js')
    return Response(source, media_type='application/javascript')

@app.get('/game-voice-bootstrap.js')
def voice_bootstrap():
    source = (ROOT / 'practice-ui/wasm-asr-bootstrap.js').read_text().replace('"dictai-voice-settings"', '"dictai-game-voice-settings"')
    source = source.replace(' || localStorage.getItem("echostep-voice-settings")', '')
    return Response(source, media_type='application/javascript')

@app.get('/')
def home():
    source = (ROOT / 'index.html').read_text()
    source = source.replace('<section class="paths"', '<a href="/game" style="display:block;margin:16px 0;padding:18px;border-radius:18px;background:#174bde;color:white;text-decoration:none;font-weight:800">🎮 Game Mode <span style="float:right">Play →</span></a><section class="paths"', 1)
    return Response(source, media_type='text/html', headers={'Cache-Control':'no-store'})

app.mount('/', practice.app)
