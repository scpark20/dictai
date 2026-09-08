# Chapter 10 — OmniVoice reference refresh

Replaces only Chapter 10 playback audio on server 68. Existing display/TTS text, chapters and learning progress are unchanged. SoulX is not used for synthesis.

- 151 sentences, 302 WAV files (two different references per sentence).
- Reference bank: `/home/scpark/omni-reference-100-v2/selected/` (100 selected OmniVoice references).
- Each take covers all 100 references; assignment seed 60910302.
- Synthesis uses OmniVoice voice-clone prompts with reference audio and its matching transcript, not generic voice-design instructions.
- Output: `/home/scpark/harry-concise-ch10-omni-v2/audio-a/` and `audio-b/`.
- Receipts bind source text, reference WAV/transcript hashes, output hashes, engine, take and random seed. Resume validation checks the engine and reference hash as well as the text.
- Both generation workers finished and released their GPUs.

`tools/check_omni_ch10.py` checks all 302 files, reference binding, source text preservation, distinct paired reference IDs, complete reference coverage, valid non-silent audio, actual bytes returned by both HTTP take routes, and independent Chapter 9/10 progress. HTTP tests use a temporary database. No claim of human listening approval is made.

The service drop-in `deploy/ch10-omni-v2.conf` points only Chapter 10 audio to the new directories. The former Chapter 10 audio directories remain untouched for rollback. Progress was backed up before the restart in `/home/scpark/harry-concise-ch10-omni-v2/deploy-backup/`.

Generation code: `tools/omni_chapter10.py`. Run each take in the existing OmniVoice environment with a separate GPU and `--take 1` or `--take 2`. The generation tasks do not alter the web application.
