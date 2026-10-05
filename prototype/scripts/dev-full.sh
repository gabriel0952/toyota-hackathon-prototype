#!/usr/bin/env bash
# Start the decision API (127.0.0.1:8000) and the API-mode frontend (127.0.0.1:4174) together.
# Creates services/decision-api/.venv on first run. Ctrl+C stops both.
# Without services/decision-api/.env the backend uses built-in seed rules (no keys needed).
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR=services/decision-api
PYTHON=${PYTHON:-python3}

for port in 8000 4174; do
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use; stop the existing server first." >&2
    exit 1
  fi
done

if [ ! -x "$API_DIR/.venv/bin/python" ]; then
  echo "Setting up $API_DIR/.venv ..."
  "$PYTHON" -m venv "$API_DIR/.venv"
  "$API_DIR/.venv/bin/python" -m pip install -q -r "$API_DIR/requirements.lock"
fi

(cd "$API_DIR" && LOCAL_DEMO=1 .venv/bin/python -m uvicorn decision_api.app:app --host 127.0.0.1 --port 8000) &
backend=$!
trap 'kill "$backend" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null; then break; fi
  if ! kill -0 "$backend" 2>/dev/null; then echo "Backend failed to start." >&2; exit 1; fi
  sleep 0.5
done
echo "Backend ready: $(curl -s http://127.0.0.1:8000/api/v1/health)"
echo "Open http://127.0.0.1:4174/driver"

VITE_DATA_PROVIDER=api ./node_modules/.bin/vite --config vite.config.ts --port 4174 --strictPort
