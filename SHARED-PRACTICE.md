# One practice surface, three content sources

## Single ownership

`practice-ui/index.html`, `practice-ui/styles.css` and `practice-ui/app.js` own the exercise for **Conversation, Book and YouTube**. YouTube does not maintain another answer form, word grid, completion renderer, confetti implementation, microphone recognizer, options panel or navigation input.

The server assembles `/youtube?embed=1` from that same template. `youtube-ui/youtube.html` is now a video/import fragment only. `youtube-ui/youtube.css` styles media/import controls only, never copies exercise CSS. `youtube-ui/youtube.js` manages the YouTube player and caption import only and loads the shared engine once. Reimporting a video does not recreate input listeners or the Voice loader.

## Content adapter contract

`youtube-ui/practice-provider.mjs` supplies local equivalents of bootstrap, problem, level, reveal and complete data; timestamp selection; media play/stop; and per-video progress. It never intercepts global fetch or sends YouTube completion/navigation requests to Book/Conversation endpoints.

The engine owns all transitions: reset → load → type/speak/reveal → complete → Again/Next. Both input channels commit to the same solved-slot state. Voice never consumes the typing draft. Microphone capture, Zipformer models, Beam/Threshold/Candidate, options visibility and Apply state restoration use the existing code and resources.

Caption tokenization and explicit English alternatives live in the shared engine's `practice-ui/answer-variants.mjs`. The engine invokes that utility; the provider does not implement another matcher. The former `youtube-answers.mjs` is only a compatibility re-export. This retains the audited numeric-answer policy without retokenizing existing Book datasets. Book/Conversation retain their original contraction-component behavior and server-authoritative completion.

## Behavior preserved or corrected

- Current sentence is directly editable; Enter accepts integers from 1 through the clip count. Zero, negative, fractional, scientific notation and out-of-range values are rejected.
- Again/Next become visible as soon as completion starts. Book still waits for its authoritative save before enabling them. YouTube completes locally. Audio/animation failure cannot prevent completion.
- Completion never automatically navigates. The last YouTube clip disables Next while retaining Again and replay.
- Typed and voice answers share completion handling. Voice results cannot clear a draft, including on completion.
- Playback uses original YouTube audio, not downloaded or synthesized copies. Recognition is paused while video audio plays.
- The same five-button control uses the actual YouTube rate choices (.5/.75/1/1.25/1.5). Book rates remain .5/.8/1/1.2/1.5. Unsupported player rates are disabled rather than falsely labeled.
- Video/language/transcript-specific progress keys and legacy token migration are unchanged. No production progress database migration is required.
- Names lookup is asynchronous and bounded; it does not block typing or completion.
- Timeline/range/transcript-list panels remain removed. Navigation stays beside the timestamp at the top right.

## Tests and boundaries

`tests/package.json` runs pure numeric matching plus shared-engine, player-adapter, legacy Book-engine and shell tests. These use simulated microphone/audio/player objects and do not claim listening or browser visual validation. Python route tests check shared-template composition, asset responses, existing Book selection/progress isolation and caption APIs using a temporary database.

External caption fetching can still be blocked by YouTube. Microphone permissions and actual recognition quality depend on the browser/device. This change does not generate audio, start GPU jobs, replace datasets or alter Book/Conversation backend storage.
