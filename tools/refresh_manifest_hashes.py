#!/usr/bin/env python3
"""Re-seal text hashes after an intentional source/TTS manifest edit."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dictai_pipeline import text_sha256, validate_manifest_payload  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    for block in payload.get("blocks", []):
        # Refuse to conceal the critical source/display mix-up by refreshing it.
        if block.get("source_display_text") != block.get("display_text"):
            raise SystemExit(
                f"REFUSED: {block.get('sentence_id')} display_text differs from source_display_text"
            )
        block["display_hash"] = text_sha256(block["display_text"])
        block["speak_hash"] = text_sha256(block.get("speak_text", block["display_text"]))
    validate_manifest_payload(payload, label=str(args.manifest))
    temporary = args.manifest.with_suffix(args.manifest.suffix + f".{os.getpid()}.part")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, args.manifest)
    print(f"Re-sealed {args.manifest}")


if __name__ == "__main__":
    main()
