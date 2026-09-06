#!/usr/bin/env bash
set -euo pipefail
cd /home/scpark/apps/dictai-ch8
bash /home/scpark/4repeat/bin/start_soulx.sh
/home/scpark/miniconda3/envs/soulx/bin/python tools/generate_harry_audio.py \
  --manifest /home/scpark/harry-concise-ch8/ch008.json \
  --references /home/scpark/harry-concise-ch5/reference-bank \
  --stage /home/scpark/harry-concise-ch8 \
  --seed 2026090808
/home/scpark/miniconda3/envs/soulx/bin/python tools/validate_release.py \
  /home/scpark/harry-concise-ch8/ch008.json \
  --proper-nouns /home/scpark/harry-concise-ch8/ch008-proper-nouns.json \
  --audio /home/scpark/harry-concise-ch8/audio-a \
  --audio /home/scpark/harry-concise-ch8/audio-b
