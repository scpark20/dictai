# Chapter 9 — The Woes of Mrs. Weasley

- Source: user-provided A1 English Reader, Concise Edition, PDF pages 80–91, body rows 001–220.
- 221 exercises including the chapter heading, 442 audio takes.
- Existing SoulX-Podcast-1.7B pipeline and 100-reference bank; two distinct references per sentence. Both take banks cover all 100 references. Seed: 2026090909.
- TTS source: `Chapter Nine. The Woes of Missus Weez-lee.` to, excluding, `Chapter Ten. Luna Lovegood.`
- Screen text remains the PDF wording. The title now explicitly supports separate canonical and spoken forms via `--tts-title`; pronunciation restoration must agree before any generation. This prevents `Missus Weez-lee` from leaking into the chapter title.
- Added source-attested aliases and proper names for Chapter 9. No previous chapter content is regenerated.
- Server content: `/home/scpark/harry-concise-ch9/`, with original documents in `source/`, manifest `ch009.json`, proper-noun metadata and `audio-a/` / `audio-b/`.
- Code branch: `feature/harry-chapter-9`; registration also applies to `feature/game-mode`. Original documents and audio are not stored in Git.

## Build

```bash
cd /home/scpark/apps/dictai-ch9
/home/scpark/miniconda3/envs/soulx/bin/python tools/build_harry_chapter.py \
  --pdf /home/scpark/harry-concise-ch9/source/reader.pdf \
  --tts /home/scpark/harry-concise-ch9/source/tts.txt \
  --chapter 9 --title 'The Woes of Mrs. Weasley' \
  --tts-title 'The Woes of Missus Weez-lee' \
  --next-title 'Chapter Ten. Luna Lovegood.' \
  --page-start 80 --page-end 91 --body-sentences 220 \
  --output /home/scpark/harry-concise-ch9/ch009.json \
  --proper-nouns /home/scpark/harry-concise-ch9/ch009-proper-nouns.json
systemd-run --user --unit=dictai-ch9-build \
  --working-directory=/home/scpark/apps/dictai-ch9 \
  /bin/bash /home/scpark/apps/dictai-ch9/tools/run_ch9_build.sh
/home/scpark/miniconda3/envs/soulx/bin/python tools/check_ch9_release.py
```

Checks cover every source/display/TTS pair, audio receipt and WAV hash, distinct speaker pairs, reference coverage, valid non-silent audio, title/body proper names, both audio takes, sentence bounds and separate Chapter 8/9 progress. API tests use a temporary database. These structural checks do not constitute human listening to every take.

Deploy only scoped chapter changes, preserve the live progress database, and restart the persistent 8771 service. Build-owned GPU workers stop with the task-scoped generation service. Kernel, drivers and recognition settings remain unchanged.
