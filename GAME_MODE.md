# DictAI · Bubble Quest

A portrait arcade mode for listening and dictation. The game is isolated from the existing practice service, content generation, and learning progress.

**Preview:** <https://192.168.0.68:8775/game>

**Branch:** `feature/game-mode`

**Existing practice:** port `8771`, unchanged.

## Play

1. Choose Conversation (A1–C2 and topic) or Book (Harry Potter 5, Chapters 3–6).
2. Choose relaxed, normal or fast pace and one of five themes.
3. The game prepares the round's audio before the countdown. A round uses up to 20 distinct questions from the selected collection.
4. Speech-bubble bombs descend periodically, with at most five visible. Click any falling bubble to select it. Otherwise, after the active bubble is solved or missed, the lowest remaining bubble is selected automatically.
5. Listen to the selected question. Enter words in the fixed bottom dock using Space or Enter; complete the bubble to launch an arrow and pop it.
6. A landing or skipped bubble costs one of five hearts. Unhinted solves earn 100 points plus a capped combo bonus. Revealing words is allowed but makes that bubble ineligible for points.
7. Pause or switch themes without losing positions, solved words or per-question typing drafts. Returning to a saved round starts paused rather than advancing time offline.

The layout uses **9:16 portrait**, interpreting the requested vertical screen orientation. Themes share identical gameplay geometry:

| Theme | Art direction |
| --- | --- |
| Sky | Bright blue sky, clouds, green landing strip and cheerful bubble characters |
| Neon | Midnight-blue rooftop skyline, cyan and magenta lights |
| Paper | Warm paper palette and simplified edges, reusing the sky composition |
| Space | Deep indigo stars and a glowing planetary horizon |
| Sunset | Warm sunset treatment of the sky scene |

There are five implemented themes, not ten independently finished art sets. Sky, Neon and Space have dedicated background images; Paper and Sunset are palette treatments.

## Input and audio behavior

### Arcade motion update

- Each newly solved slot pulses and sends an energy orb into the launcher. Charge is computed from solved slots / total slots, so short and long questions reach full charge at their own final answer.
- The last slot triggers launcher compression, recoil, an arrow, an impact ring, particles and a reward label. Scoring and collision immunity take effect immediately; the visual flight never blocks typing into the next target.
- Bubble bodies dance independently of their button coordinates. Cyan/coral eyes blink at staggered intervals; smiling/sleeping characters keep their existing expressions. Near-ground movement becomes tense instead of playful.
- Themes have slow background movement, ambient particles and a subtle time-based light shift. The input dock itself never shakes.
- Questions are grouped into waves of five. After all five are resolved, a four-second breather precedes the next wave. Later waves slightly increase fall speed and shorten the spawn interval.
- An unhinted solve at 85% or more of the falling distance earns a **+50 Close Call** bonus. Its blast moves nearby live bubbles upward without changing their answers or drafts. Hinted solves get neither bonus nor blast.
- Combo rewards remain attached to the individual solved bubble, even when multiple answers complete quickly. A game-only personal best is saved locally.
- Low / Normal / Rich effects are selectable from setup and pause. The operating system's reduced-motion preference forces Low. Pausing freezes CSS motion and active Web Animations together with gameplay.
- Optional quiet charge tones start off. They are suppressed whenever question audio is playing or Voice is enabled, and stopped on pause, playback or microphone activation. No background music or new TTS was introduced.

This update implements the recommended initial arcade set. Bosses, special reward bombs, manual freeze skills and comeback healing remain design ideas, not shipped mechanics.

- Voice is **off by default**. It is optional; keyboard play does not load the recognition model.
- Voice settings use the existing local WASM Zipformer runtime, with the full and 20M English models. The full model identifier is shown in the selector.
- Beam controls decoding/search breadth. Threshold and candidate margin control the existing transcript-to-target similarity decision; these are **not acoustic likelihood probabilities**. Exact aliases remain accepted independently of fuzzy matching thresholds.
- Changing settings preserves the intended Voice On/Off state. Model/beam changes reload the runtime and leave the saved round available to resume.
- Voice never writes into the keyboard input. Each question owns its draft and caret. Duplicate or incorrect keyboard submissions retain the text.
- A target change resets the recognition context. Results from the previous target cannot spill into the new one.
- Recognition is suspended while the question audio plays. Pausing, leaving or ending the game releases the microphone.
- Display tokens come from existing display text, not a newly normalized TTS script. `Mr.` and `Mrs.` stay visible as such; spoken forms and supported contractions are accepted as aliases.
- Audio is reused as a complete existing question file; this feature does not generate, splice or modify any audio. The batch is prefetched and replays use in-memory blob URLs.

## Isolation and implementation

| Component | Responsibility |
| --- | --- |
| `game_server.py` | Read-only catalog/round/audio routes, original practice app fallback, Game Mode navigation entry |
| `game/core.js` | Pure game state, timing, scoring, matching, save validation |
| `game/game.js` | Rendering, draft ownership, controls, audio prefetch, themes and lifecycle |
| `game/voice.js` | Microphone/runtime adapter and recognition-context isolation |
| `game/game.css` | Portrait layout, theme variables, controls and effects |
| `game/motion.js` / `game/motion.css` | Decorative animation lifecycle, charge/impact effects and motion preferences |
| `game/assets/` | Generated backgrounds and transparent bubble-character atlas |

Game browser storage is namespaced with `dictai-game-*`. The game APIs do not update practice selection, sentence indices or progress. The new server is a separate worktree/process; no files in the live port-8771 checkout were edited for this feature.

## Run on the existing server

The preview is in `/home/scpark/apps/dictai-game`. It reuses the existing Python environment, content paths, certificates and browser recognition assets. No GPU model, kernel or driver change is required.

```sh
cd /home/scpark/apps/dictai-game
bash start-game.sh
```

The deployed instance runs as user service `dictai-game-8775.service`, with restart-on-failure enabled. This is a transient service: it stays running after the SSH session exits but must be started again after a server reboot. Manage this unit only; do not restart the existing 8771 service for game changes.

## Review and tests

```sh
node game/core.test.mjs
node game/ui.test.mjs
node game/voice.test.mjs
/home/scpark/miniconda3/envs/soulx/bin/python game/server_smoke.py
```

- **27 state/matching tests:** selection, misses, scoring, aliases, contractions, duplicate handling, pausing, persistence, round completion, retry timing, wave breaks, close calls, blast timing and legacy saves.
- **17 DOM-adapter integration tests:** real application handlers with synthetic DOM/audio, including initialization, prepared audio, typing, charge, effects, themes, IME, settings, records and new rounds.
- **6 voice-adapter tests:** synthetic audio buffers, stream lifecycle, duplicate partials, context isolation, suspension and model-load failure recovery. These tests do not record a person.
- **6 server smoke-test groups:** real A1–C2 and Chapter 3–6 content/audio routes, valid range responses, malformed requests, asset delivery, both recognition packages, isolated settings, unchanged practice data and unchanged live source.

### Remaining acceptance check

The in-app browser rejected the server's self-signed TLS certificate with `ERR_CERT_AUTHORITY_INVALID`. No browser security warning was bypassed. Therefore **rendered-browser layout, real audio playback and live-microphone acceptance are not claimed as passed**. The server HTTP tests use its explicitly supplied certificate and do not disable TLS verification.

After the owner establishes certificate trust, check the preview in the actual browser: 390×844 portrait and a desktop window; all five themes; full solve/miss/retry; reload and restore; Voice On/Off and Apply; duplicate typing while recognition runs. Keep the existing 8771 page open separately to confirm its progress is unaffected.

## Asset provenance and theme extension

Assets were generated with the image-generation tool specifically for this project; they contain no embedded UI text. Final asset briefs:

- **Sky:** clean 9:16 portrait arcade playfield, bright blue sky, soft clouds near the edges, grassy landing strip, open center, no characters or text.
- **Bubbles:** transparent, evenly spaced row of four cute speech-bubble bomb characters, cyan/coral/yellow/lilac, small fuse details, no text; used as an atlas.
- **Neon:** clean 9:16 midnight city-rooftop playfield, cyan/magenta buildings along lower edges, dark open sky, no characters or text.
- **Space:** clean 9:16 starfield with small peripheral planets and a glowing planetary horizon, open center, no characters or text.

To add a theme, add a key to `THEMES`, a label in `themeNames`, scoped `body[data-theme=...]` styles and any local assets. Theme changes must not modify question state, timing, draft ownership, matching or voice settings.

### Blink frame provenance

Project asset: `game/assets/bubbles-blink.png` (deployed at `/home/scpark/apps/dictai-game/game/assets/bubbles-blink.png`). Created with the built-in image-generation tool. The source atlas is retained unchanged. The generated alternate frame is clipped to the eye region in CSS; its generated checkerboard exterior is not rendered. The follow-up transparency attempt was inspected and discarded because it had no alpha channel.

Final selected-frame prompt:

> Use case: precise-object-edit. Asset type: animation sprite atlas closed-eye frame. Input image 1 is the edit target: four existing cute speech bubble bomb characters on transparent background. Change ONLY the eyes of the first cyan and second coral character to small closed curved eyelids for a blink. Preserve the already closed smiling eyes of yellow and sleeping eyes of purple. Keep EXACT image dimensions, exact character positions, sizes, silhouettes, body colors, mouths, highlights, fuses, sparks, sleep marks, transparent alpha and all other pixels as close as possible to the source. This is an alternate animation frame, NOT a redesign. No new elements, no background, no text.
