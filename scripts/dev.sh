#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required." >&2
  exit 1
}

command -v pnpm >/dev/null 2>&1 || {
  echo "pnpm is required." >&2
  exit 1
}

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  (cd "$ROOT_DIR/frontend" && pnpm install)
fi

(cd "$ROOT_DIR" && python3 -m backend.interview.api --host 127.0.0.1 --port "$API_PORT") &
API_PID=$!

(cd "$ROOT_DIR/frontend" && pnpm exec vite --host 0.0.0.0 --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo "AI-assisted interview MVP is starting:"
echo "  API:      http://127.0.0.1:$API_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "OpenAI-compatible LLM env: OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL"

while kill -0 "$API_PID" >/dev/null 2>&1 && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; do
  sleep 1
done
