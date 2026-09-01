"""Harry Potter Chapter 3 sequential dictation server."""

from __future__ import annotations

import json
import random
import re
import sqlite3
import threading
import uuid
import urllib.request
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
PRACTICE_ROOT = Path("/home/scpark/apps/harry-dictation")
MANIFEST = Path("/home/scpark/4repeat/jobs/ch003-the-advanced-guard/manifest/ch003.json")
PROPER_NOUNS = ROOT / "data" / "ch003-proper-nouns.json"
AUDIO_ROOT = Path("/home/scpark/4repeat/jobs/ch003-the-advanced-guard/runtime/accepted-takes/ch003")
CYCLING_AUDIO_ROOT = Path("/home/scpark/harry-dictation-data/chapter3-audio")
SECOND_AUDIO_ROOT = Path("/home/scpark/harry-dictation-data/chapter3-audio-b")
GREETINGS_AUDIO_ROOT = Path("/home/scpark/harry-dictation-data/a1-greetings")
CONVERSATION_ROOT = Path("/home/scpark/echostep-data/conversation")
CONVERSATION_CATALOG_PATH = CONVERSATION_ROOT / "catalog.json"
KOREAN_CONVERSATION_ROOT = Path("/home/scpark/echostep-data/conversation-ko")
DB = ROOT / "progress.sqlite3"
SPEAKER_CYCLE = ("M1", "F1", "M2", "F2")
WORD_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")
LEARNING_WORD_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*|[가-힣]+|[0-9]+")
GREETINGS = [
    ("Hi, I'm Emma. Hello, I'm Daniel.", "AF", "AM"),
    ("Good morning! Good morning. How are you?", "AF", "AM"),
    ("I'm fine, thank you. That's great to hear.", "AF", "AM"),
    ("Nice to meet you. Nice to meet you, too.", "AF", "AM"),
    ("What's your name? My name is Alex.", "AF", "AM"),
    ("Where are you from? I'm from Canada.", "AF", "AM"),
    ("How is your day? It's going well, thanks.", "AF", "AM"),
    ("Good to see you again. It's good to see you, too.", "AF", "AM"),
    ("Have a nice day! Thanks. You, too!", "AF", "AM"),
    ("Goodbye. See you tomorrow. Bye! See you then.", "AF", "AM"),
]
GREETING_TURNS = [
    ("Hi, I'm Emma.", "Hello, I'm Daniel."),
    ("Good morning!", "Good morning. How are you?"),
    ("I'm fine, thank you.", "That's great to hear."),
    ("Nice to meet you.", "Nice to meet you, too."),
    ("What's your name?", "My name is Alex."),
    ("Where are you from?", "I'm from Canada."),
    ("How is your day?", "It's going well, thanks."),
    ("Good to see you again.", "It's good to see you, too."),
    ("Have a nice day!", "Thanks. You, too!"),
    ("Goodbye. See you tomorrow.", "Bye! See you then."),
]
GREETING_VOICE_PAIRS = [
    ("AF", "AM"), ("AM", "AF"), ("AM", "BM"), ("AF", "BF"), ("BF", "BM"),
    ("BM", "AF"), ("AM", "BM"), ("BF", "AF"), ("BM", "BF"), ("AF", "AM"),
]
def load_sentences() -> list[dict]:
    source = json.loads(MANIFEST.read_text(encoding="utf-8"))
    unique: dict[str, dict] = {}
    for block in source["blocks"]:
        unique.setdefault(block["sentence_id"], block)
    rows = sorted(unique.values(), key=lambda item: item["sentence_ordinal"])
    if len(rows) != 641:
        raise RuntimeError(f"expected 641 sentences, found {len(rows)}")
    return rows


SENTENCES = load_sentences()
PROPER_NOUN_METADATA = (
    json.loads(PROPER_NOUNS.read_text(encoding="utf-8")).get("sentences", {})
    if PROPER_NOUNS.is_file()
    else {}
)
ATTEMPTS: dict[str, dict] = {}
SELECTED_COURSES: dict[str, tuple[str, str, str]] = {}
LOCK = threading.RLock()
app = FastAPI(title="Harry Potter Chapter 3 Dictation")
app.mount("/asr-wasm", StaticFiles(directory=ROOT / "asr-wasm"), name="asr-wasm")
app.mount("/asr-wasm-ko", StaticFiles(directory=ROOT / "asr-wasm-ko"), name="asr-wasm-ko")


@app.middleware("http")
async def no_store(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/asr-wasm/", "/asr-wasm-ko/")):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


class LevelBody(BaseModel):
    level: int


class LanguageBody(BaseModel):
    target_language: str = "ko"


class CompleteBody(BaseModel):
    answers: list[str]


class CourseBody(BaseModel):
    language: str = "en"
    level: str
    topic: str


def conversation_catalog(language: str = "en") -> dict:
    path = (KOREAN_CONVERSATION_ROOT if language == "ko" else CONVERSATION_ROOT) / "catalog.json"
    if not path.is_file():
        raise HTTPException(503, "Conversation content is still being prepared.")
    return json.loads(path.read_text(encoding="utf-8"))["levels"]


def selected_course(request: Request) -> tuple[str, str, str]:
    return SELECTED_COURSES.get(visitor(request), ("en", "A1", "Greetings"))


def visitor(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def db_level(key: str) -> int:
    with sqlite3.connect(DB) as db:
        db.execute("CREATE TABLE IF NOT EXISTS progress(visitor TEXT PRIMARY KEY, level INTEGER NOT NULL)")
        row = db.execute("SELECT level FROM progress WHERE visitor=?", (key,)).fetchone()
        return min(5, max(1, int(row[0]))) if row else 1


def set_level(key: str, level: int) -> None:
    with sqlite3.connect(DB) as db:
        db.execute("CREATE TABLE IF NOT EXISTS progress(visitor TEXT PRIMARY KEY, level INTEGER NOT NULL)")
        db.execute(
            "INSERT INTO progress(visitor,level) VALUES(?,?) ON CONFLICT(visitor) DO UPDATE SET level=excluded.level",
            (key, level),
        )


def get_attempt(attempt_id: str, request: Request) -> dict:
    with LOCK:
        attempt = ATTEMPTS.get(attempt_id)
    if not attempt or attempt["visitor"] != visitor(request):
        raise HTTPException(404, "The sentence could not be found.")
    return attempt


@app.get("/api/bootstrap")
def bootstrap(request: Request) -> dict:
    language, course_level, topic = selected_course(request)
    return {"level": db_level(visitor(request)), "max_level": 5, "max_words": 100, "learning_language": language, "course_level": course_level, "topic": topic}


@app.post("/api/course")
def select_course(body: CourseBody, request: Request) -> dict:
    if body.language not in {"en", "ko"}:
        raise HTTPException(400, "Unsupported learning language.")
    catalog = conversation_catalog(body.language)
    if body.level not in catalog:
        raise HTTPException(404, "Level not found.")
    topics = catalog[body.level]
    topic = body.topic
    if topic in {"Random", "무작위"}:
        topic = random.choice(list(topics))
    if topic not in topics:
        raise HTTPException(404, "Topic not found.")
    SELECTED_COURSES[visitor(request)] = (body.language, body.level, topic)
    set_level(visitor(request), random.randint(1, 5))
    return {"level": body.level, "topic": topic, "count": 5}


@app.get("/api/build-status")
def build_status() -> dict:
    references = {}
    reference_root = Path("/home/scpark/harry-dictation-data/references")
    for group in ("AM", "AF", "BM", "BF"):
        references[group] = len(list((reference_root / group).glob("*.wav")))
    generated = len(list(CYCLING_AUDIO_ROOT.glob("[0-9][0-9][0-9][0-9].wav")))
    generated_second = len(list(SECOND_AUDIO_ROOT.glob("[0-9][0-9][0-9][0-9].wav")))
    workers = []
    for port in range(8090, 8098):
        ready = False
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=0.25) as response:
                ready = json.loads(response.read()).get("model_loaded") is True
        except Exception:
            pass
        workers.append({"port": port, "ready": ready})
    return {
        "references": references,
        "reference_total": sum(references.values()),
        "reference_target": 100,
        "soulx_workers": workers,
        "soulx_ready": sum(1 for worker in workers if worker["ready"]),
        "audio_completed": generated,
        "audio_target": 641,
        "audio_second_completed": generated_second,
        "audio_second_target": 641,
        "app_url": "https://192.168.0.68:8771/",
        "app_ready": True,
    }


@app.post("/api/level")
def change_level(body: LevelBody, request: Request) -> dict:
    if not 1 <= body.level <= 5:
        raise HTTPException(400, "The conversation number must be between 1 and 5.")
    set_level(visitor(request), body.level)
    return {"current_level": body.level}


@app.post("/api/problem")
def create_problem(body: LanguageBody, request: Request) -> dict:
    key = visitor(request)
    level = db_level(key)
    language, course_level, topic = selected_course(request)
    root = KOREAN_CONVERSATION_ROOT if language == "ko" else CONVERSATION_ROOT
    item = conversation_catalog(language)[course_level][topic][level - 1]
    text = item["text"]
    proper_noun_indices = []
    speaker = "A+B"
    audio = (root / item["audio"]).resolve()
    allowed = audio.is_relative_to(root.resolve())
    if not audio.is_file() or not allowed:
        raise HTTPException(503, "Audio for this sentence is not ready yet.")
    attempt_id = uuid.uuid4().hex
    attempt = {
        "visitor": key,
        "level": level,
        "text": text,
        "answers": LEARNING_WORD_RE.findall(text),
        "audio": audio,
        "audio_second": audio,
        "speaker": speaker,
        "language": language,
        "revealed": False,
        "completed": False,
    }
    with LOCK:
        ATTEMPTS[attempt_id] = attempt
    return {
        "attempt_id": attempt_id,
        "level": level,
        "word_count": len(attempt["answers"]),
        "text": attempt["text"],
        "target_language": body.target_language,
        "proper_noun_indices": proper_noun_indices,
        "dialogue_turns": [
            {"speaker": "A", "text": item["turns"][0], "word_count": len(LEARNING_WORD_RE.findall(item["turns"][0]))},
            {"speaker": "B", "text": item["turns"][1], "word_count": len(LEARNING_WORD_RE.findall(item["turns"][1]))},
        ],
    }


@app.get("/api/problem/{attempt_id}/audio")
def problem_audio(attempt_id: str, request: Request, take: int = 0) -> FileResponse:
    attempt = get_attempt(attempt_id, request)
    audio = attempt["audio_second"] if take == 1 and attempt["audio_second"].is_file() else attempt["audio"]
    allowed = audio.is_relative_to(CONVERSATION_ROOT.resolve()) or audio.is_relative_to(KOREAN_CONVERSATION_ROOT.resolve())
    if not audio.is_file() or not allowed:
        raise HTTPException(503, "Audio for this sentence is not ready yet.")
    return FileResponse(audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.post("/api/problem/{attempt_id}/touch")
def touch(attempt_id: str, request: Request) -> dict:
    get_attempt(attempt_id, request)
    return {"active": True}


@app.post("/api/problem/{attempt_id}/reveal")
def reveal(attempt_id: str, request: Request) -> dict:
    attempt = get_attempt(attempt_id, request)
    attempt["revealed"] = True
    return {"revealed": True, "answers": attempt["answers"]}


@app.post("/api/problem/{attempt_id}/complete")
def complete(attempt_id: str, body: CompleteBody, request: Request) -> dict:
    attempt = get_attempt(attempt_id, request)
    expected = [word.lower() for word in attempt["answers"]]
    received = [str(word).lower() for word in body.answers]
    if received != expected:
        raise HTTPException(400, "The completed answer could not be verified.")
    attempt["completed"] = True
    choices = [number for number in range(1, 6) if number != attempt["level"]]
    next_level = random.choice(choices)
    set_level(attempt["visitor"], next_level)
    return {"completed": True, "used_answer": attempt["revealed"], "next_level": next_level}


@app.post("/api/problem/{attempt_id}/analysis")
def analysis(attempt_id: str, body: LanguageBody, request: Request) -> dict:
    get_attempt(attempt_id, request)
    translations = {"ko": "The guide will be connected to the chapter translation data later.", "ja": "解説は後で追加されます。", "zh-CN": "讲解将在稍后添加。", "es": "La explicación se añadirá más adelante."}
    return {"target_language": body.target_language, "analysis": {"translation": translations.get(body.target_language, translations["ko"]), "expressions": []}}


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/build-status")
@app.get("/build-status/")
def status_page() -> FileResponse:
    return FileResponse(ROOT / "build-status.html")


@app.get("/practice")
@app.get("/practice/")
def practice_index() -> FileResponse:
    source = (PRACTICE_ROOT / "index.html").read_text(encoding="utf-8")
    source = source.replace(
        "English dictation practice with Harry Potter Chapter 3",
        "EchoStep level-based English listening practice",
    ).replace(
        "<title>Harry Potter Chapter 3 Dictation</title>",
        "<title>EchoStep Practice</title>",
    ).replace(
        'aria-label="Chapter 3 progress"',
        'aria-label="Practice progress"',
    )
    return Response(source, media_type="text/html")


@app.get("/practice/{name}")
def practice_static(name: str, request: Request) -> FileResponse:
    allowed = {
        "app.js", "styles.css", "wasm-asr-bootstrap.js",
        "persistent-model-loader.js", "model-cache-loader.js", "model-cache-sw.js",
    }
    if name not in allowed:
        raise HTTPException(404)
    language = selected_course(request)[0]
    if name == "app.js":
        source = (PRACTICE_ROOT / name).read_text(encoding="utf-8")
        source = source.replace(
            "if (window.location.origin !== DEPLOYED_ORIGIN) {",
            "if (window.top === window.self && window.location.origin !== DEPLOYED_ORIGIN) {",
        )
        source = source.replace(
            "const match = normalised.match(/[a-z]+(?:['-][a-z]+)*/);",
            "const match = normalised.match(/[\\p{L}\\p{N}]+(?:['-][\\p{L}\\p{N}]+)*/u);",
        ).replace(
            "return standardiseWordPunctuation(sentence).match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];",
            "return standardiseWordPunctuation(sentence).match(/[\\p{L}\\p{N}]+(?:['-][\\p{L}\\p{N}]+)*/gu) || [];",
        )
        source = source.replace(
            "    properNounIndices,\n  };",
            "    properNounIndices,\n    dialogueTurns: Array.isArray(payload.dialogue_turns) ? payload.dialogue_turns : [],\n  };",
        )
        source = source.replace(
            "function createWordSlot(index) {",
            "function createWordSlot(index, parent = elements.wordGrid) {",
        ).replace(
            "  elements.wordGrid.append(slotElement);\n\n  return {",
            "  parent.append(slotElement);\n\n  return {",
        )
        source = source.replace(
            "function renderWordGrid(wordCount) {\n  elements.wordGrid.replaceChildren();\n  state.slots = Array.from({ length: wordCount }, (_, index) => createWordSlot(index));\n}",
            """function renderWordGrid(wordCount) {
  elements.wordGrid.replaceChildren();
  const turns = state.problem?.dialogueTurns || [];
  if (!turns.length) {
    state.slots = Array.from({ length: wordCount }, (_, index) => createWordSlot(index));
    return;
  }
  const slots = [];
  let wordIndex = 0;
  turns.forEach((turn) => {
    const group = document.createElement("section");
    group.className = `speaker-turn speaker-${String(turn.speaker).toLowerCase()}`;
    const label = document.createElement("div");
    label.className = "speaker-label";
    label.innerHTML = `<b>${turn.speaker}</b>`;
    const row = document.createElement("div");
    row.className = "speaker-word-row";
    group.append(label, row);
    elements.wordGrid.append(group);
    const count = Number(turn.word_count) || 0;
    for (let offset = 0; offset < count; offset += 1) {
      slots.push(createWordSlot(wordIndex, row));
      wordIndex += 1;
    }
  });
  state.slots = slots;
}""",
        )
        if language == "ko":
            original_voice_handler = """function acceptVoiceTranscript(text, endpoint = false) {
  if (!state.problem || state.completing || state.problemLoading) return;
  const previous = entryWords(state.voiceLastTranscript);
  const current = entryWords(text);
  let shared = 0;
  while (shared < previous.length && shared < current.length && previous[shared] === current[shared]) shared += 1;
  for (const word of current.slice(shared)) {
    if (state.completing) break;
    commitVoiceWord(word);
  }
  state.voiceLastTranscript = endpoint ? "" : String(text || "");
}"""
            korean_voice_handler = """function acceptVoiceTranscript(text, endpoint = false) {
  if (!state.problem || state.completing || state.problemLoading) return;
  const transcript = String(text || "");
  const compact = transcript.normalize("NFKC").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, "");
  if (!compact || (!endpoint && compact === state.voiceLastTranscript)) return;
  showRecognizedVoiceWord(transcript);
  let cursor = 0;
  let matched = 0;
  state.problem.answerWords.forEach((answer, index) => {
    if (state.completing || state.solved.has(index)) return;
    const expected = String(answer || "").normalize("NFKC").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, "");
    if (!expected) return;
    const found = compact.indexOf(expected, cursor);
    if (found < 0) return;
    cursor = found + expected.length;
    flashVoiceCandidate([index]);
    showRecognizedVoiceWord(state.problem.displayWords[index]);
    markSolved([index], false);
    matched += 1;
  });
  if (!matched && !state.completing) {
    const distance = (left, right) => {
      const row = Array.from({ length: right.length + 1 }, (_, i) => i);
      for (let i = 1; i <= left.length; i += 1) {
        let diagonal = row[0];
        row[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
          const above = row[j];
          row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
          diagonal = above;
        }
      }
      return row[right.length];
    };
    state.problem.answerWords.some((answer, index) => {
      if (state.solved.has(index)) return false;
      const expected = String(answer || "").normalize("NFKC").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, "");
      if (expected.length < 3) return false;
      const allowance = Math.max(1, Math.floor(expected.length * 0.28));
      for (let size = Math.max(2, expected.length - allowance); size <= expected.length + allowance; size += 1) {
        for (let start = 0; start + size <= compact.length; start += 1) {
          if (distance(expected, compact.slice(start, start + size)) <= allowance) {
            flashVoiceCandidate([index]);
            showRecognizedVoiceWord(state.problem.displayWords[index]);
            markSolved([index], false);
            return true;
          }
        }
      }
      return false;
    });
  }
  state.voiceLastTranscript = endpoint ? "" : compact;
}"""
            if original_voice_handler not in source:
                raise RuntimeError("voice transcript handler was not found")
            source = source.replace(original_voice_handler, korean_voice_handler)
        return Response(source, media_type="application/javascript")
    if name == "styles.css":
        source = (PRACTICE_ROOT / name).read_text(encoding="utf-8")
        source = source.replace(
            'url("/ch003.png?v=20260901-2") center / cover fixed no-repeat,',
            "",
        ).replace(
            'url("/ch003.png?v=20260901-3") center / cover fixed no-repeat,',
            "",
        )
        source += """
.practice-panel-theme-marker { display:none; }
:root {
  --level-accent:#1877e8; --level-dark:#0c4fa3; --level-soft:#eaf3ff; --level-rgb:24,119,232;
  --ink:#17243a; --muted:#697386; --paper:var(--level-soft); --surface:#fff;
  --line:rgba(var(--level-rgb),.16); --soft:rgba(var(--level-rgb),.07);
  --green:var(--level-accent); --green-dark:var(--level-dark); --green-soft:var(--level-soft);
  --accent:var(--level-accent); --accent-rgb:var(--level-rgb);
}
html, body { min-height:100%; background:linear-gradient(145deg,#fff 0%,var(--level-soft) 100%) !important; }
body { padding:0; color:var(--ink); transition:background 320ms ease; }
.topbar,.page { width:min(980px,calc(100% - 40px)); }
.topbar { min-height:64px; border-color:rgba(var(--level-rgb),.14); }
.topbar { justify-content:flex-start; }
.step-label { display:none !important; }
.brand { color:var(--level-dark); font-size:15px; font-weight:850; }
.step-label { padding:7px 10px; background:rgba(255,255,255,.72); border:1px solid rgba(var(--level-rgb),.16); border-radius:999px; }
.chapter-progress { background:rgba(var(--level-rgb),.12); }
.chapter-progress i { background:var(--level-accent); }
.page { display:grid; place-items:center; min-height:calc(100dvh - 64px); padding:22px 0 34px; }
.practice-card,.practice-card.is-success,.practice-card.is-reveal-complete {
  width:100%; max-width:900px; padding:clamp(22px,3vw,38px); overflow:visible;
  background:rgba(255,255,255,.92); border:1px solid rgba(var(--level-rgb),.16); border-radius:24px;
  box-shadow:0 18px 52px rgba(var(--level-rgb),.11); backdrop-filter:blur(14px);
}
.voice-toggle { border-color:rgba(var(--level-rgb),.2); background:rgba(var(--level-rgb),.07); }
.voice-check,.voice-setup-progress i,.chapter-progress-fill { background:var(--level-accent) !important; }
.word-slot { border-color:rgba(var(--level-rgb),.18); background:#fff; }
.word-slot.is-correct,.word-slot.is-revealed { color:var(--level-dark); background:var(--level-soft); }
.answer-input-wrap:focus-within { border-color:var(--level-accent); box-shadow:0 0 0 4px rgba(var(--level-rgb),.10); }
.proper-noun-button { color:var(--level-dark); border-color:rgba(var(--level-rgb),.24); background:var(--level-soft); }
.playback-buttons .speed-button.is-selected,.playback-buttons .speed-button.is-playing { color:var(--level-dark); background:var(--level-soft); box-shadow:inset 0 0 0 1px rgba(var(--level-rgb),.24); }
.speaker-turn.speaker-a { background:rgba(var(--level-rgb),.07); border-color:rgba(var(--level-rgb),.18); }
.speaker-turn.speaker-b { background:rgba(var(--level-rgb),.14); border-color:rgba(var(--level-rgb),.27); }
.speaker-a .speaker-label b { background:var(--level-accent); }
.speaker-b .speaker-label b { background:var(--level-dark); }
.word-grid:has(.speaker-turn) { display:grid; gap:12px; }
.speaker-turn { display:grid; grid-template-columns:52px minmax(0,1fr); gap:10px; align-items:start; padding:13px 14px; border:1px solid; border-radius:18px; }
.speaker-label { display:flex; align-items:center; gap:7px; min-height:38px; }
.speaker-label b { display:grid; width:28px; height:28px; place-items:center; color:white; border-radius:50%; font-size:13px; }
.speaker-word-row { display:flex; flex-wrap:wrap; gap:8px; min-width:0; }
@media (max-width:700px) { .speaker-turn { grid-template-columns:1fr; gap:5px; } }
"""
        return Response(source, media_type="text/css")
    if name == "persistent-model-loader.js":
        source = (PRACTICE_ROOT / name).read_text(encoding="utf-8")
        if language == "ko":
            source = source.replace('sherpa-main-asr-20260901-v1', 'sherpa-ko-asr-20260902-v1')
            source = source.replace('/asr-wasm/', '/asr-wasm-ko/')
            source = source.replace('const expectedDataBytes = 190951044;', 'const expectedDataBytes = 140922636;')
            source = source.replace('const expectedWasmBytes = 13148431;', 'const expectedWasmBytes = 13150079;')
        source = source.replace('/wasm-asr-bootstrap.js?v=20260901-3', '/practice/wasm-asr-bootstrap.js?v=20260902-1')
        return Response(source, media_type="application/javascript")
    if name == "wasm-asr-bootstrap.js":
        source = (PRACTICE_ROOT / name).read_text(encoding="utf-8")
        if language == "ko":
            source = source.replace('/asr-wasm/', '/asr-wasm-ko/')
        return Response(source, media_type="application/javascript")
    return FileResponse(PRACTICE_ROOT / name)


@app.get("/{name}")
def static(name: str) -> FileResponse:
    if name not in {"index.html", "app.js", "styles.css", "ch003.png", "wasm-asr-bootstrap.js", "persistent-model-loader.js", "model-cache-loader.js", "model-cache-sw.js", "build-status.html", "build-status.js", "build-status.css"}:
        raise HTTPException(404)
    return FileResponse(ROOT / name)
