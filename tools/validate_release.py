#!/usr/bin/env python3
"""Fail a DictAI release before deployment when its artifacts disagree."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dictai_pipeline import (  # noqa: E402
    PipelineValidationError,
    load_validated_manifest,
    validate_proper_nouns,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--proper-nouns", type=Path)
    parser.add_argument("--audio", type=Path, action="append", default=[])
    args = parser.parse_args()

    _payload, rows = load_validated_manifest(args.manifest)
    if args.proper_nouns:
        proper_payload = json.loads(args.proper_nouns.read_text(encoding="utf-8"))
        validate_proper_nouns(proper_payload, rows, label=str(args.proper_nouns))
    for audio_root in args.audio:
        missing = [row["sentence_ordinal"] for row in rows if not (audio_root / f"{row['sentence_ordinal']:04d}.wav").is_file()]
        if missing:
            preview = ", ".join(map(str, missing[:10]))
            raise PipelineValidationError(f"{audio_root}: missing audio for sentence(s) {preview}")
    print(f"OK: {len(rows)} sentences; display/TTS contract and linked artifacts are valid")


if __name__ == "__main__":
    try:
        main()
    except (PipelineValidationError, OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"INVALID RELEASE: {error}")
