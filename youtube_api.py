"""YouTube caption import. No media downloads, TTS, proxies or cookie extraction."""
from __future__ import annotations

import hashlib
import html
import json
import math
import os
import re
import sqlite3
import subprocess
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from youtube_guard import CaptionGuard

router = APIRouter(prefix="/api/youtube")
MAX_SECONDS = 43200
MAX_CUES = 15000


class ImportBody(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en", max_length=30, pattern=r"^[a-zA-Z0-9_-]+$")


class SubtitleBody(ImportBody):
    subtitles: str = Field(min_length=1, max_length=2_000_000)


class NamesBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@lru_cache(maxsize=1)
def names_model():
    import spacy
    deps = Path(os.environ.get("DICTAI_YOUTUBE_DEPS", "/home/scpark/dictai-youtube-deps"))
    candidates = sorted((deps / "en_core_web_sm").glob("en_core_web_sm-*/config.cfg"))
    if not candidates:
        raise RuntimeError("English names model is not installed")
    return spacy.load(candidates[-1].parent)


@lru_cache(maxsize=256)
def name_indices(text: str) -> list[int]:
    text = unicodedata.normalize("NFKC", text).replace("’", "'").replace("‘", "'")
    doc = names_model()(text)
    # Same PERSON/PROPN evidence used by the existing Book metadata builder.
    from build_proper_nouns import ENTITY_LABELS, ENTITY_EXCLUDED_POS, ALWAYS_EXCLUDED_WORDS
    spans = [(t.idx, t.idx+len(t.text)) for t in doc if t.pos_ == "PROPN" and t.text.casefold() not in ALWAYS_EXCLUDED_WORDS]
    spans.extend((t.idx, t.idx+len(t.text)) for ent in doc.ents if ent.label_ in ENTITY_LABELS for t in ent if t.pos_ not in ENTITY_EXCLUDED_POS and t.text.casefold() not in ALWAYS_EXCLUDED_WORDS)
    words = list(re.finditer(r"[^\W_]+(?:['-][^\W_]+)*", text))
    return [i for i,w in enumerate(words) if any(w.start()<end and w.end()>start for start,end in spans)]


@router.post("/names")
def names_endpoint(body: NamesBody):
    try:
        return {"indices": name_indices(body.text)}
    except (ImportError, OSError, RuntimeError):
        raise HTTPException(503, {"message":"The Names helper is unavailable. You can still type or reveal individual words."}) from None


def parse_video_url(value: str) -> tuple[str, float]:
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value, 0.0
    if value.startswith(("youtube.com/", "www.youtube.com/", "m.youtube.com/", "youtu.be/")):
        value = "https://" + value
    try:
        u = urlparse(value)
        if u.scheme not in ("http", "https") or u.username or u.password or u.port not in (None, 80, 443):
            raise ValueError
        q = parse_qs(u.query)
        parts = u.path.strip("/").split("/")
        if u.hostname in ("youtu.be", "www.youtu.be") and len(parts) == 1:
            video_id = parts[0]
        elif u.hostname in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com"):
            if u.path == "/watch":
                video_id = q.get("v", [""])[0]
            elif len(parts) == 2 and parts[0] in ("embed", "shorts", "live"):
                video_id = parts[1]
            else:
                raise ValueError
        else:
            raise ValueError
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            raise ValueError
        stamp = q.get("t", q.get("start", parse_qs(u.fragment).get("t", ["0"])))[0]
        if re.fullmatch(r"\d+(?:\.\d+)?", stamp):
            start = float(stamp)
        elif re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", stamp) and stamp:
            h, m, s = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", stamp).groups()
            start = int(h or 0)*3600 + int(m or 0)*60 + int(s or 0)
        else:
            start = 0
        return video_id, min(float(start), MAX_SECONDS)
    except (ValueError, IndexError):
        raise ValueError("Paste a YouTube video link (watch, Shorts, live or youtu.be).") from None


def clean_caption(text: str) -> str:
    text = re.sub(r"<[^>]*>", "", text)
    text = html.unescape(text)
    text = re.sub(r"[\[（(](?:music|applause|laughter|laughing|silence|inaudible|음악|박수)[\]）)]", " ", text, flags=re.I)
    return " ".join(text.replace("\u200b", "").split())


def build_segments(cues: list[dict]) -> list[dict]:
    if not cues or len(cues) > MAX_CUES:
        raise ValueError("No usable captions, or this video has too many caption lines (maximum 15,000).")
    if sum(len(str(c.get("text", ""))) for c in cues) > 500_000:
        raise ValueError("This transcript is too large. Use a shorter video or a smaller caption file.")
    cleaned = []
    for cue in cues:
        start, duration = float(cue["start"]), float(cue["duration"])
        if not (math.isfinite(start) and math.isfinite(duration) and 0 <= start < MAX_SECONDS and 0 < duration <= 600):
            raise ValueError("Invalid subtitle time. Use a video shorter than 12 hours with valid timed captions.")
        text = clean_caption(str(cue["text"]))
        if len(text) > 2000:
            raise ValueError("One caption is too long to use as a dictation question.")
        if text and re.search(r"[^\W_]", text, re.UNICODE):
            cleaned.append({"start": round(start, 3), "end": round(min(MAX_SECONDS, start+duration), 3), "text": text})
    cleaned.sort(key=lambda c: c["start"])
    # Remove only overlapping rolling-caption prefixes, not intentional repetition.
    previous = None
    result, group = [], None
    def flush():
        nonlocal group
        if group:
            group["id"] = len(result)
            result.append(group)
            group = None
    for cue in cleaned:
        words = cue["text"].split()
        if previous and cue["start"] < previous["end"] - .05:
            old = previous["text"].split()
            for size in range(min(len(old), len(words)), 0, -1):
                if old[-size:] == words[:size]:
                    words = words[size:]
                    break
        previous = cue
        if not words:
            continue
        text = " ".join(words)
        if group and (cue["start"]-group["end"] > 1.5 or cue["end"]-group["start"] > 16 or len((group["text"]+" "+text).split()) > 38):
            flush()
        if group:
            group["end"] = max(group["end"], cue["end"])
            group["text"] += " " + text
        else:
            group = {"start": cue["start"], "end": cue["end"], "text": text}
        if re.search(r"[.!?。！？][\"'’”]*$", text) or group["end"]-group["start"] >= 8:
            flush()
    flush()
    if not result:
        raise ValueError("No spoken-word captions were found.")
    return result


def subtitle_seconds(value: str) -> float:
    bits = value.replace(",", ".").split(":")
    if len(bits) not in (2, 3):
        raise ValueError("Use an SRT or WebVTT file with timestamps.")
    nums = [float(v) for v in bits]
    if not all(math.isfinite(v) and v >= 0 for v in nums) or any(v >= 60 for v in nums[-2:]):
        raise ValueError("Invalid subtitle timestamp.")
    return sum(n * 60**i for i,n in enumerate(reversed(nums)))


def parse_subtitles(value: str) -> list[dict]:
    lines = value.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n").splitlines()
    cues = []
    timing = re.compile(r"^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s|$)")
    i = 0
    while i < len(lines):
        match = timing.match(lines[i])
        if not match:
            i += 1
            continue
        start, end = map(subtitle_seconds, match.groups())
        i += 1
        text = []
        while i < len(lines) and lines[i].strip() and not timing.match(lines[i]):
            text.append(lines[i]); i += 1
        cues.append({"start": start, "duration": end-start, "text": " ".join(text)})
    if not cues:
        raise ValueError("No timestamps found. Upload or paste SRT / WebVTT captions, not plain text.")
    return cues


def package(video_id, start, language, cues, *, title=None, generated=False, tracks=None, source="youtube"):
    segments = build_segments(cues)
    digest = hashlib.sha256(json.dumps(segments, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    return {"video_id": video_id, "title": title or f"YouTube · {video_id}", "start_hint": start,
            "language": language, "generated": generated, "source": source, "tracks": tracks or [],
            "version": digest, "segments": segments, "count": len(segments), "end": max(s["end"] for s in segments)}


def fetch_public(video_id: str, language: str) -> dict:
    # Isolated dependencies: never replace the recognition / synthesis environment.
    sys.path.insert(0, os.environ.get("DICTAI_YOUTUBE_DEPS", "/home/scpark/dictai-youtube-deps"))
    from youtube_transcript_api import YouTubeTranscriptApi
    from requests import Session
    class TimedSession(Session):
        def request(self, *args, **kwargs):
            kwargs.setdefault("timeout", (5, 12))
            return super().request(*args, **kwargs)
    with TimedSession() as session:
        api = YouTubeTranscriptApi(http_client=session)
        tracks = list(api.list(video_id))
        available = [{"code": t.language_code, "name": t.language, "generated": t.is_generated} for t in tracks]
        candidates = [t for t in tracks if t.language_code == language or t.language_code.split("-")[0] == language.split("-")[0]]
        if not candidates:
            return {"error": "language_unavailable", "message": "No captions in the selected language. Choose an available language below.", "tracks": available}
        chosen = sorted(candidates, key=lambda t: (t.language_code != language, t.is_generated))[0]
        fetched = chosen.fetch()
        title = None
        try:
            meta = session.get("https://www.youtube.com/oembed", params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"}, timeout=(4,4))
            if meta.ok: title = str(meta.json().get("title", ""))[:300]
        except Exception:
            pass
        return package(video_id, 0, chosen.language_code, fetched.to_raw_data(), title=title, generated=chosen.is_generated, tracks=available)


def fetch_guarded(video_id: str, language: str):
    def worker():
        try:
            child = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--fetch-worker', video_id, language], capture_output=True, text=True, timeout=45, check=True)
            result = json.loads(child.stdout)
            if not isinstance(result, dict) or ('error' not in result and not result.get('segments')):
                raise ValueError('Invalid caption response')
            return result
        except subprocess.TimeoutExpired:
            return {'error':'timeout','message':'YouTube took too long to respond. No automatic retry was sent.'}
        except (subprocess.CalledProcessError,ValueError):
            return {'error':'import_failed','message':'Captions could not be loaded. No automatic retry was sent.'}
    return CaptionGuard().get(video_id,language,worker)


@router.get('/status')
def caption_status():
    return CaptionGuard().status()


def import_video(body: ImportBody):
    try:
        video_id, start = parse_video_url(body.url)
    except ValueError as e:
        raise HTTPException(400, {"code": "invalid_link", "message": str(e)}) from None
    result = fetch_guarded(video_id, body.language)
    if "error" in result:
        code = result['error']
        status = 429 if code in ('requests_paused','request_busy','request_rate_limited') else 503 if code=='cache_unavailable' else 504 if code=='timeout' else 502 if code=='import_failed' else 422
        detail = {**result,'code':code,'tracks':result.get('tracks',[])}
        headers = {'Retry-After':str(result['retry_after'])} if result.get('retry_after') else None
        raise HTTPException(status,detail,headers=headers)
    return {**result, "start_hint": start, "cached": result.get('cached',False)}


@router.post("/import")
def import_endpoint(body: ImportBody):
    return import_video(body)


@router.post("/subtitles")
def subtitles_endpoint(body: SubtitleBody):
    try:
        video_id, start = parse_video_url(body.url)
        result = package(video_id, start, body.language, parse_subtitles(body.subtitles), source="uploaded")
        try:
            CaptionGuard().save(video_id,body.language,result)
        except (sqlite3.Error,OSError):
            # User-provided captions require no upstream request and stay usable.
            result['cache_warning'] = 'Server storage is unavailable; keep the caption file for later.'
        return result
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(400, {"code":"invalid_subtitles", "message":str(e)}) from None


if __name__ == "__main__":
    try:
        if len(sys.argv)==4 and sys.argv[1]=='--fetch-worker':
            # Private child: parent holds the shared lease and enforces timeout.
            result = fetch_public(sys.argv[2],sys.argv[3])
        else:
            video_id, start = parse_video_url(sys.argv[1])
            result = fetch_guarded(video_id,sys.argv[2])
    except Exception as e:
        code = type(e).__name__
        if code in ("RequestBlocked", "IpBlocked"):
            message = "YouTube blocked caption access from this server. Use an SRT / VTT file; no access restrictions will be bypassed."
        elif code in ("TranscriptsDisabled", "NoTranscriptFound"):
            message = "This video has no accessible captions. You can use an SRT / VTT file instead."
        elif code in ("VideoUnavailable", "VideoUnplayable", "AgeRestricted"):
            message = "This video is unavailable, restricted or requires sign-in. Choose another video."
        elif code == "ModuleNotFoundError":
            message = "The caption importer is not installed on this server. SRT / VTT import is still available."
        else:
            message = "YouTube captions could not be read. Retry or use an SRT / VTT caption file."
        result = {"error":code, "message":message}
    print(json.dumps(result, ensure_ascii=False))
