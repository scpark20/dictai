#!/usr/bin/env bash
set -euo pipefail
cd /home/scpark/apps/dictai-ch7
bash /home/scpark/4repeat/bin/start_soulx.sh
/home/scpark/miniconda3/envs/soulx/bin/python tools/generate_harry_audio.py \
  --manifest /home/scpark/harry-concise-ch7/ch007.json \
  --references /home/scpark/harry-concise-ch5/reference-bank \
  --stage /home/scpark/harry-concise-ch7 \
  --seed 2026090707
/home/scpark/miniconda3/envs/soulx/bin/python tools/validate_release.py \
  /home/scpark/harry-concise-ch7/ch007.json \
  --proper-nouns /home/scpark/harry-concise-ch7/ch007-proper-nouns.json \
  --audio /home/scpark/harry-concise-ch7/audio-a \
  --audio /home/scpark/harry-concise-ch7/audio-b
