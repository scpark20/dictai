# DictAI — local web edition

Open **http://127.0.0.1:8771/** on this Mac. The service binds only to loopback, not the LAN. No connection to the 68 server is needed for playback, progress or browser speech recognition.

## Included

- Existing Conversation UI and English/Korean catalogs, their audio, TTS evaluation playback page.
- Harry Potter 5 Chapters 3–9, manifests, canonical display text, proper names and both audio takes.
- English sherpa-onnx Full/20M browser recognition assets and the existing Korean Whisper Base q8 model, vendored for browser-only inference.
- All imported SQLite progress records. On first launch, select the prior browser profile to continue. Records are not merged or overwritten; switch again at `/local-setup` if necessary.

## Excluded

TTS generation workers, reference banks, source PDF/TTS documents, SoulX/OmniVoice models, CUDA, Linux environments and GPU tooling. Browser ASR files are included because they are necessary to retain Voice functionality.

## Start

```bash
cd /Users/scpark/Documents/Codex/DictAI
.venv/bin/python local_web.py
```

`start-local.command` runs the same command. This starts a loopback HTTP server; loopback is a browser secure context for microphone access and WASM. Browser microphone permission is still required when Voice is enabled. No certificate-warning bypass is required.

Automatic login/startup registration requires separate permission for the Mac's LaunchAgents folder. Until it is installed, keep the server process running; automatic startup is not promised.

## Storage and checks

Everything needed at runtime is in `runtime/`, excluded from Git. Original imported progress stays in `runtime/imported-progress.sqlite3`; ongoing local progress uses `runtime/progress.sqlite3`. The selected profile is in `runtime/local-profile.json`. The web entry point remaps Linux content paths to these local directories. It does not start or contact any generation service.

Install Python dependencies from `requirements-local.txt` in a local virtual environment. `transfer-web-data.sh` is a one-time inbound migration helper; it is never invoked by the web app. `fetch-browser-assets.py` downloads the existing Korean ASR files and pins their revision/hashes in a local receipt. Vendor Transformers.js 3.7.2, including its WASM assets, in `runtime/vendor/transformers/dist/`.

Run `.venv/bin/python test_local_web.py` for isolated progress, every conversation category, all chapter audio availability, range playback, local browser-model delivery and host/origin isolation checks. These tests do not access the live learning database.
