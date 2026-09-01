#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec /home/scpark/miniconda3/envs/soulx/bin/uvicorn server:app \
  --host 0.0.0.0 --port 8770 \
  --ssl-keyfile /home/scpark/apps/harry-dictation/certs/server.key \
  --ssl-certfile /home/scpark/apps/harry-dictation/certs/server.crt
