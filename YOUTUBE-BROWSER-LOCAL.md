# Browser-local YouTube practice

The YouTube UI no longer calls the server caption import, subtitle upload, or Names endpoints. The server serves application code, the extension ZIP and existing ASR model assets. Captions, segmentation, name hints, matching and lesson progress are handled in the user's browser. YouTube still serves its original video/audio; this is not offline video playback.

## One-time setup (Chrome / Edge desktop)

1. Download `/youtube-assets/dictai-caption-bridge.zip` from DictAI and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`.
3. Reload DictAI **in that same browser**. Its import panel should say **Browser extension connected**. This extension is not published to a store. It is not automatically installed, and support in embedded app browsers is not assumed.
4. Paste a YouTube URL in DictAI, select the intended caption language and choose **Open YouTube**.
5. In the opened YouTube tab, expand the description, select **Show transcript**, choose the same language and keep timestamps visible.
6. Click the DictAI extension icon and **Send displayed transcript**. On confirmed receipt it returns to the original DictAI tab/frame. The existing shared answer form, Voice, Again / Next and direct sentence navigation are reused.

Saved captions can be reopened with **Use saved captions**, without an extension round trip. SRT / VTT input is parsed locally as well. Previously saved last-video data is retained. Data belongs to this browser profile and site origin, not to a shared server account; clearing site storage removes it. Storage-full errors are shown and the active lesson stays usable.

## Trust and privacy boundaries

- Manifest V3 extension; only `activeTab`, `scripting`, `storage`. No cookies, broad YouTube host permission, proxy, private endpoint, audio download or remote-code execution.
- A content bridge is restricted to the configured DictAI origins on server 68 and localhost. Runtime validation also restricts the port and `/youtube` route.
- The extension opens a normal YouTube page. It reads rendered transcript DOM only after the user's extension-button action. It does not make hidden transcript requests or bypass restrictions. A missing transcript returns an actionable error.
- Pending requests bind to an exact receiving document, video ID and request ID; they expire after one hour, and a replacement request revokes the old one. No arbitrary destination or network-fetch URL is accepted from a page. A receipt confirms the app actually accepted the payload before the user sees success.
- Transcripts are not retained in extension storage; that storage only holds short-lived routing metadata. Caption and progress storage is in DictAI's browser localStorage.
- The legacy server endpoints and shared request guard remain for compatibility with older clients/tools; the new UI never invokes them. No new upstream caption request is needed for deployment or testing.

## Deliberate limitations

- YouTube's displayed transcript exposes start timestamps, not exact caption ends. Ends use the next distinct displayed timestamp; the last cue uses video duration when available, otherwise a short estimate. Imported lessons label this timing limitation. Pauses may remain. SRT / VTT files retain their supplied timing.
- Only rendered transcript rows are captured. YouTube layout changes or partially rendered/virtualized transcripts can affect coverage. The reader does not claim a hidden API fallback or guaranteed full-video coverage; review the imported clip count. Current selectors cover transcript segment renderers and segment view models, with fixture tests, not a live YouTube browser certification.
- Language is the user's chosen label, not automatic language verification. Select the matching transcript language on YouTube.
- To avoid sending text to a server, Names uses conservative local capitalization/title hints, not the previous spaCy model. Its tooltip explains possible omissions/false positives. It does not alter the original answer or matching.
- Website files and ASR models must still be served; video embedding, autoplay and microphone permission remain browser/YouTube constraints.

## Validation

`tests/local-captions.test.mjs`: URLs, timestamp hints, cleanup, segmentation, original spelling, limits, SRT/VTT, deterministic versions, allowed origins, local Names and rendered-transcript fixtures.

`tests/extension-background.test.mjs`: popup-only collection, trusted origin, exact document delivery, request replacement, wrong video, replay and expiration. Chrome APIs are mocked.

`tests/youtube-media.test.mjs`: full shared-engine integration with mocked extension transport and YouTube player. It rejects all fetch calls, covers browser import, local files/cache, completed-state restoration, repeated imports and unsolicited delivery. No actual browser installation, microphone listening or live YouTube transcript capture is implied by these tests.

Existing Book/Conversation regression tests are retained. No training data, audio generation, GPU process, live learning database or system driver is changed.
