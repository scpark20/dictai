# DictAI release contract

DictAI keeps source text, spoken text, and audio as separate artifacts.

- `source_display_text` is the editorial source and the only text allowed on screen.
- `display_text` must equal `source_display_text` byte for byte.
- `speak_text` may expand titles and pronunciation hints for TTS only.
- `display_hash` and `speak_hash` bind each take to those exact texts.
- Every take for one `sentence_id` must carry identical source/display/speak text.
- `text_contract_version: 1` enables these strict rules independently of the
  manifest format's historical `schema_version`.

For example, the UI displays `Mr. Weasley`, while TTS may read `Mister Weez-lee`.

## Required release gate

Run this before copying a manifest, proper-noun index, or audio directory to the live release:

```sh
python3 tools/validate_release.py data/ch005.json \
  --proper-nouns data/ch005-proper-nouns.json \
  --audio /path/to/audio-a \
  --audio /path/to/audio-b
```

The command must succeed before deployment. It rejects source text leaking into TTS display,
stale hashes, duplicate or missing ordinals, inconsistent takes, invalid proper-noun indices,
and missing audio.

After an intentional source/TTS edit, refresh hashes explicitly and validate again:

```sh
python3 tools/refresh_manifest_hashes.py data/ch005.json
```

The refresh tool refuses to run if `display_text` differs from `source_display_text`.

## Runtime configuration

Server data locations are configured with `DICTAI_*` environment variables, including
`DICTAI_CH3_MANIFEST`, `DICTAI_CH4_MANIFEST`, `DICTAI_CH5_MANIFEST`, each chapter's
`*_AUDIO_ROOT`, `*_AUDIO_SECOND_ROOT`, and `*_PROPER_NOUNS`. A release must set these to
one versioned release directory; do not mix paths from different releases.
