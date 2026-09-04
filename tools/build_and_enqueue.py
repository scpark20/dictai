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
QUEUE_ROOT = ROOT / "runtime/queue-random100"
OUTPUTS = (ROOT / "audio-random-a", ROOT / "audio-random-b")
PIPELINE = Path("/home/scpark/tts/a1-reader-production-v2/code")
REFERENCES = ROOT / "reference-bank"

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


def balanced_reference_assignments(sentence_count: int) -> tuple[list[int], list[int]]:
    rng = random.Random(5_191_100)
    references = list(range(1, 101))
    total_slots = sentence_count * 2
    base, extra = divmod(total_slots, len(references))
    target_order = references.copy()
    rng.shuffle(target_order)
    target_counts = {reference: base + (reference in target_order[:extra]) for reference in references}

    first_counts = {reference: 1 for reference in references}
    first_extras = references.copy()
    rng.shuffle(first_extras)
    for reference in first_extras[:sentence_count - len(references)]:
        first_counts[reference] += 1
    first_refs = [reference for reference in references for _ in range(first_counts[reference])]
    second_refs = [reference for reference in references for _ in range(target_counts[reference] - first_counts[reference])]
    rng.shuffle(first_refs)
    rng.shuffle(second_refs)

    for index in range(sentence_count):
        if first_refs[index] != second_refs[index]:
            continue
        swap_index = next(
            candidate
            for candidate in range(index + 1, sentence_count)
            if second_refs[candidate] != first_refs[index]
            and second_refs[index] != first_refs[candidate]
        )
        second_refs[index], second_refs[swap_index] = second_refs[swap_index], second_refs[index]
    assert all(left != right for left, right in zip(first_refs, second_refs))
    return first_refs, second_refs


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

    first_refs, second_refs = balanced_reference_assignments(len(rows))
    assignments = [{"sentence_ordinal": row["sentence_ordinal"], "take_1": f"ref{first_refs[index]:03d}", "take_2": f"ref{second_refs[index]:03d}"} for index, row in enumerate(rows)]
    (ROOT / "manifest/reference-assignments.json").write_text(json.dumps(assignments, indent=2) + "\n", encoding="utf-8")

    queue = JsonJobQueue(QUEUE_ROOT)
    submitted = 0
    for take_index, output in enumerate(OUTPUTS, 1):
        output.mkdir(parents=True, exist_ok=True)
        for batch_index, row in enumerate(rows):
            ref_number = first_refs[batch_index] if take_index == 1 else second_refs[batch_index]
            ref_audio = REFERENCES / f"ref{ref_number:03d}.wav"
            ref_text_path = REFERENCES / f"ref{ref_number:03d}.txt"
            prompt_text = " ".join(ref_text_path.read_text(encoding="utf-8").split())
            blocks = [
                {
                    "id": f"{row['sentence_ordinal']:04d}",
                    "kind": row["kind"],
                    "display_text": row["display_text"],
                    "display_hash": row["display_hash"],
                    "speak_text": row["speak_text"],
                    "speak_hash": row["speak_hash"],
                }
            ]
            job = {
                "schema_version": 1,
                "job_id": f"concise-ch005-random100-t{take_index}-s{row['sentence_ordinal']:04d}",
                "chapter": 5,
                "batch_index": batch_index,
                "seed": 5_000_000 + take_index * 100_000 + batch_index,
                "prompt_audio": str(ref_audio),
                "prompt_audio_sha256": digest_file(ref_audio),
                "prompt_text": prompt_text,
                "prompt_text_sha256": digest_text(prompt_text),
                "output_dir": str(output),
                "blocks": blocks,
                "tail_batch": True,
                "max_attempts": 3,
            }
            queue.submit(job)
            submitted += 1

    print(json.dumps({"sentences": len(rows), "audio_files": len(rows) * 2, "jobs": submitted}))


if __name__ == "__main__":
    main()
