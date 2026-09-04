#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PYTHON_ENV="${DICTAI_PYTHON_ENV:-/home/scpark/miniconda3/envs/soulx}"
HOST="${DICTAI_HOST:-0.0.0.0}"
PORT="${DICTAI_PORT:-8774}"
KEY="${DICTAI_SSL_KEY:-./certs/server.key}"
CERT="${DICTAI_SSL_CERT:-./certs/server.crt}"

for required in "$PYTHON_ENV/bin/uvicorn" "$KEY" "$CERT"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing required runtime file: $required" >&2
    exit 1
  fi
done

exec "$PYTHON_ENV/bin/uvicorn" server:app \
  --host "$HOST" --port "$PORT" \
  --ssl-keyfile "$KEY" \
  --ssl-certfile "$CERT"
