#!/usr/bin/env python3
"""Parse the Mentors Chapters 01-09 transcript into dialogue records."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


PAGE_RE = re.compile(r"^=== PAGE (\d+)(?: ([LR]))? ===$")
UNIT_RE = re.compile(r"^UNIT\s+(\d+)\s+(.+?)\s+(\d+)\s+expr\.$")
UNIT_SPLIT_RE = re.compile(r"^UNIT\s+(\d+)\s+(.+)$")
EXPRESSION_RE = re.compile(r"^(.+?)\s+(\d{2}:\d{2})$")
TURN_RE = re.compile(r"^([AB])\s+(.+)$")
IGNORE_EXACT = {"Chapters 01-09", "____________________"}


def parse(path: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    chapter = 0
    unit = 0
    unit_title = ""
    page = 0
    column = ""
    current: dict[str, object] | None = None

    def finish() -> None:
        nonlocal current
        if current and current["turns"]:
            rows.append(current)
        current = None

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        match = PAGE_RE.match(line)
        if match:
            page, column = int(match.group(1)), match.group(2) or ""
            continue
        match = re.match(r"^CHAPTER\s+(\d{2})$", line)
        if match:
            finish()
            chapter = int(match.group(1))
            continue
        match = UNIT_RE.match(line)
        if match:
            finish()
            unit = int(match.group(1))
            unit_title = match.group(2).strip()
            continue
        match = UNIT_SPLIT_RE.match(line)
        if match:
            finish()
            unit = int(match.group(1))
            unit_title = match.group(2).strip()
            continue
        match = EXPRESSION_RE.match(line)
        if match and chapter and unit:
            finish()
            current = {
                "id": "",
                "chapter": chapter,
                "unit": unit,
                "unit_title": unit_title,
                "expression": match.group(1).strip(),
                "timestamp": match.group(2),
                "page": page,
                "column": column,
                "turns": [],
            }
            continue
        match = TURN_RE.match(line)
        if match and current:
            current["turns"].append({"speaker": match.group(1), "text": match.group(2).strip()})
            continue
        if current and current["turns"] and line not in IGNORE_EXACT and not line.startswith("QUICK REVIEW"):
            # Wrapped dialogue text has no speaker prefix.
            if not re.match(r"^(Audio:|Units\s|\[\d{2}:\d{2}\]|SMART ENGLISH|REPEATED IN SOURCE AUDIO$|\d+\s+expr\.$|\d{1,3}$)", line):
                current["turns"][-1]["text"] += " " + line
    finish()

    for index, row in enumerate(rows, 1):
        row["id"] = f"mentors-c{int(row['chapter']):02d}-e{index:04d}"
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rows = parse(args.source)
    payload = {"schema_version": 1, "count": len(rows), "dialogues": rows}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "count": len(rows),
        "chapters": {str(chapter): sum(1 for row in rows if row["chapter"] == chapter) for chapter in range(1, 10)},
        "turn_counts": {str(count): sum(1 for row in rows if len(row["turns"]) == count) for count in sorted({len(row["turns"]) for row in rows})},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
