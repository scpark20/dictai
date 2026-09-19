"""Create Chapter 21-38 manifests and one combined Chapter 15-38 TTS batch."""

from __future__ import annotations

import difflib
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/home/scpark/apps/echostep-dev")
from dictai_pipeline import validate_manifest_payload  # noqa: E402


PDF = Path("/home/scpark/harry-concise-ch10/source/reader.pdf")
TTS = Path("/home/scpark/harry-concise-ch10/source/tts.txt")

CHAPTERS = (
    (21, "Twenty-One", "The Eye of the Snake", "Chapter Twenty-One. The Eye of the Snake.", 199, 210, 240),
    (22, "Twenty-Two", "St. Mungo's Hospital for Magical Maladies and Injuries", "Chapter Twenty-Two. Saint Mungo's Hospital for Magical Maladies and Injuries.", 211, 222, 225),
    (23, "Twenty-Three", "Christmas on the Closed Ward", "Chapter Twenty-Three. Christmas on the Closed Ward.", 223, 234, 230),
    (24, "Twenty-Four", "Occlumency", "Chapter Twenty-Four. Ock-loo-men-see.", 235, 245, 210),
    (25, "Twenty-Five", "The Beetle at Bay", "Chapter Twenty-Five. The Beetle at Bay.", 246, 255, 200),
    (26, "Twenty-Six", "Seen and Unforeseen", "Chapter Twenty-Six. Seen and Unforeseen.", 256, 266, 220),
    (27, "Twenty-Seven", "The Centaur and the Sneak", "Chapter Twenty-Seven. The Centaur and the Sneak.", 267, 278, 240),
    (28, "Twenty-Eight", "Snape's Worst Memory", "Chapter Twenty-Eight. Snape's Worst Memory.", 279, 291, 255),
    (29, "Twenty-Nine", "Career Advice", "Chapter Twenty-Nine. Career Advice.", 292, 301, 190),
    (30, "Thirty", "Grawp", "Chapter Thirty. Grawp.", 302, 310, 175),
    (31, "Thirty-One", "O.W.L.s", "Chapter Thirty-One. O W L exams.", 311, 322, 235),
    (32, "Thirty-Two", "Out of the Fire", "Chapter Thirty-Two. Out of the Fire.", 323, 333, 210),
    (33, "Thirty-Three", "Fight and Flight", "Chapter Thirty-Three. Fight and Flight.", 334, 342, 170),
    (34, "Thirty-Four", "The Department of Mysteries", "Chapter Thirty-Four. The Department of Mysteries.", 343, 351, 170),
    (35, "Thirty-Five", "Beyond the Veil", "Chapter Thirty-Five. Beyond the Veil.", 352, 364, 255),
    (36, "Thirty-Six", "The Only One He Ever Feared", "Chapter Thirty-Six. The Only One He Ever Feared.", 365, 374, 190),
    (37, "Thirty-Seven", "The Lost Prophecy", "Chapter Thirty-Seven. The Lost Prophecy.", 375, 387, 255),
    (38, "Thirty-Eight", "The Second War Begins", "Chapter Thirty-Eight. The Second War Begins.", 388, 399, 230),
)


def sha_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def comparable(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def pdf_rows(start: int, end: int, count: int) -> list[str]:
    text = subprocess.check_output(
        ["pdftotext", "-f", str(start), "-l", str(end), "-layout", str(PDF), "-"],
        text=True,
    )
    found = {}
    for line in text.splitlines():
        match = re.match(r"^\s*(\d{3})\s+(.+?)\s*$", line)
        if match:
            found[int(match.group(1))] = match.group(2)
    return [found[index] for index in range(1, count + 1)]


def tts_rows(heading: str, count: int) -> list[str]:
    lines = TTS.read_text(encoding="utf-8").splitlines()
    start = lines.index(heading)
    return [line.strip() for line in lines[start + 1 :] if line.strip()][:count]


def build(config: tuple) -> dict:
    number, word, title, speak_title, start, end, count = config
    displays = pdf_rows(start, end, count)
    speaks = tts_rows(speak_title, count)
    if len(displays) != count or len(speaks) != count:
        raise RuntimeError(f"Chapter {number}: expected {count}, got PDF={len(displays)} TTS={len(speaks)}")
    display_title = f"Chapter {word}. {title}."
    source_rows = [(display_title, speak_title, "title"), *[(a, b, "body") for a, b in zip(displays, speaks)]]
    rows = []
    for ordinal, (display, speak, kind) in enumerate(source_rows, 1):
        rows.append({
            "sentence_id": f"ch{number:03d}-s{ordinal:04d}",
            "sentence_ordinal": ordinal,
            "kind": kind,
            "source_display_text": display,
            "display_text": display,
            "speak_text": speak,
            "display_hash": sha_text(display),
            "speak_hash": sha_text(speak),
            "pronunciation_changes": [],
        })
    blocks = [{**row, "id": f"{row['sentence_id']}-t{take:02d}", "take_ordinal": take} for row in rows for take in (1, 2)]
    payload = {
        "schema_version": 1,
        "text_contract_version": 1,
        "variant": "concise-edition",
        "chapter": {"number": number, "title": title},
        "source": {"pdf_pages": [start, end], "pdf_sha256": sha_file(PDF), "tts_sha256": sha_file(TTS)},
        "counts": {"sentences": len(rows), "body_sentences": count, "takes": len(blocks)},
        "blocks": blocks,
    }
    root = Path(f"/home/scpark/harry-concise-ch{number}")
    target = root / f"ch{number:03d}.json"
    validate_manifest_payload(payload, label=str(target))
    root.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    for config in CHAPTERS:
        payload = build(config)
        print(f"chapter {config[0]}: {payload['counts']['sentences']} sentences")
    combined_blocks = []
    for number in range(15, 39):
        path = Path(f"/home/scpark/harry-concise-ch{number}/ch{number:03d}.json")
        combined_blocks.extend(json.loads(path.read_text(encoding="utf-8"))["blocks"])
    combined = {"blocks": combined_blocks}
    target = Path("/home/scpark/harry-concise-ch15-38-batch.json")
    target.write_text(json.dumps(combined, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"batch: {len(combined_blocks) // 2} sentences, {len(combined_blocks)} takes")


if __name__ == "__main__":
    main()
