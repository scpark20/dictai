from __future__ import annotations

import copy
import hashlib
import unittest

from dictai_pipeline import PipelineValidationError, validate_manifest_payload, validate_proper_nouns


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def manifest() -> dict:
    display = "Mr. Weasley arrived."
    speak = "Mister Weez-lee arrived."
    base = {
        "sentence_id": "s1",
        "sentence_ordinal": 1,
        "source_display_text": display,
        "display_text": display,
        "speak_text": speak,
        "display_hash": digest(display),
        "speak_hash": digest(speak),
    }
    return {"schema_version": 1, "text_contract_version": 1, "counts": {"sentences": 1}, "blocks": [base]}


def legacy_manifest() -> dict:
    return {
        "schema_version": 1,
        "blocks": [{
            "sentence_id": "legacy-1",
            "sentence_ordinal": 1,
            "display_text": "Legacy display text.",
            "speak_text": "Legacy display text.",
        }],
    }


class ManifestContractTests(unittest.TestCase):
    def test_schema_version_does_not_enable_unrelated_text_contract(self) -> None:
        self.assertEqual(len(validate_manifest_payload(legacy_manifest())), 1)

    def test_source_is_displayed_and_tts_is_independent(self) -> None:
        rows = validate_manifest_payload(manifest())
        self.assertEqual(rows[0]["display_text"], "Mr. Weasley arrived.")
        self.assertEqual(rows[0]["speak_text"], "Mister Weez-lee arrived.")

    def test_tts_text_cannot_leak_into_display(self) -> None:
        payload = manifest()
        payload["blocks"][0]["display_text"] = payload["blocks"][0]["speak_text"]
        payload["blocks"][0]["display_hash"] = digest(payload["blocks"][0]["display_text"])
        with self.assertRaisesRegex(PipelineValidationError, "must exactly equal"):
            validate_manifest_payload(payload)

    def test_stale_hash_is_rejected(self) -> None:
        payload = manifest()
        payload["blocks"][0]["display_hash"] = "0" * 64
        with self.assertRaisesRegex(PipelineValidationError, "invalid display_hash"):
            validate_manifest_payload(payload)

    def test_two_takes_must_use_identical_text(self) -> None:
        payload = manifest()
        second = copy.deepcopy(payload["blocks"][0])
        second["speak_text"] = "Different audio text."
        second["speak_hash"] = digest(second["speak_text"])
        payload["blocks"].append(second)
        with self.assertRaisesRegex(PipelineValidationError, "takes .* disagree"):
            validate_manifest_payload(payload)

    def test_legacy_proper_noun_indices_are_safely_filtered(self) -> None:
        rows = validate_manifest_payload(legacy_manifest())
        metadata = {"sentences": {"legacy-1": {"proper_noun_indices": [0, 99]}}}
        cleaned = validate_proper_nouns(metadata, rows, label="legacy", strict=False)
        self.assertEqual(cleaned["legacy-1"]["proper_noun_indices"], [0])


if __name__ == "__main__":
    unittest.main()
