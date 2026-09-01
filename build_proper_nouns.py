#!/usr/bin/env python3
"""Build proper-noun metadata once, before dictation problems are served."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import spacy


WORD_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")
ENTITY_LABELS = {
    "PERSON", "NORP", "FAC", "ORG", "GPE", "LOC", "PRODUCT",
    "EVENT", "WORK_OF_ART", "LAW", "LANGUAGE",
}
ENTITY_EXCLUDED_POS = {"DET", "ADP", "AUX", "CCONJ", "SCONJ", "PART", "PRON", "PUNCT"}
ALWAYS_EXCLUDED_WORDS = {"chapter"}


def unique_sentences(manifest: dict) -> list[dict]:
    unique: dict[str, dict] = {}
    for block in manifest["blocks"]:
        unique.setdefault(block["sentence_id"], block)
    return sorted(unique.values(), key=lambda item: item["sentence_ordinal"])


def build(manifest_path: Path, output_path: Path) -> None:
    nlp = spacy.load("en_core_web_sm")
    rows = unique_sentences(json.loads(manifest_path.read_text(encoding="utf-8")))
    texts = [row["display_text"] for row in rows]
    sentences: dict[str, dict] = {}

    for row, doc in zip(rows, nlp.pipe(texts, batch_size=64), strict=True):
        words = list(WORD_RE.finditer(row["display_text"]))
        entity_spans = [
            (token.idx, token.idx + len(token.text), entity.label_)
            for entity in doc.ents
            if entity.label_ in ENTITY_LABELS
            for token in entity
            if token.pos_ not in ENTITY_EXCLUDED_POS
            and token.text.casefold() not in ALWAYS_EXCLUDED_WORDS
        ]
        token_spans = [
            (token.idx, token.idx + len(token.text), "PROPN")
            for token in doc
            if token.pos_ == "PROPN"
            and token.text.casefold() not in ALWAYS_EXCLUDED_WORDS
        ]
        evidence = entity_spans + token_spans
        indices = []
        details = []
        for index, word in enumerate(words):
            labels = sorted({
                label for start, end, label in evidence
                if word.start() < end and word.end() > start
            })
            if not labels:
                continue
            indices.append(index)
            details.append({"index": index, "word": word.group(0), "labels": labels})

        sentences[row["sentence_id"]] = {
            "sentence_ordinal": row["sentence_ordinal"],
            "proper_noun_indices": indices,
            "proper_nouns": details,
        }

    payload = {
        "schema_version": 1,
        "generator": "spacy/en_core_web_sm-3.8.0",
        "sentence_count": len(sentences),
        "sentences": sentences,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.manifest, args.output)


if __name__ == "__main__":
    main()
