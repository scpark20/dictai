#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec /home/scpark/miniconda3/envs/soulx/bin/uvicorn game_server:app --host 0.0.0.0 --port 8775 --ssl-keyfile ./certs/server.key --ssl-certfile ./certs/server.crt
