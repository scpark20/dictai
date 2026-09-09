# DictAI for YouTube: browser-local LR surface

DictAI appears as a right-side practice panel on a normal YouTube watch page. There is no DictAI → YouTube → transcript menu → extension popup → DictAI round trip. The toolbar icon hides or restores the panel.

## One-time setup

1. Download `/youtube-assets/dictai-caption-bridge.zip` and unzip it.
2. Chrome/Edge: open the extensions manager. Opera: open `opera://extensions`.
3. Enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`.
4. Open `https://192.168.0.68:8771` once in that browser and accept its local certificate if prompted.
5. Open any regular `https://www.youtube.com/watch?v=...` page. DictAI appears automatically.

An unpacked 1.x Caption Bridge must be reloaded or replaced with version 2.0.0. The extension is not store-published and cannot be installed automatically by a web page.

## Runtime flow

1. The extension waits for the DictAI frame to check browser-local storage.
2. If this exact video already has saved captions, no caption request is made.
3. Otherwise the extension reads caption-track metadata already attached to the current YouTube player, prefers creator-provided English, then English ASR, then an available track, and requests exactly that current track from YouTube in the same browser session.
4. Caption text crosses extension frames through restricted `postMessage`; it is not put in a URL and no transcript is posted to a DictAI API.
5. DictAI segments and normalizes captions, builds multi-answer variants, derives conservative local name hints, and stores captions/progress in browser `localStorage`.
6. Replay buttons control the original top-page YouTube `<video>` element. The shared Book/Conversation exercise engine continues to own Voice, word slots, Give Up, Again/Next and sentence navigation.

The server still serves HTML/CSS/JavaScript, ASR models and the extension archive. YouTube still serves video/audio and captions. “Browser-local” means transcript ingestion, exercise operations and progress do not run through the DictAI transcript server; it does not mean offline playback.

## Request and privacy boundaries

- Manifest V3 permissions: `scripting` and `https://www.youtube.com/*` only. No cookies permission, history, tabs inventory, downloads, proxy, IP rotation, remote code, audio capture or background crawler.
- A scan request is accepted only from a content script whose sender URL and requested 11-character video ID match the current YouTube watch page.
- The packaged reader runs in the current page's main world so it can read the current player's caption metadata. It accepts only same-origin `/api/timedtext`, performs one request, validates size and timing, then returns.
- It never scans recommendations, playlists or unrelated videos. Failures are displayed and stop; there is no retry loop or scheduled collection.
- The remote panel accepts messages only from its exact extension parent. The extension panel accepts only its YouTube parent and the fixed DictAI origin.
- The legacy server importer and rate guard remain for older tooling, but the current UI/extension path does not invoke them.

This design greatly reduces server-IP blocking and repeated requests. It cannot guarantee YouTube will always permit caption access. Caption URLs/player structures are not a stable public third-party API; unavailable captions, YouTube changes, region/account restrictions or browser policy may cause a failure. The official captions download API is not an arbitrary-video replacement because it requires permission to edit the video.

## Deliberate limitations

- The automatic track preference is English-first. A track selector inside the panel is not included in this slice.
- Browser storage is per browser profile and DictAI origin. Clearing site data removes captions and progress.
- The panel targets server 68. If its local certificate is not trusted in the same browser, the embedded practice frame may not load.
- Microphone, autoplay and embedded-frame permissions still depend on the browser. Automated tests mock these facilities and are not a claim of live Opera/Chrome microphone certification.

## Validation

- `lr-extension.test.mjs`: minimal manifest, one current-track request, missing/foreign-source refusal, automatic panel mounting, cache-decision handshake, toggle and origin-restricted relays.
- `extension-background.test.mjs`: exact sender/video binding, packaged MAIN-world reader and toolbar toggle with mocked Chrome APIs.
- `youtube-lr-surface.test.mjs`: caption delivery into the actual shared practice engine, zero DictAI API requests and top-page playback messages.
- Existing numeric/orthographic, Voice draft isolation, Again/Next, direct sentence navigation, Book/Conversation regression and standalone local SRT/cache tests remain.

No live YouTube browser interaction, visual inspection or microphone listening is claimed until version 2.0.0 is installed and exercised in the user's browser.
