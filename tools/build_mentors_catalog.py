#!/usr/bin/env python3
"""Build DictAI's runtime conversation catalog from classified Mentors data."""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = json.loads(args.manifest.read_text(encoding="utf-8"))
    levels: dict[str, dict[str, list[dict[str, object]]]] = defaultdict(lambda: defaultdict(list))
    for row in source["dialogues"]:
        category = row["category"]
        turns = [turn["text"] for turn in row["turns"]]
        levels[row["level"]][category].append({
            "number": len(levels[row["level"]][category]) + 1,
            "id": row["id"],
            "expression": row["expression"],
            "turns": turns,
            "turn_speakers": [turn["speaker"] for turn in row["turns"]],
            "text": " ".join(turns),
            "audio": f"mentors/audio/{row['id']}.wav",
            "scene": row["audio_plan"]["scene"],
            "references": [row["audio_plan"]["speaker_a"], row["audio_plan"]["speaker_b"]],
            "source": {"chapter": row["chapter"], "unit": row["unit"], "timestamp": row["timestamp"]},
        })
    payload = {"schema_version": 2, "source": source["source"], "levels": levels}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({level: {topic: len(items) for topic, items in topics.items()} for level, topics in levels.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
