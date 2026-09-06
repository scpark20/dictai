#!/usr/bin/env python3
"""Generate two deterministic, independently voiced takes for a strict chapter manifest."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import queue
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
import soundfile as sf


def file_sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.part")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def balanced_references(count: int, seed: int) -> tuple[list[int], list[int]]:
    rng = random.Random(seed)

    def sequence() -> list[int]:
        values = []
        while len(values) < count:
            batch = list(range(1, 101))
            rng.shuffle(batch)
            values.extend(batch)
        return values[:count]

    first, second = sequence(), sequence()
    for index in range(count):
        if first[index] != second[index]:
            continue
        swap = next(
            candidate for candidate in range(index + 1, count)
            if first[index] != second[candidate] and first[candidate] != second[index]
        )
        second[index], second[swap] = second[swap], second[index]
    return first, second


def normalize(samples: np.ndarray) -> tuple[np.ndarray, dict]:
    samples = np.asarray(samples, dtype=np.float64).reshape(-1)
    rms = float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0
    if rms <= 1e-9:
        raise RuntimeError("generated audio is silent")
    gain = (10 ** (-20.0 / 20.0)) / rms
    peak = float(np.max(np.abs(samples)))
    ceiling = 10 ** (-1.0 / 20.0)
    if peak * gain > ceiling:
        gain = ceiling / peak
    result = np.clip(samples * gain, -1, 1).astype(np.float32)
    return result, {"target_rms_dbfs": -20.0, "gain_db": round(20 * np.log10(gain), 3)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--references", type=Path, required=True)
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--servers", default=",".join(f"http://127.0.0.1:{port}" for port in range(8090, 8098)))
    parser.add_argument("--seed", type=int, required=True)
    args = parser.parse_args()

    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    unique = {}
    for block in payload["blocks"]:
        unique.setdefault(block["sentence_id"], block)
    rows = sorted(unique.values(), key=lambda row: row["sentence_ordinal"])
    first_refs, second_refs = balanced_references(len(rows), args.seed)
    servers = tuple(value.strip() for value in args.servers.split(",") if value.strip())
    if not servers:
        raise RuntimeError("at least one SoulX server is required")
    for server in servers:
        response = requests.get(server + "/health", timeout=10)
        response.raise_for_status()
        if response.json().get("model_loaded") is not True:
            raise RuntimeError(f"SoulX model is not ready: {server}")

    reference_cache = {}
    for number in set(first_refs + second_refs):
        stem = f"ref{number:03d}"
        wav, text = args.references / f"{stem}.wav", args.references / f"{stem}.txt"
        reference_cache[number] = (wav.read_bytes(), wav.name, " ".join(text.read_text(encoding="utf-8").split()))

    work: queue.Queue[tuple[dict, int, int]] = queue.Queue()
    completed = 0
    outputs = {1: args.stage / "audio-a", 2: args.stage / "audio-b"}
    for output in outputs.values():
        output.mkdir(parents=True, exist_ok=True)
    for index, row in enumerate(rows):
        for take, reference in ((1, first_refs[index]), (2, second_refs[index])):
            output = outputs[take]
            wav = output / f"{row['sentence_ordinal']:04d}.wav"
            receipt = output / f"{row['sentence_ordinal']:04d}.json"
            valid = False
            if wav.is_file() and receipt.is_file():
                try:
                    metadata = json.loads(receipt.read_text(encoding="utf-8"))
                    valid = metadata.get("speak_hash") == row["speak_hash"] and metadata.get("sha256") == file_sha256(wav)
                except Exception:
                    pass
            if valid:
                completed += 1
            else:
                work.put((row, take, reference))

    target = len(rows) * 2
    failures = []
    lock = threading.Lock()
    started = time.monotonic()
    status_path = args.stage / "status.json"

    def status(current=None) -> None:
        elapsed = max(0.001, time.monotonic() - started)
        rate = completed / elapsed
        atomic_json(status_path, {
            "state": "failed" if failures else ("complete" if completed == target else "running"),
            "completed": completed, "target": target,
            "audio_a": len(list(outputs[1].glob("[0-9][0-9][0-9][0-9].wav"))),
            "audio_b": len(list(outputs[2].glob("[0-9][0-9][0-9][0-9].wav"))),
            "rate_per_minute": round(rate * 60, 2),
            "eta_seconds": round((target - completed) / rate) if rate else None,
            "current_sentence": current, "failures": failures[-10:],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    status()

    def worker(server: str) -> None:
        nonlocal completed
        session = requests.Session()
        while True:
            try:
                row, take, reference = work.get_nowait()
            except queue.Empty:
                return
            ordinal = int(row["sentence_ordinal"])
            output = outputs[take]
            wav_path, receipt_path = output / f"{ordinal:04d}.wav", output / f"{ordinal:04d}.json"
            audio_bytes, audio_name, prompt = reference_cache[reference]
            try:
                last_error = None
                for retry in range(3):
                    try:
                        response = session.post(
                            server + "/generate",
                            files=[("prompt_audio", (audio_name, audio_bytes, "audio/wav"))],
                            data=[("prompt_texts", prompt), ("dialogue_text", f"[S1]{row['speak_text']}"),
                                  ("seed", str(args.seed + take * 100_000 + ordinal + retry)),
                                  ("temperature", "0.6"), ("top_k", "100"), ("top_p", "0.9"),
                                  ("repetition_penalty", "1.25")], timeout=900,
                        )
                        response.raise_for_status()
                        samples, sample_rate = sf.read(io.BytesIO(response.content), dtype="float32")
                        normalized, normalization = normalize(samples)
                        temporary = wav_path.with_name(f".{wav_path.name}.{os.getpid()}.part")
                        sf.write(temporary, normalized, sample_rate, format="WAV", subtype="PCM_16")
                        os.replace(temporary, wav_path)
                        atomic_json(receipt_path, {
                            "sentence_id": row["sentence_id"], "sentence_ordinal": ordinal,
                            "take_ordinal": take, "display_text": row["display_text"],
                            "speak_text": row["speak_text"], "display_hash": row["display_hash"],
                            "speak_hash": row["speak_hash"], "reference_id": f"ref{reference:03d}",
                            "sample_rate": sample_rate, "normalization": normalization,
                            "sha256": file_sha256(wav_path), "state": "passed",
                        })
                        last_error = None
                        break
                    except Exception as error:
                        last_error = error
                        time.sleep(retry + 1)
                if last_error:
                    raise last_error
                with lock:
                    completed += 1
                    if completed % 10 == 0 or completed == target:
                        status(ordinal)
                        print(json.dumps({"completed": completed, "target": target, "sentence": ordinal}), flush=True)
            except Exception as error:
                with lock:
                    failures.append(f"sentence {ordinal} take {take}: {type(error).__name__}: {error}")
                    status(ordinal)
            finally:
                work.task_done()

    threads = [threading.Thread(target=worker, args=(server,)) for server in servers]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    status()
    if failures or completed != target:
        raise SystemExit(f"generation incomplete: {completed}/{target}; failures={len(failures)}")


if __name__ == "__main__":
    main()
