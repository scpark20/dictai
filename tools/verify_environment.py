#!/usr/bin/env python3
"""Verify the restored Chapter 5 program and its optional runtime assets."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path(os.environ.get("DICTAI_MANIFEST", ROOT / "data" / "ch005.json"))
PROPER_NOUNS = Path(os.environ.get("DICTAI_PROPER_NOUNS", ROOT / "data" / "ch005-proper-nouns.json"))
AUDIO_A = Path(os.environ.get("DICTAI_AUDIO_A", "/home/scpark/harry-concise-ch5/audio-a"))
AUDIO_B = Path(os.environ.get("DICTAI_AUDIO_B", "/home/scpark/harry-concise-ch5/audio-b"))


def text_hash(value: str) -> str:
    return hashlib.sha256(" ".join(value.split()).encode()).hexdigest()


def verify_manifest() -> list[dict]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert data["chapter"]["number"] == 5
    assert data["counts"] == {"sentences": 191, "body_sentences": 190, "takes": 382}
    rows: dict[str, dict] = {}
    takes: dict[str, set[int]] = {}
    for block in data["blocks"]:
        rows.setdefault(block["sentence_id"], block)
        takes.setdefault(block["sentence_id"], set()).add(int(block["take_ordinal"]))
        assert block["display_hash"] == text_hash(block["display_text"])
        assert block["speak_hash"] == text_hash(block["speak_text"])
    ordered = sorted(rows.values(), key=lambda row: int(row["sentence_ordinal"]))
    assert len(ordered) == 191
    assert [int(row["sentence_ordinal"]) for row in ordered] == list(range(1, 192))
    assert all(value == {1, 2} for value in takes.values())
    assert ordered[0]["display_text"] == "Chapter Five. The Order of the Phoenix."
    assert ordered[0]["speak_text"] == "Chapter Five. The Order of the Phoenix."
    return ordered


def verify_proper_nouns(rows: list[dict]) -> None:
    data = json.loads(PROPER_NOUNS.read_text(encoding="utf-8"))
    sentence_ids = {row["sentence_id"] for row in rows}
    assert set(data.get("sentences", {})).issubset(sentence_ids)


def verify_audio(root: Path, label: str) -> str:
    if not root.is_dir():
        return f"{label}: skipped (runtime directory is not mounted)"
    missing = [index for index in range(1, 192) if not (root / f"{index:04d}.wav").is_file()]
    assert not missing, f"{label}: missing {len(missing)} files, first={missing[:5]}"
    return f"{label}: 191/191"


def main() -> None:
    rows = verify_manifest()
    verify_proper_nouns(rows)
    print("manifest: 191 sentences, 382 takes, hashes valid")
    print("proper nouns: valid")
    print(verify_audio(AUDIO_A, "audio A"))
    print(verify_audio(AUDIO_B, "audio B"))
    print("environment verification: PASS")


if __name__ == "__main__":
    main()
