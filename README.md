# DictAI

The restored EchoStep Harry Potter dictation program with Concise Edition
Chapter 5 attached to it. The Chapter 3/4 source data is not rebuilt here.

## Restored program behaviour

- The established EchoStep practice UI and interactions are retained.
- 191 Chapter 5 problems: one title plus 190 sentences.
- Display text and TTS pronunciation text remain separate in `data/ch005.json`.
- Two pre-generated SoulX takes are preloaded and alternated per sentence.
- Typing and voice recognition use independent input paths.
- Names, click-to-reveal, Again/Next, speed controls and saved position remain.
- Voice recognition is off by default. The in-browser recognizer offers the
  full 2023-06-21 English Zipformer and the smaller 20M 2023-02-17 model.
- Beam controls modified-beam-search paths. Threshold controls the minimum
  decoded-word match score, and Candidate controls the required lead over the
  runner-up. Voice matching never edits or clears the typed-answer field.
- Model downloads report progress and are retained in IndexedDB per model.

## Runtime layout on 192.168.0.67

Generated audio and the browser ASR model are runtime assets and are not
committed to Git:

- `/home/scpark/harry-concise-ch5/audio-a`
- `/home/scpark/harry-concise-ch5/audio-b`
- `/home/scpark/dictai/asr-wasm`
- `/home/scpark/dictai/certs`

The defaults can be overridden with `DICTAI_AUDIO_A`, `DICTAI_AUDIO_B`,
`DICTAI_MANIFEST`, `DICTAI_PROPER_NOUNS`, `DICTAI_PROGRESS_DB`,
`DICTAI_PYTHON_ENV`, `DICTAI_HOST`, `DICTAI_PORT`, `DICTAI_SSL_KEY`, and
`DICTAI_SSL_CERT`.

Run `python tools/verify_environment.py` before deployment, then start HTTPS
on port 8774 with `./start-https.sh`.
