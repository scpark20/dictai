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
PRACTICE_ROOT = Path("/home/scpark/dictai")
MANIFEST = Path("/home/scpark/4repeat/jobs/ch003-the-advanced-guard/manifest/ch003.json")
PROPER_NOUNS = ROOT / "data" / "ch003-proper-nouns.json"
AUDIO_ROOT = Path("/home/scpark/4repeat/jobs/ch003-the-advanced-guard/runtime/accepted-takes/ch003")
CYCLING_AUDIO_ROOT = Path("/home/scpark/harry-dictation-data/chapter3-audio")
SECOND_AUDIO_ROOT = Path("/home/scpark/harry-dictation-data/chapter3-audio-b")
HARRY_CHAPTERS = {
    3: {
        "title": "The Advanced Guard",
        "manifest": Path("/home/scpark/4repeat/jobs/ch003-the-advanced-guard/manifest/ch003.json"),
        "audio": Path("/home/scpark/harry-dictation-data/chapter3-audio"),
        "audio_second": Path("/home/scpark/harry-dictation-data/chapter3-audio-b"),
        "proper_nouns": Path("/home/scpark/apps/harry-baseline/data/ch003-proper-nouns.json"),
    },
    4: {
        "title": "Number Twelve, Grimmauld Place",
        "manifest": Path("/home/scpark/4repeat/jobs/ch004-number-twelve-grimmauld-place/manifest/ch004.json"),
        "audio": Path("/home/scpark/harry-dictation-data/chapter4-audio"),
        "audio_second": Path("/home/scpark/harry-dictation-data/chapter4-audio-b"),
        "proper_nouns": Path("/home/scpark/apps/harry-baseline/data/ch004-proper-nouns.json"),
    },
    5: {
        "title": "The Order of the Phoenix",
        "manifest": Path("/home/scpark/dictai/data/ch005.json"),
        "audio": Path("/home/scpark/harry-concise-ch5/audio-a"),
        "audio_second": Path("/home/scpark/harry-concise-ch5/audio-b"),
        "proper_nouns": Path("/home/scpark/dictai/data/ch005-proper-nouns.json"),
    },
}
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


def load_harry_chapter(chapter: dict) -> None:
    source = json.loads(chapter["manifest"].read_text(encoding="utf-8"))
    unique = {block["sentence_id"]: block for block in source["blocks"]}
    chapter["sentences"] = sorted(unique.values(), key=lambda item: item["sentence_ordinal"])
    proper_path = chapter["proper_nouns"]
    chapter["proper_noun_metadata"] = (
        json.loads(proper_path.read_text(encoding="utf-8")).get("sentences", {})
        if proper_path.is_file() else {}
    )


for harry_chapter in HARRY_CHAPTERS.values():
    load_harry_chapter(harry_chapter)
PROPER_NOUN_METADATA = (
    json.loads(PROPER_NOUNS.read_text(encoding="utf-8")).get("sentences", {})
    if PROPER_NOUNS.is_file()
    else {}
)
ATTEMPTS: dict[str, dict] = {}
SELECTED_COURSES: dict[str, tuple[str, str, str]] = {}
SELECTED_BOOKS: dict[str, int] = {}
LOCK = threading.RLock()
app = FastAPI(title="Harry Potter Chapter 3 Dictation")
app.mount("/asr-wasm", StaticFiles(directory=PRACTICE_ROOT / "asr-wasm"), name="asr-wasm")
app.mount("/asr-wasm-ko", StaticFiles(directory=ROOT / "asr-wasm-ko"), name="asr-wasm-ko")


KOREAN_WHISPER_LOADER = r'''"use strict";

(async () => {
  const emitStatus = (status, percent = null) => window.dispatchEvent(new CustomEvent("wasm-asr-status", {
    detail: { status, percent },
  }));
  const flatten = (chunks) => {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const audio = new Float32Array(length);
    let offset = 0;
    chunks.forEach((chunk) => { audio.set(chunk, offset); offset += chunk.length; });
    return audio;
  };

  try {
    emitStatus("Loading Korean voice model…", 5);
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    const { pipeline, env } = await import(
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js"
    );
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const transcriber = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-base",
      {
        device: "wasm",
        dtype: "q8",
        progress_callback: (event) => {
          if (event?.status === "progress" && Number.isFinite(event.progress)) {
            emitStatus("Saving Korean voice model…", Math.max(5, Math.min(95, Math.round(event.progress))));
          }
        },
      },
    );

    const recognizer = {
      createStream() {
        return {
          chunks: [], sampleCount: 0, speechStarted: false, silenceSamples: 0,
          busy: false, fresh: false, text: "", disposed: false,
          acceptWaveform(_rate, samples) {
            if (this.disposed || !samples?.length) return;
            const copy = new Float32Array(samples);
            this.chunks.push(copy);
            this.sampleCount += copy.length;
            let energy = 0;
            for (let index = 0; index < copy.length; index += 1) energy += copy[index] * copy[index];
            const rms = Math.sqrt(energy / copy.length);
            if (rms >= 0.012) {
              this.speechStarted = true;
              this.silenceSamples = 0;
            } else if (this.speechStarted) {
              this.silenceSamples += copy.length;
            }
            if (!this.speechStarted && this.sampleCount > 16000) {
              while (this.sampleCount > 16000 * 0.35 && this.chunks.length > 1) {
                this.sampleCount -= this.chunks[0].length;
                this.chunks.shift();
              }
            }
            const maximum = 16000 * 6;
            while (this.sampleCount > maximum && this.chunks.length > 1) {
              this.sampleCount -= this.chunks[0].length;
              this.chunks.shift();
            }
          },
          free() { this.disposed = true; this.chunks = []; this.sampleCount = 0; },
        };
      },
      isReady(stream) {
        const phraseEnded = stream.silenceSamples >= 16000 * 0.45;
        const phraseFull = stream.sampleCount >= 16000 * 5;
        return !stream.disposed && !stream.busy && !stream.fresh && stream.speechStarted
          && stream.sampleCount >= 16000 * 0.6 && (phraseEnded || phraseFull);
      },
      decode(stream) {
        if (stream.busy || stream.fresh || stream.disposed) return;
        stream.busy = true;
        const audio = flatten(stream.chunks);
        void transcriber(audio, {
          language: "korean",
          task: "transcribe",
          chunk_length_s: 6,
          stride_length_s: 1,
          return_timestamps: false,
          temperature: 0,
        }).then((result) => {
          if (stream.disposed) return;
          stream.text = String(result?.text || "").trim();
          stream.fresh = true;
        }).catch((error) => {
          console.error("Korean Whisper transcription failed", error);
          emitStatus("Voice recognition failed", null);
          stream.chunks = [];
          stream.sampleCount = 0;
          stream.speechStarted = false;
          stream.silenceSamples = 0;
        }).finally(() => { stream.busy = false; });
      },
      getResult(stream) { return { text: stream.fresh ? stream.text : "" }; },
      isEndpoint(stream) { return stream.fresh; },
      reset(stream) {
        stream.chunks = [];
        stream.sampleCount = 0;
        stream.speechStarted = false;
        stream.silenceSamples = 0;
        stream.text = "";
        stream.fresh = false;
      },
    };
    window.wasmAsrRecognizer = recognizer;
    emitStatus("Ready", 100);
    window.dispatchEvent(new CustomEvent("wasm-asr-ready"));
  } catch (error) {
    console.error("Korean Whisper model failed", error);
    emitStatus("Voice model failed", null);
  }
})();
'''


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


class BookBody(BaseModel):
    chapter: int


class VoiceDebugBody(BaseModel):
    transcript: str = ""
    before: int = 0
    after: int = 0
    matched: list[str] = []


def conversation_catalog(language: str = "en") -> dict:
    path = (KOREAN_CONVERSATION_ROOT if language == "ko" else CONVERSATION_ROOT) / "catalog.json"
    if not path.is_file():
        raise HTTPException(503, "Conversation content is still being prepared.")
    return json.loads(path.read_text(encoding="utf-8"))["levels"]


def selected_course(request: Request) -> tuple[str, str, str]:
    return SELECTED_COURSES.get(visitor(request), ("en", "A1", "Greetings"))


def selected_book(request: Request) -> int | None:
    return SELECTED_BOOKS.get(visitor(request))


def progress_key(request: Request) -> str:
    key = visitor(request)
    chapter = selected_book(request)
    if chapter is not None:
        return f"{key}:book:harry-potter-5:chapter:{chapter}"
    language, course_level, topic = selected_course(request)
    return f"{key}:conversation:{language}:{course_level}:{topic}"


def visitor(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def db_level(key: str, max_level: int = 5) -> int:
    with sqlite3.connect(DB) as db:
        db.execute("CREATE TABLE IF NOT EXISTS progress(visitor TEXT PRIMARY KEY, level INTEGER NOT NULL)")
        row = db.execute("SELECT level FROM progress WHERE visitor=?", (key,)).fetchone()
        return min(max_level, max(1, int(row[0]))) if row else 1


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
    chapter_number = selected_book(request)
    if chapter_number is not None:
        chapter = HARRY_CHAPTERS[chapter_number]
        maximum = len(chapter["sentences"])
        return {
            "level": db_level(progress_key(request), maximum),
            "max_level": maximum,
            "max_words": 100,
            "learning_language": "en",
            "book": "Harry Potter 5",
            "chapter": chapter_number,
            "chapter_title": chapter["title"],
        }
    language, course_level, topic = selected_course(request)
    return {"level": db_level(progress_key(request)), "max_level": 5, "max_words": 100, "learning_language": language, "course_level": course_level, "topic": topic}


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
    SELECTED_BOOKS.pop(visitor(request), None)
    set_level(progress_key(request), random.randint(1, 5))
    return {"level": body.level, "topic": topic, "count": 5}


@app.post("/api/book")
def select_book(body: BookBody, request: Request) -> dict:
    if body.chapter not in HARRY_CHAPTERS:
        raise HTTPException(404, "Chapter not found.")
    SELECTED_BOOKS[visitor(request)] = body.chapter
    chapter = HARRY_CHAPTERS[body.chapter]
    return {
        "book": "Harry Potter 5",
        "chapter": body.chapter,
        "title": chapter["title"],
        "count": len(chapter["sentences"]),
    }


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
    chapter_number = selected_book(request)
    maximum = len(HARRY_CHAPTERS[chapter_number]["sentences"]) if chapter_number is not None else 5
    if not 1 <= body.level <= maximum:
        raise HTTPException(400, f"The sentence number must be between 1 and {maximum}.")
    set_level(progress_key(request), body.level)
    return {"current_level": body.level}


@app.post("/api/problem")
def create_problem(body: LanguageBody, request: Request) -> dict:
    key = visitor(request)
    chapter_number = selected_book(request)
    if chapter_number is not None:
        chapter = HARRY_CHAPTERS[chapter_number]
        level = db_level(progress_key(request), len(chapter["sentences"]))
        row = chapter["sentences"][level - 1]
        text = row["display_text"]
        answers = WORD_RE.findall(text)
        proper_noun_indices = chapter["proper_noun_metadata"].get(row["sentence_id"], {}).get("proper_noun_indices", [])
        audio = (chapter["audio"] / f"{level:04d}.wav").resolve()
        audio_second = (chapter["audio_second"] / f"{level:04d}.wav").resolve()
        if not audio.is_file() or not audio.is_relative_to(chapter["audio"].resolve()):
            raise HTTPException(503, "Audio for this sentence is not ready yet.")
        attempt_id = uuid.uuid4().hex
        attempt = {
            "visitor": key, "progress_key": progress_key(request), "mode": "book",
            "chapter": chapter_number, "level": level, "text": text, "answers": answers,
            "audio": audio, "audio_second": audio_second, "allowed_roots": (chapter["audio"], chapter["audio_second"]),
            "speaker": SPEAKER_CYCLE[(level - 1) % len(SPEAKER_CYCLE)],
            "revealed": False, "completed": False,
        }
        with LOCK:
            ATTEMPTS[attempt_id] = attempt
        return {
            "attempt_id": attempt_id, "level": level, "chapter": chapter_number,
            "word_count": len(answers), "text": text, "target_language": body.target_language,
            "proper_noun_indices": proper_noun_indices,
        }

    level = db_level(progress_key(request))
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
        "progress_key": progress_key(request),
        "mode": "conversation",
        "level": level,
        "text": text,
        "answers": LEARNING_WORD_RE.findall(text),
        "audio": audio,
        "audio_second": audio,
        "allowed_roots": (root,),
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


@app.post("/api/voice-debug")
def voice_debug(body: VoiceDebugBody, request: Request) -> dict:
    language, course_level, topic = selected_course(request)
    print(json.dumps({
        "voice_debug": True, "visitor": visitor(request), "language": language,
        "level": course_level, "topic": topic, **body.model_dump(),
    }, ensure_ascii=False), flush=True)
    return {"ok": True}


@app.get("/api/problem/{attempt_id}/audio")
def problem_audio(attempt_id: str, request: Request, take: int = 0) -> FileResponse:
    attempt = get_attempt(attempt_id, request)
    audio = attempt["audio_second"] if take == 1 and attempt["audio_second"].is_file() else attempt["audio"]
    allowed = any(audio.is_relative_to(root.resolve()) for root in attempt["allowed_roots"])
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
    if attempt["mode"] == "book":
        maximum = len(HARRY_CHAPTERS[attempt["chapter"]]["sentences"])
        next_level = min(maximum, attempt["level"] + 1)
    else:
        choices = [number for number in range(1, 6) if number != attempt["level"]]
        next_level = random.choice(choices)
    set_level(attempt["progress_key"], next_level)
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
        "DictAI level-based English listening practice",
    ).replace(
        "<title>Harry Potter Chapter 3 Dictation</title>",
        "<title>DictAI Practice</title>",
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
  const solvedBefore = state.solved.size;
  const acceptedWords = [];
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
  state.problem.answerWords.forEach((answer, index) => {
    if (state.completing || state.solved.has(index)) return;
    const expected = String(answer || "").normalize("NFKC").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, "");
    if (!expected) return;
    let accepted = compact.includes(expected);
    if (!accepted && expected.length >= 2) {
      const allowance = Math.max(1, Math.floor(expected.length * 0.45));
      for (let size = Math.max(1, expected.length - allowance); !accepted && size <= expected.length + allowance; size += 1) {
        for (let start = 0; start + size <= compact.length; start += 1) {
          if (distance(expected, compact.slice(start, start + size)) <= allowance) { accepted = true; break; }
        }
      }
    }
    if (!accepted) return;
    flashVoiceCandidate([index]);
    acceptedWords.push(state.problem.displayWords[index]);
    commitVoiceWord(state.problem.displayWords[index]);
  });
  void fetch("/api/voice-debug", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, before: solvedBefore, after: state.solved.size, matched: acceptedWords }),
  }).catch(() => {});
  state.voiceLastTranscript = endpoint ? "" : compact;
}"""
            if original_voice_handler not in source:
                raise RuntimeError("voice transcript handler was not found")
            source = source.replace(original_voice_handler, korean_voice_handler)
            source = source.replace("}, 700);", "}, 5000);")
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
        if language == "ko":
            return Response(KOREAN_WHISPER_LOADER, media_type="application/javascript")
        source = (PRACTICE_ROOT / name).read_text(encoding="utf-8")
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
