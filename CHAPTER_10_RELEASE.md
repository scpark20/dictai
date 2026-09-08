# Chapter 10 — Luna Lovegood

- User-provided Concise Edition, PDF pages 92–99; 150 numbered body sentences.
- 151 exercises including the title, 302 audio takes.
- Matching TTS section: `Chapter Ten. Luna Lovegood.` through, excluding, `Chapter Eleven. The Sorting Hat's New Song.`
- SoulX-Podcast-1.7B on server 68; existing 100-reference voice bank. Each sentence has two distinct references, and each take bank covers all 100 references. Seed: 2026091010.
- Display stays identical to the reader PDF; TTS spelling remains separate. Source-attested aliases include Cho, Mimbulus mimbletonia, Slytherin/Slytherins, Grubbly-Plank and other chapter names. Spoken `reed` restores to `read` only if the complete sentence agrees with the PDF.
- Runtime data: `/home/scpark/harry-concise-ch10/` with `ch010.json`, `ch010-proper-nouns.json`, `audio-a/`, `audio-b/` and `source/`.
- Local playback receives only the manifest, proper-name metadata and audio. No generation tools or source PDF/TTS documents are copied into the local runtime.

## Checks

`tools/check_ch10_release.py` checks all display/TTS pairs against both source files, all 302 WAV hashes and receipts, distinct references and coverage, valid non-silent audio, key proper names, both HTTP audio takes, sentence bounds and independent Chapter 9/10 saved positions. Tests use a temporary database. These checks do not represent human listening to every take.

Generation is task-scoped and its GPU workers stop on completion. Existing chapters, UI/input behavior, recognition settings and learning progress remain unchanged.

## Build

```bash
cd /home/scpark/apps/dictai-ch10
/home/scpark/miniconda3/envs/soulx/bin/python tools/build_harry_chapter.py \
  --pdf /home/scpark/harry-concise-ch10/source/reader.pdf \
  --tts /home/scpark/harry-concise-ch10/source/tts.txt \
  --chapter 10 --title 'Luna Lovegood' \
  --next-title "Chapter Eleven. The Sorting Hat's New Song." \
  --page-start 92 --page-end 99 --body-sentences 150 \
  --output /home/scpark/harry-concise-ch10/ch010.json \
  --proper-nouns /home/scpark/harry-concise-ch10/ch010-proper-nouns.json
systemd-run --user --unit=dictai-ch10-build \
  --working-directory=/home/scpark/apps/dictai-ch10 \
  /bin/bash /home/scpark/apps/dictai-ch10/tools/run_ch10_build.sh
/home/scpark/miniconda3/envs/soulx/bin/python tools/check_ch10_release.py
```
