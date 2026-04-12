#!/usr/bin/env bash
# cloud-ictneo console · one-shot launcher
# Starts backend (FastAPI on :8765) and frontend (Vite dev on :5173).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

if [ ! -d "$BACKEND/.venv" ]; then
  echo "[backend] creating virtualenv"
  python -m venv "$BACKEND/.venv"
fi

PY="$BACKEND/.venv/Scripts/python.exe"
[ -x "$PY" ] || PY="$BACKEND/.venv/bin/python"

echo "[backend] installing deps"
PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1 "$PY" -m pip install --quiet -r "$BACKEND/requirements.txt"

echo "[frontend] installing deps"
(cd "$FRONTEND" && npm install --silent)

echo "[backend] starting uvicorn on :8765"
"$PY" -m uvicorn app.main:app --app-dir "$BACKEND" --host 127.0.0.1 --port 8765 &
BACK_PID=$!

cleanup() {
  echo "shutting down"
  kill "$BACK_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[frontend] starting vite on :5173"
(cd "$FRONTEND" && npm run dev -- --host 127.0.0.1 --port 5173)
