# YouTube dictation

Open **YouTube** between Conversation and Book, or visit `/youtube` directly. Both keep the main sidebar. Paste a `watch`, `youtu.be`, Shorts or live-video link. Links with `t=` or `start=` open the corresponding caption.

The integrated layout places the address field above the full-width video and the familiar dictation card below it. Timeline and time-range controls are collapsed until needed. The bottom speed row replays the current clip at a YouTube-supported rate (0.5, 0.75, 1, 1.25 or 1.5); unsupported rates stay disabled. YouTube remains type-only; Book/Conversation voice settings are unchanged. `/youtube?embed=1` serves only the inner workspace, while `/youtube` serves the complete app shell.

## Learning flow

1. Load the original captions, preferring creator-provided captions in the requested language. No translation is generated. Other available caption languages are shown if the selected one is missing.
2. Set a From / To range, click a timeline entry, or use the video's current time. Clips remain chronological. A range includes captions whose start lies inside it; caption boundaries are not cut mid-word, so the last clip can extend beyond the typed end time.
3. Replay that clip using the official YouTube iframe player. The original video audio is used: no download, TTS generation or GPU job.
4. The answer row follows the existing Book / Conversation layout: Type a word with an in-field Space / Enter hint, Names and Give Up alongside it, and joined Again / Next buttons in the same row on completion. Type words or paste a phrase. Space / Enter submits; each occurrence of a repeated word needs an entry. Case, ordinary punctuation and common title forms are normalized for matching, while caption wording is preserved. Names uses the same English spaCy PERSON/PROPN criteria as the Book metadata builder; it never replaces the typed draft.
5. Solving keeps the screen in place, briefly celebrates, and exposes Again / Next. Tapping a word or revealing an answer marks it as revealed rather than solved. Next proceeds within the chosen range; Previous / Next also allow manual navigation.

The script is hidden in the timeline by default. **Show script** reveals it. Auto-generated captions are labeled as potentially inaccurate; captions are not claimed to be verified transcripts of the audio.

## Isolation and persistence

- New module `youtube_api.py`, assets under `youtube-ui/`, routes under `/api/youtube/`.
- Existing Book / Conversation APIs, audio and progress database are unchanged.
- YouTube progress is device/browser-local, keyed by video ID, caption language and transcript hash. The most recently loaded transcript is also stored for refresh/return. Unavailable or full browser storage produces a warning.
- Public caption fetches use a one-hour, 32-entry in-memory cache. Uploaded captions are not stored on the server. No cookies, credentials or proxies are extracted or configured.
- Only validated YouTube IDs reach the importer. Arbitrary URLs and playlist-only links are rejected. Caption imports are limited to 15,000 cues / 12 hours; manual uploads to 2 MB. Two bounded workers and a 45-second deadline prevent indefinite import loading.

## Dependencies and deployment

The recognition / generation environment is not upgraded. Install the importer in an isolated directory:

```sh
python -m pip install --no-deps --target /home/scpark/dictai-youtube-deps youtube-transcript-api==1.2.4 defusedxml==0.7.1
```

The existing runtime supplies `requests`. `DICTAI_YOUTUBE_DEPS` can override the isolated dependency directory. Automatic caption access uses the library's public-caption interface; it is unofficial and can be blocked or changed by YouTube. The UI reports disabled captions, unsupported language, timeout and access failures. SRT / WebVTT import remains available without that dependency. No access restriction is bypassed.

The optional English Names helper reuses the existing `spacy` runtime and the official `en_core_web_sm==3.8.0` model, installed with `--no-deps` in the same isolated directory (from the explosion/spacy-models GitHub release). It runs on CPU, on demand for the current caption only. Korean captions keep Names disabled rather than pretending the English model can identify Korean names.

Use the existing 8771 deployment. Preserve the Chapter 10 repaired-audio service overrides. A new worktree needs the same ASR mounts as the existing server. No change to system startup policy is required.

## Checks

- `node tests/youtube-layout.test.mjs`: sidebar order, direct YouTube entry, Book/Conversation switching, address/video/practice ordering, collapsed timeline and the speed row. This is a mocked DOM unit test, not browser visual QA.

- `python tests/test_youtube.py -v`: URL validation, caption grouping, rolling-caption overlap, original title/contraction spelling, SRT/VTT parsing, import timeout/errors/cache and Chapter 11 progress isolation.
- `node --test tests/youtube-core.test.mjs`: answer matching, repeated words, aliases, time parsing, range ordering and per-video progress keys.
- Optional DOM unit test: install the test-only dependencies in `tests/`, then run `node tests/youtube-dom.test.mjs`. It checks import, matching, duplicate-input retention, Again / Next, range changes, reload restoration and player remounting with a mocked YouTube player. It does not test real YouTube playback or rendered layout.
- Live HTTP import of a public captioned video succeeds from server 68. Browser video playback still depends on YouTube embedding permission, network, browser autoplay/referrer policy and any content blockers. No claim of manual listening or browser visual verification is made.
- Optional WebMCP range selection uses the same state/action as the form, when available. A supported WebMCP execution context was unavailable; that optional integration is not verified.

## Primary references

- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api)
