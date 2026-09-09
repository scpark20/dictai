# Chapter 11 - The Sorting Hat's New Song

181 exercises: 180 body sentences from the supplied Concise Edition (PDF pages 100-108), plus the title. 362 audio files, two different references per sentence.

## Generation

Only OmniVoice is used for synthesis. The corrected 100-reference bank is `/home/scpark/harry-concise-ch10-omni-repair/references`. Each take covers all 100 references with seed 60911362.

Each candidate is screened for speech presence by the existing local recognizer. Empty recognition results trigger a bounded retry with a new seed; after 12 failures, another reference is selected, excluding the other take's speaker. At most 36 attempts are allowed. This is a speech-presence proxy, not a music classifier or a spoken-script accuracy check. The expected script is never passed to the presence checker. No human listening approval is claimed.

Output: `/home/scpark/harry-concise-ch11/`. Title and body display text remain separate from the provided TTS spellings. New pronunciation mappings include Hufflepuff, Seamus, Finnigan and spoken `tair` for written `tear`.

## Source extraction fix

The numbered-row parser now requires horizontal whitespace between a three-digit sentence number and its text. This prevents standalone three-digit page footers from consuming the next page header as a sentence. Existing chapter text is not regenerated or changed.

## Release checks

`tools/check_ch11.py` checks manifest metadata, proper-name indices, all 362 WAV/receipt/reference bindings, speech-presence results, both playback takes and independent Chapter 10/11 positions using a temporary database. No audio-to-script agreement is required.

Only the main app menu and Chapter 11 registration are deployed. Existing Chapter 10 repaired-audio service overrides and saved progress must be preserved. Generation workers release GPU memory on exit.
