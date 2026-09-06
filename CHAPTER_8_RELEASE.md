# Harry Potter 5 — Chapter 8: The Hearing

## Scope

- User-provided **A1 English Reader — Concise Edition**, PDF pages **72–79**.
- **160 body sentences**, plus the chapter heading: **161 exercises / 322 audio takes**.
- Matching TTS section: `Chapter Eight. The Hearing.` up to, excluding, `Chapter Nine. The Woes of Missus Weez-lee.`
- Existing SoulX-Podcast-1.7B pipeline and 100-reference voice bank. Each sentence receives two distinct speakers; both take banks cover all 100 references. Seed: `2026090808`.
- Registered in A1 → Book → Harry Potter 5 and in the game Book catalog. Existing chapters, input behavior, model settings and saved learning progress are unchanged.

## Text and audio contract

The PDF is the canonical display source, including `Mrs. Figg`, contractions and names. The matching TTS script alone supplies pronunciation spellings. No pronunciation text is substituted into the UI. The builder checks all 160 source/TTS sentence pairs and records source file hashes. Receipts bind each take to its display text, spoken text, reference ID and WAV hash.

This chapter adds source-attested aliases for Pensieve, Wizengamot, Dolores, Umbridge, Dobby, Dementors, Whinging, Squib/Squibs and Dursleys. Existing whole-sentence restoration guards distinguish past-tense `read` from the color `red`. Proper-name metadata includes this chapter's named people, places and institutions.

## Server storage

Content: `/home/scpark/harry-concise-ch8/`, containing `ch008.json`, `ch008-proper-nouns.json`, `audio-a/`, `audio-b/` and the original documents in `source/`.

Code branch: `feature/harry-chapter-8`. Source documents, audio and generated intermediate files are excluded from Git. Main service deployment changes only the chapter registration/menu; unrelated live edits remain intact. The corresponding commit is also applied to `feature/game-mode`.

## Reproduction

Run on the 68 server, using the existing SoulX environment:

```bash
/home/scpark/miniconda3/envs/soulx/bin/python tools/build_harry_chapter.py \
  --pdf /home/scpark/harry-concise-ch8/source/reader.pdf \
  --tts /home/scpark/harry-concise-ch8/source/tts.txt \
  --chapter 8 --title 'The Hearing' \
  --next-title 'Chapter Nine. The Woes of Missus Weez-lee.' \
  --page-start 72 --page-end 79 --body-sentences 160 \
  --output /home/scpark/harry-concise-ch8/ch008.json \
  --proper-nouns /home/scpark/harry-concise-ch8/ch008-proper-nouns.json
systemd-run --user --unit=dictai-ch8-build \
  --working-directory=/home/scpark/apps/dictai-ch8 \
  /bin/bash /home/scpark/apps/dictai-ch8/tools/run_ch8_build.sh
/home/scpark/miniconda3/envs/soulx/bin/python tools/check_ch8_release.py
```

The build is task-scoped: its GPU workers stop when its service exits. No driver, kernel or global environment changes are required.

## Release checks

`tools/check_ch8_release.py` checks all source/display/spoken pairs, all 322 receipts and WAV hashes, distinct speaker pairs, 100-reference coverage, non-silent finite PCM audio, proper-name indices, both audio takes over HTTP range requests, sentence bounds and independent Chapter 7/8 progress persistence. API checks use a temporary database, not user progress. Audio structural checks are not a claim of human-listened pronunciation accuracy.
