#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import random
import sys
from pathlib import Path


ROOT = Path("/home/scpark/harry-concise-ch5")
SOURCE = ROOT / "source/concise-tts.txt"
MANIFEST = ROOT / "manifest/ch005.json"
QUEUE_ROOT = ROOT / "runtime/queue"
OUTPUTS = (ROOT / "audio-a", ROOT / "audio-b")
PIPELINE = Path("/home/scpark/tts/a1-reader-production-v2/code")
REFERENCES = Path("/home/scpark/tts/a1-reader-production-v2/artifacts/references")
TAKE_REFS = (4, 5)  # female and male voices

PRONUNCIATIONS = {
    "Az-kuh-ban": "Azkaban",
    "Cree-chur": "Kreacher",
    "Crook-shanks": "Crookshanks",
    "Dih-men-tors": "Dementors",
    "Dum-bull-door": "Dumbledore",
    "Gring-otts": "Gringotts",
    "Her-my-oh-nee": "Hermione",
    "Im-peer-ee-us": "Imperius",
    "Kingz-lee": "Kingsley",
    "Loo-pin": "Lupin",
    "Mug-ul": "Muggle",
    "Mun-dung-us": "Mundungus",
    "Seer-ee-us": "Sirius",
    "Vole-duh-mort": "Voldemort",
    "Weez-lee": "Weasley",
}


def digest_text(text: str) -> str:
    return hashlib.sha256(" ".join(text.split()).encode()).hexdigest()


def digest_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def chapter_lines() -> list[str]:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("Chapter Five."))
    end = next(i for i, line in enumerate(lines[start + 1 :], start + 1) if line.startswith("Chapter Six."))
    selected = [line.strip() for line in lines[start:end] if line.strip()]
    if len(selected) != 191:
        raise RuntimeError(f"expected title + 190 sentences, found {len(selected)}")
    return selected


def readable(spoken: str) -> str:
    result = spoken
    for pronunciation, spelling in PRONUNCIATIONS.items():
        result = result.replace(pronunciation, spelling)
    return result


def main() -> None:
    sys.path.insert(0, str(PIPELINE))
    from soulx_job_queue import JsonJobQueue

    spoken_lines = chapter_lines()
    rows = []
    for ordinal, speak_text in enumerate(spoken_lines, 1):
        display_text = readable(speak_text)
        sentence_id = f"ch005-s{ordinal:04d}"
        rows.append({
            "sentence_id": sentence_id,
            "sentence_ordinal": ordinal,
            "kind": "title" if ordinal == 1 else "body",
            "source_display_text": display_text,
            "display_text": display_text,
            "speak_text": speak_text,
            "display_hash": digest_text(display_text),
            "speak_hash": digest_text(speak_text),
            "pronunciation_changes": [
                {"display": spelling, "speak": pronunciation}
                for pronunciation, spelling in PRONUNCIATIONS.items()
                if pronunciation in speak_text
            ],
        })

    expanded = []
    for row in rows:
        for take in (1, 2):
            expanded.append({**row, "id": f"{row['sentence_id']}-t{take:02d}", "take_ordinal": take})

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "schema_version": 1,
        "variant": "concise-edition",
        "chapter": {"number": 5, "title": "The Order of the Phoenix"},
        "counts": {"sentences": len(rows), "body_sentences": len(rows) - 1, "takes": len(expanded)},
        "blocks": expanded,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    queue = JsonJobQueue(QUEUE_ROOT)
    submitted = 0
    for take_index, (output, ref_number) in enumerate(zip(OUTPUTS, TAKE_REFS), 1):
        output.mkdir(parents=True, exist_ok=True)
        ref_audio = REFERENCES / f"ch{ref_number:03d}.wav"
        ref_text_path = REFERENCES / f"ch{ref_number:03d}.txt"
        prompt_text = " ".join(ref_text_path.read_text(encoding="utf-8").split())
        for batch_index, start in enumerate(range(0, len(rows), 8)):
            batch_rows = rows[start : start + 8]
            blocks = [
                {
                    "id": f"{row['sentence_ordinal']:04d}",
                    "kind": row["kind"],
                    "display_text": row["display_text"],
                    "display_hash": row["display_hash"],
                    "speak_text": row["speak_text"],
                    "speak_hash": row["speak_hash"],
                }
                for row in batch_rows
            ]
            job = {
                "schema_version": 1,
                "job_id": f"concise-ch005-t{take_index}-b{batch_index:03d}",
                "chapter": 5,
                "batch_index": batch_index,
                "seed": 5_000_000 + take_index * 100_000 + batch_index,
                "prompt_audio": str(ref_audio),
                "prompt_audio_sha256": digest_file(ref_audio),
                "prompt_text": prompt_text,
                "prompt_text_sha256": digest_text(prompt_text),
                "output_dir": str(output),
                "blocks": blocks,
                "tail_batch": len(blocks) < 4,
                "max_attempts": 3,
            }
            queue.submit(job)
            submitted += 1

    print(json.dumps({"sentences": len(rows), "audio_files": len(rows) * 2, "jobs": submitted}))


if __name__ == "__main__":
    main()
