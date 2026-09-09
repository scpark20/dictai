# YouTube dictation

**Current import mode: browser-local.** Install the [Caption Bridge](YOUTUBE-BROWSER-LOCAL.md) once in Chrome/Edge. The server serves assets only for this flow; it receives no transcript, file upload, Names text, answer or progress requests from the YouTube UI. Legacy server API details below are compatibility documentation, not the current browser import path.

Open **YouTube** between Conversation and Book, or visit `/youtube` directly. Both keep the main sidebar. Paste a `watch`, `youtu.be`, Shorts or live-video link. Links with `t=` or `start=` open the corresponding caption.

The address field sits above the video and the shared Book/Conversation practice card. The timeline, transcript list and range controls stay removed. Navigate with Previous / Next or enter a sentence number. The shared speed row uses YouTube-supported rates (0.5, 0.75, 1, 1.25 or 1.5); unsupported rates stay disabled. Voice uses the same English recognition models, settings, microphone pipeline and independent draft handling as Book/Conversation. `/youtube?embed=1` assembles the shared practice template plus video controls; `/youtube` retains the complete app shell. See [the shared-engine contract](SHARED-PRACTICE.md).

## Learning flow

English numeric and orthographic alternatives are accepted without rewriting captions. Examples: $25 / twenty-five dollars, 2026 / twenty twenty-six, 3:30 / three thirty, and didn't / did not. Numeric expressions remain atomic, incomplete alternatives stay in the input on Space, and Enter explicitly submits. See [audit, acceptance policy, guardrails and migration](YOUTUBE-MULTI-ANSWER.md). Book/Conversation and ASR are unchanged.

1. Open the video from DictAI, display its transcript on YouTube in the selected language, and click the extension to send it back. Original text is retained; no translation is generated. Displayed timestamps give approximate clip ends. Saved captions and SRT/VTT files are also read locally.
2. Start from the saved sentence or the timestamp in the pasted link, then use Previous / Next to move through the full video in order.
3. Replay that clip using the official YouTube iframe player. The original video audio is used: no download, TTS generation or GPU job.
4. The answer row follows the existing Book / Conversation layout: Type a word with an in-field Space / Enter hint, Names and Give Up alongside it, and joined Again / Next buttons in the same row on completion. Type words or paste a phrase. Space / Enter submits; each occurrence of a repeated word needs an entry. Case, ordinary punctuation and common title forms are normalized for matching, while caption wording is preserved. YouTube Names now uses local capitalization/title hints (with possible omissions/false positives), not server spaCy; it never replaces the typed draft.
5. Solving keeps the screen in place, briefly celebrates, and exposes Again / Next. Tapping a word or revealing an answer marks it as revealed rather than solved. Next proceeds through the full video; Previous / Next also allow manual navigation.

Answers stay hidden until solved or revealed. There is no transcript list or Show script control.

## Isolation and persistence

- New module `youtube_api.py`, assets under `youtube-ui/`, routes under `/api/youtube/`.
- Existing Book / Conversation APIs, audio and progress database are unchanged.
- YouTube progress is device/browser-local, keyed by video ID, caption language and transcript hash. The most recently loaded transcript is also stored for refresh/return. Unavailable or full browser storage produces a warning.
- Public caption fetches use a one-hour, 32-entry in-memory cache. Uploaded captions are not stored on the server. No cookies, credentials or proxies are extracted or configured.
- Only validated YouTube IDs reach the importer. Arbitrary URLs and playlist-only links are rejected. Caption imports are limited to 15,000 cues / 12 hours; manual uploads to 2 MB. A shared persistent guard provides permanent caption caching, one upstream job, duplicate-request joining, a minimum 60-second interval, 10-job hourly cap, and a durable 24-hour pause after blocking. These are local safeguards, not a promised YouTube unblock time. [Request guard](YOUTUBE-REQUEST-GUARD.md)

## Dependencies and deployment

The recognition / generation environment is not upgraded. Install the importer in an isolated directory:

```sh
python -m pip install --no-deps --target /home/scpark/dictai-youtube-deps youtube-transcript-api==1.2.4 defusedxml==0.7.1
```

The existing runtime supplies `requests`. `DICTAI_YOUTUBE_DEPS` can override the isolated dependency directory. Automatic caption access uses the library's public-caption interface; it is unofficial and can be blocked or changed by YouTube. The UI reports disabled captions, unsupported language, timeout and access failures. SRT / WebVTT import remains available without that dependency. No access restriction is bypassed.

The optional English Names helper reuses the existing `spacy` runtime and the official `en_core_web_sm==3.8.0` model, installed with `--no-deps` in the same isolated directory (from the explosion/spacy-models GitHub release). It runs on CPU, on demand for the current caption only. Korean captions keep Names disabled rather than pretending the English model can identify Korean names.

Use the existing 8771 deployment. Preserve the Chapter 10 repaired-audio service overrides. A new worktree needs the same ASR mounts as the existing server. No change to system startup policy is required.

## Checks

- `node tests/youtube-layout.test.mjs`: sidebar order, direct YouTube entry, Book/Conversation switching, address/video/practice ordering, absence of timeline/range controls and the speed row. This is a mocked DOM unit test, not browser visual QA.

- `python tests/test_youtube.py -v`: URL validation, caption grouping, rolling-caption overlap, original title/contraction spelling, SRT/VTT parsing, import timeout/errors/cache and Chapter 11 progress isolation.
- `node --test tests/youtube-core.test.mjs`: answer matching, repeated words, aliases, time parsing, range ordering and per-video progress keys.
- Install test-only dependencies in `tests/`, then run `npm test` there. Shared engine and media-adapter tests cover typed and microphone-driven input, draft isolation, numeric aliases, completion, Again / Next, direct jumps, restoration and player remounting. Microphone/audio/player are mocked; these are not listening or browser visual tests.
- Public-caption imports have also encountered YouTube IP blocking; successful prior imports do not guarantee current availability. Saved captions and SRT/VTT import remain usable. Browser playback depends on embedding permission, network, autoplay/referrer policy and content blockers. No claim of manual listening or browser visual verification is made.

## Primary references

- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api)
