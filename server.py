"""Harry Potter Chapter 3 sequential dictation server."""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import uuid
import urllib.request
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
MANIFEST = Path("/home/scpark/4repeat/jobs/ch003-the-advanced-guard/manifest/ch003.json")
PROPER_NOUNS = ROOT / "data" / "ch003-proper-nouns.json"
AUDIO_ROOT = Path("/home/scpark/4repeat/jobs/ch003-the-advanced-guard/runtime/accepted-takes/ch003")
CYCLING_AUDIO_ROOT = Path("/home/scpark/harry-dictation-data/chapter3-audio")
SECOND_AUDIO_ROOT = Path("/home/scpark/harry-dictation-data/chapter3-audio-b")
DB = ROOT / "progress.sqlite3"
SPEAKER_CYCLE = ("M1", "F1", "M2", "F2")
WORD_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")
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
LOCK = threading.RLock()
app = FastAPI(title="Harry Potter Chapter 3 Dictation")
app.mount("/asr-wasm", StaticFiles(directory=ROOT / "asr-wasm"), name="asr-wasm")


@app.middleware("http")
async def no_store(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/asr-wasm/"):
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


def visitor(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def db_level(key: str) -> int:
    with sqlite3.connect(DB) as db:
        db.execute("CREATE TABLE IF NOT EXISTS progress(visitor TEXT PRIMARY KEY, level INTEGER NOT NULL)")
        row = db.execute("SELECT level FROM progress WHERE visitor=?", (key,)).fetchone()
        return int(row[0]) if row else 1


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
    return {"level": db_level(visitor(request)), "max_level": 641, "max_words": 100}


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
    if not 1 <= body.level <= 641:
        raise HTTPException(400, "The sentence number must be between 1 and 641.")
    set_level(visitor(request), body.level)
    return {"current_level": body.level}


@app.post("/api/problem")
def create_problem(body: LanguageBody, request: Request) -> dict:
    key = visitor(request)
    level = db_level(key)
    row = SENTENCES[level - 1]
    proper_noun_indices = PROPER_NOUN_METADATA.get(row["sentence_id"], {}).get(
        "proper_noun_indices", []
    )
    speaker = SPEAKER_CYCLE[(level - 1) % len(SPEAKER_CYCLE)]
    generated = CYCLING_AUDIO_ROOT / f"{level:04d}.wav"
    audio = generated.resolve() if generated.is_file() else (
        AUDIO_ROOT / row["sentence_id"] / f"{speaker}.wav"
    ).resolve()
    allowed = audio.is_relative_to(AUDIO_ROOT.resolve()) or audio.is_relative_to(CYCLING_AUDIO_ROOT.resolve())
    if not audio.is_file() or not allowed:
        raise HTTPException(503, "Audio for this sentence is not ready yet.")
    attempt_id = uuid.uuid4().hex
    attempt = {
        "visitor": key,
        "level": level,
        "text": row["display_text"],
        "answers": WORD_RE.findall(row["display_text"]),
        "audio": audio,
        "audio_second": (SECOND_AUDIO_ROOT / f"{level:04d}.wav").resolve(),
        "speaker": speaker,
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
    }


@app.get("/api/problem/{attempt_id}/audio")
def problem_audio(attempt_id: str, request: Request, take: int = 0) -> FileResponse:
    attempt = get_attempt(attempt_id, request)
    audio = attempt["audio_second"] if take == 1 and attempt["audio_second"].is_file() else attempt["audio"]
    allowed = audio.is_relative_to(AUDIO_ROOT.resolve()) or audio.is_relative_to(CYCLING_AUDIO_ROOT.resolve()) or audio.is_relative_to(SECOND_AUDIO_ROOT.resolve())
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
    next_level = min(641, attempt["level"] + 1)
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


@app.get("/{name}")
def static(name: str) -> FileResponse:
    if name not in {"index.html", "app.js", "styles.css", "ch003.png", "wasm-asr-bootstrap.js", "persistent-model-loader.js", "model-cache-loader.js", "model-cache-sw.js", "build-status.html", "build-status.js", "build-status.css"}:
        raise HTTPException(404)
    return FileResponse(ROOT / name)
