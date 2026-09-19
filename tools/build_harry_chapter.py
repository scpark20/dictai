#!/usr/bin/env python3
"""Build a strict DictAI chapter manifest from the reader PDF and TTS script."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dictai_pipeline import validate_manifest_payload  # noqa: E402


PRONUNCIATIONS = {
    "Missus": "Mrs.", "Weez-lee": "Weasley", "Hed-wig": "Hedwig",
    "Cree-chur": "Kreacher", "Vole-duh-mort": "Voldemort",
    "Hog-warts": "Hogwarts", "Seer-ee-us": "Sirius",
    "Buck-beak": "Buckbeak", "Bog-art": "Boggart",
    "Mun-dung-us": "Mundungus", "Her-my-oh-nee": "Hermione",
    "Reg-yuh-lus": "Regulus", "An-drom-uh-duh": "Andromeda",
    "Mug-ul-born": "Muggle-born", "Mug-uls": "Muggles", "Mug-ul": "Muggle",
    "Nar-siss-uh": "Narcissa", "Loo-see-us": "Lucius", "Mal-foy": "Malfoy",
    "Dray-koh": "Draco", "Bell-uh-tricks": "Bellatrix",
    "Luh-strainj": "Lestrange", "Nev-uhl": "Neville", "Az-kuh-ban": "Azkaban",
    "Dum-bull-door": "Dumbledore", "Puh-troh-nus": "Patronus",
    "Muh-gon-uh-gull": "McGonagall",
}
PROPER_NAMES = {
    "Mrs", "Weasley", "Harry", "Ron", "Hedwig", "Kreacher", "Voldemort",
    "Fred", "George", "Hogwarts", "Doxies", "Sirius", "Buckbeak", "Black",
    "Moody", "Boggart", "Daily", "Prophet", "Mundungus", "Order", "Hermione",
    "James", "Potter", "Uncle", "Alphard", "Regulus", "Death", "Eaters",
    "Andromeda", "Muggle-born", "Tonks", "Narcissa", "Lucius", "Malfoy",
    "Draco", "Bellatrix", "Lestrange", "Neville", "Longbottom", "Azkaban",
    "Privet", "Drive", "Dumbledore", "Patronus", "Ginny", "Snape", "Professor",
    "McGonagall", "Arthur", "Ministry", "Wednesday",
}
WORD_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def readable(spoken: str) -> tuple[str, list[dict[str, str]]]:
    display = spoken
    changes = []
    for pronunciation, spelling in PRONUNCIATIONS.items():
        if pronunciation in display:
            display = display.replace(pronunciation, spelling)
            changes.append({"display": spelling, "speak": pronunciation})
    return display, changes


def comparable(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def pdf_sentences(pdf: Path, page_start: int, page_end: int, expected: int) -> list[str]:
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise RuntimeError("pypdf is required to extract the canonical display text") from error
    reader = PdfReader(pdf)
    found: dict[int, str] = {}
    for page_number in range(page_start, page_end + 1):
        lines = (reader.pages[page_number - 1].extract_text() or "").splitlines()
        for index, line in enumerate(lines[:-1]):
            match = re.fullmatch(r"\s*(\d{3})\s*", line)
            if not match:
                continue
            ordinal = int(match.group(1))
            if 1 <= ordinal <= expected:
                sentence = lines[index + 1].strip()
                if not sentence or re.fullmatch(r"\d+", sentence):
                    raise RuntimeError(f"PDF page {page_number}: missing sentence {ordinal}")
                if ordinal in found and found[ordinal] != sentence:
                    raise RuntimeError(f"PDF sentence {ordinal} is duplicated with different text")
                found[ordinal] = sentence
    missing = [ordinal for ordinal in range(1, expected + 1) if ordinal not in found]
    if missing:
        raise RuntimeError(f"PDF extraction missed sentence(s): {missing[:10]}")
    return [found[ordinal] for ordinal in range(1, expected + 1)]


def tts_sentences(script: Path, heading: str, next_heading: str, expected: int) -> list[str]:
    lines = script.read_text(encoding="utf-8").splitlines()
    start = lines.index(heading)
    end = lines.index(next_heading, start + 1)
    selected = [line.strip() for line in lines[start + 1:end] if line.strip()]
    if len(selected) != expected:
        raise RuntimeError(f"TTS section has {len(selected)} body sentences; expected {expected}")
    return selected


def proper_noun_payload(rows: list[dict]) -> dict:
    sentences = {}
    for row in rows:
        indices = []
        words = WORD_RE.findall(row["display_text"])
        for index, word in enumerate(words):
            base = word.removesuffix("'s")
            if base in PROPER_NAMES:
                indices.append(index)
        sentences[row["sentence_id"]] = {"proper_noun_indices": indices}
    return {"schema_version": 1, "sentence_count": len(rows), "sentences": sentences}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--tts", type=Path, required=True)
    parser.add_argument("--chapter", type=int, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--next-title", required=True)
    parser.add_argument("--page-start", type=int, required=True)
    parser.add_argument("--page-end", type=int, required=True)
    parser.add_argument("--body-sentences", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--proper-nouns", type=Path, required=True)
    args = parser.parse_args()

    chapter_word = {6: "Six"}.get(args.chapter, str(args.chapter))
    heading = f"Chapter {chapter_word}. {args.title}."
    next_heading = args.next_title
    displays = pdf_sentences(args.pdf, args.page_start, args.page_end, args.body_sentences)
    speaks = tts_sentences(args.tts, heading, next_heading, args.body_sentences)
    rows = []
    title_row = {
        "sentence_id": f"ch{args.chapter:03d}-s0001", "sentence_ordinal": 1,
        "kind": "title", "source_display_text": heading, "display_text": heading,
        "speak_text": heading, "display_hash": digest(heading), "speak_hash": digest(heading),
        "pronunciation_changes": [],
    }
    rows.append(title_row)
    for ordinal, (display, speak) in enumerate(zip(displays, speaks), 2):
        restored, changes = readable(speak)
        if comparable(restored) != comparable(display):
            raise RuntimeError(
                f"sentence {ordinal - 1}: PDF/TTS mismatch after pronunciation restoration: "
                f"display={display!r}, restored={restored!r}"
            )
        rows.append({
            "sentence_id": f"ch{args.chapter:03d}-s{ordinal:04d}",
            "sentence_ordinal": ordinal, "kind": "body",
            "source_display_text": display, "display_text": display, "speak_text": speak,
            "display_hash": digest(display), "speak_hash": digest(speak),
            "pronunciation_changes": changes,
        })

    expanded = [
        {**row, "id": f"{row['sentence_id']}-t{take:02d}", "take_ordinal": take}
        for row in rows for take in (1, 2)
    ]
    payload = {
        "schema_version": 1, "text_contract_version": 1,
        "variant": "concise-edition",
        "chapter": {"number": args.chapter, "title": args.title},
        "source": {"pdf_pages": [args.page_start, args.page_end]},
        "counts": {"sentences": len(rows), "body_sentences": len(rows) - 1, "takes": len(expanded)},
        "blocks": expanded,
    }
    validate_manifest_payload(payload, label=str(args.output))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.proper_nouns.write_text(json.dumps(proper_noun_payload(rows), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"chapter": args.chapter, "sentences": len(rows), "takes": len(expanded)}))


if __name__ == "__main__":
    main()
