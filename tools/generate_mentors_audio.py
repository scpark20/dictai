#!/usr/bin/env python3
"""Generate resumable two-speaker Mentors dialogue audio with OmniVoice."""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import soundfile as sf


DEFAULT_MODEL = "/home/scpark/.cache/huggingface/hub/models--k2-fsa--OmniVoice/snapshots"


def model_path() -> str:
    snapshots = Path(DEFAULT_MODEL)
    candidates = sorted(path for path in snapshots.glob("*") if path.is_dir())
    if not candidates:
        raise RuntimeError("OmniVoice model snapshot is missing")
    return str(candidates[-1])


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + f".{os.getpid()}.part")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def normalize(audio: np.ndarray, target_db: float = -19.0) -> np.ndarray:
    result = np.asarray(audio, dtype=np.float32).reshape(-1)
    rms = float(np.sqrt(np.mean(result * result))) if len(result) else 0.0
    if rms > 1e-6:
        result *= (10 ** (target_db / 20)) / rms
    peak = float(np.max(np.abs(result))) if len(result) else 0.0
    if peak > 0.96:
        result *= 0.96 / peak
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--references", type=Path, default=Path("/home/scpark/harry-concise-ch5/reference-bank"))
    parser.add_argument("--gpu", type=int, required=True)
    parser.add_argument("--shard", type=int, required=True)
    parser.add_argument("--shards", type=int, required=True)
    parser.add_argument("--steps", type=int, default=24)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    os.environ["CUDA_VISIBLE_DEVICES"] = str(args.gpu)
    import torch
    from omnivoice.models.omnivoice import OmniVoice

    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    rows = [row for index, row in enumerate(payload["dialogues"]) if index % args.shards == args.shard]
    if args.limit is not None:
        rows = rows[: args.limit]
    args.output.mkdir(parents=True, exist_ok=True)
    status_path = args.output.parent / f"status-shard-{args.shard}.json"
    model = OmniVoice.from_pretrained(model_path(), device_map="cuda:0", dtype=torch.float16)
    cache: dict[str, tuple[str, str]] = {}

    def reference(reference_id: str) -> tuple[str, str]:
        if reference_id not in cache:
            audio = args.references / f"{reference_id}.wav"
            text = args.references / f"{reference_id}.txt"
            cache[reference_id] = (str(audio), " ".join(text.read_text(encoding="utf-8").split()))
        return cache[reference_id]

    completed = sum((args.output / f"{row['id']}.wav").is_file() for row in rows)
    started = time.time()
    for ordinal, row in enumerate(rows, 1):
        output_audio = args.output / f"{row['id']}.wav"
        output_meta = args.output / f"{row['id']}.json"
        if output_audio.is_file() and output_meta.is_file():
            continue
        plan = row["audio_plan"]
        refs = {"A": reference(plan["speaker_a"]), "B": reference(plan["speaker_b"])}
        texts = [turn["text"] for turn in row["turns"]]
        ref_audio = [refs[turn["speaker"]][0] for turn in row["turns"]]
        ref_text = [refs[turn["speaker"]][1] for turn in row["turns"]]
        generated = model.generate(
            text=texts,
            language=["English"] * len(texts),
            ref_text=ref_text,
            ref_audio=ref_audio,
            num_step=args.steps,
            guidance_scale=2.0,
            speed=1.0,
            denoise=True,
            postprocess_output=True,
            normalize_text=True,
        )
        silence = np.zeros(round(model.sampling_rate * 0.22), dtype=np.float32)
        parts: list[np.ndarray] = []
        boundaries = []
        cursor = 0
        for turn, audio in zip(row["turns"], generated):
            audio = normalize(audio)
            start = cursor / model.sampling_rate
            parts.append(audio)
            cursor += len(audio)
            boundaries.append({"speaker": turn["speaker"], "text": turn["text"], "start": round(start, 3), "end": round(cursor / model.sampling_rate, 3)})
            parts.append(silence)
            cursor += len(silence)
        combined = np.concatenate(parts[:-1]) if parts else np.zeros(1, dtype=np.float32)
        temporary = output_audio.with_suffix(f".wav.{os.getpid()}.part")
        sf.write(temporary, combined, model.sampling_rate, format="WAV", subtype="PCM_16")
        os.replace(temporary, output_audio)
        atomic_json(output_meta, {"id": row["id"], "scene": plan["scene"], "references": [plan["speaker_a"], plan["speaker_b"]], "environment_locked_for_dialogue": True, "turns": boundaries})
        completed += 1
        elapsed = max(0.001, time.time() - started)
        atomic_json(status_path, {"shard": args.shard, "shards": args.shards, "completed": completed, "target": len(rows), "current": row["id"], "dialogues_per_hour": round(completed / elapsed * 3600, 2)})
        print(json.dumps({"completed": completed, "target": len(rows), "id": row["id"]}), flush=True)


if __name__ == "__main__":
    main()
