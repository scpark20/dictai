"""Shared validation rules for DictAI manifests and derived artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


class PipelineValidationError(RuntimeError):
    """Raised when an artifact is unsafe to serve or publish."""


def text_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _required_text(block: dict[str, Any], field: str, location: str) -> str:
    value = block.get(field)
    if not isinstance(value, str) or not value.strip():
        raise PipelineValidationError(f"{location}: {field} must be non-empty text")
    return value


def validate_manifest_payload(payload: dict[str, Any], *, label: str = "manifest") -> list[dict[str, Any]]:
    """Validate and return one canonical row per sentence.

    Schema v1+ enforces the display/TTS boundary. Older manifests remain readable,
    but still receive identity, ordering, and duplicate consistency checks.
    """
    blocks = payload.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        raise PipelineValidationError(f"{label}: blocks must be a non-empty list")

    # schema_version belongs to each historical manifest format. The text
    # contract is independently versioned so an older schema_version=1 file
    # is not accidentally treated as a source/display/TTS contract manifest.
    contract_version = int(payload.get("text_contract_version", 0) or 0)
    strict = contract_version >= 1
    canonical: dict[str, dict[str, Any]] = {}
    ordinals: dict[int, str] = {}
    for index, block in enumerate(blocks):
        location = f"{label}: blocks[{index}]"
        if not isinstance(block, dict):
            raise PipelineValidationError(f"{location} must be an object")
        sentence_id = _required_text(block, "sentence_id", location)
        ordinal = block.get("sentence_ordinal")
        if not isinstance(ordinal, int) or ordinal < 1:
            raise PipelineValidationError(f"{location}: sentence_ordinal must be a positive integer")

        display = _required_text(block, "display_text", location)
        speak = block.get("speak_text", display)
        if not isinstance(speak, str) or not speak.strip():
            raise PipelineValidationError(f"{location}: speak_text must be non-empty text")

        if strict:
            source = _required_text(block, "source_display_text", location)
            if display != source:
                raise PipelineValidationError(
                    f"{location}: display_text must exactly equal source_display_text; "
                    "pronunciation expansion belongs only in speak_text"
                )
            for field, value in (("display_hash", display), ("speak_hash", speak)):
                expected = text_sha256(value)
                if block.get(field) != expected:
                    raise PipelineValidationError(f"{location}: invalid {field}")

        previous = canonical.get(sentence_id)
        if previous is not None:
            comparable = ("sentence_ordinal", "source_display_text", "display_text", "speak_text")
            mismatched = [field for field in comparable if previous.get(field) != block.get(field)]
            if mismatched:
                raise PipelineValidationError(
                    f"{location}: takes for {sentence_id} disagree on {', '.join(mismatched)}"
                )
            continue

        if ordinal in ordinals:
            raise PipelineValidationError(
                f"{location}: ordinal {ordinal} is shared by {ordinals[ordinal]} and {sentence_id}"
            )
        ordinals[ordinal] = sentence_id
        canonical[sentence_id] = block

    rows = sorted(canonical.values(), key=lambda row: row["sentence_ordinal"])
    actual = [row["sentence_ordinal"] for row in rows]
    expected = list(range(1, len(rows) + 1))
    if actual != expected:
        raise PipelineValidationError(f"{label}: sentence ordinals must be continuous from 1")

    declared = payload.get("counts", {}).get("sentences") if isinstance(payload.get("counts"), dict) else None
    if declared is not None and declared != len(rows):
        raise PipelineValidationError(
            f"{label}: counts.sentences is {declared}, but {len(rows)} unique sentences exist"
        )
    return rows


def load_validated_manifest(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PipelineValidationError(f"{path}: cannot read manifest: {error}") from error
    if not isinstance(payload, dict):
        raise PipelineValidationError(f"{path}: manifest root must be an object")
    return payload, validate_manifest_payload(payload, label=str(path))


def validate_proper_nouns(
    payload: dict[str, Any],
    rows: list[dict[str, Any]],
    *,
    label: str,
    strict: bool = True,
) -> dict[str, Any]:
    sentences = payload.get("sentences", {})
    if not isinstance(sentences, dict):
        raise PipelineValidationError(f"{label}: sentences must be an object")
    row_by_id = {row["sentence_id"]: row for row in rows}
    cleaned: dict[str, Any] = {}
    for sentence_id, metadata in sentences.items():
        if sentence_id not in row_by_id:
            if strict:
                raise PipelineValidationError(f"{label}: unknown sentence id {sentence_id}")
            continue
        indices = metadata.get("proper_noun_indices", []) if isinstance(metadata, dict) else None
        if not isinstance(indices, list) or any(not isinstance(value, int) for value in indices):
            if strict:
                raise PipelineValidationError(f"{label}: invalid indices for {sentence_id}")
            continue
        word_count = len(__import__("re").findall(r"[A-Za-z]+(?:['-][A-Za-z]+)*", row_by_id[sentence_id]["display_text"]))
        valid_indices = [value for value in indices if 0 <= value < word_count]
        if strict and valid_indices != indices:
            raise PipelineValidationError(f"{label}: out-of-range index for {sentence_id}")
        cleaned_metadata = dict(metadata)
        cleaned_metadata["proper_noun_indices"] = valid_indices
        cleaned[sentence_id] = cleaned_metadata
    return cleaned
