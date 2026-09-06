# Harry Potter 5 — Chapter 7

## Release

- Title: **The Ministry of Magic**.
- Edition: the user's **A1 English Reader — Concise Edition**.
- Source: reader PDF pages **65–71**, numbered body sentences **001–135**.
- TTS source: `Chapter Seven. The Ministry of Magic.` up to, but excluding, `Chapter Eight. The Hearing.` in the matching Concise TTS script.
- **136 exercises** including the chapter title, **272 audio takes**.
- Audio: existing SoulX generation pipeline and the existing 100-reference voice bank. Each sentence has two different references; both take banks cover all 100 references.
- Canonical display text remains the PDF wording. Pronunciation substitutions appear only in `speak_text`. Hashes bind each receipt to the display, spoken text and generated WAV.

## Data and code separation

Content is served from `/home/scpark/harry-concise-ch7/`: manifest, proper-noun metadata and `audio-a` / `audio-b`. Source documents remain in its `source/` directory. The source PDF, TTS script and audio are not copied into Git.

Code changes are developed in `feature/harry-chapter-7`, based on the preserved live-UI snapshot. The live 8771 checkout's unrelated edits and progress database are retained. The same registration is brought into the game feature branch so its Book menu can also choose Chapter 7.

## Pipeline changes

- Chapter headings use spelled-out numbers, including **Seven**; no fallback to digit-only TTS chapter headings.
- The builder can use the server's existing Poppler extractor instead of changing the speech-generation Python environment.
- Numbered source rows exclude the chapter's sentence-count caption and section headings, and must form one continuous sequence.
- Added source-attested pronunciation aliases for this chapter, with word-boundary matching. Past-tense `read` / spoken `red` is accepted only when the entire restored sentence matches the PDF.
- Source document hashes are recorded in the manifest.

## Checks

`tools/check_ch7_release.py` checks all 272 audio/receipt pairs, text/audio hashes, distinct references, valid non-silent PCM audio, proper-noun indices, chapter API responses, both takes, sentence bounds and independent Chapter 6/7 progress. API tests use a temporary database, never real learning progress.

The generation service is task-scoped. Its GPU worker processes are stopped when the build service exits; no kernel, driver or global environment changes are part of this release.
