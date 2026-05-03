#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export API_PORT
export FRONTEND_PORT
export E2E_API_BASE_URL="${E2E_API_BASE_URL:-http://127.0.0.1:$API_PORT}"
export E2E_FRONTEND_BASE_URL="${E2E_FRONTEND_BASE_URL:-http://localhost:$FRONTEND_PORT}"
export INTERVIEW_DISABLE_DOTENV=1
export MINERU_COMMAND="${E2E_MINERU_COMMAND:-$ROOT_DIR/scripts/mock_mineru_open_api.py}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT_DIR/.uv-cache}"
export UV_DEFAULT_INDEX="${UV_DEFAULT_INDEX:-https://pypi.tuna.tsinghua.edu.cn/simple}"
unset OPENAI_API_KEY
unset OPENAI_BASE_URL
unset OPENAI_MODEL
unset LIVEKIT_URL
unset LIVEKIT_API_KEY
unset LIVEKIT_API_SECRET

wait_for_url() {
  local url="$1"
  local label="$2"
  for _ in {1..60}; do
    if curl -sS -o /dev/null "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $label at $url" >&2
  return 1
}

cleanup() {
  if [[ -n "${DEV_PID:-}" ]]; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
    wait "$DEV_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting mocked E2E services..."
"$ROOT_DIR/scripts/dev.sh" &
DEV_PID=$!

wait_for_url "$E2E_API_BASE_URL/api/sessions/__healthcheck__" "API"
wait_for_url "$E2E_FRONTEND_BASE_URL/recruiter" "frontend"

echo "Running full mocked-device E2E flow..."
(cd "$ROOT_DIR" && node scripts/e2e-full-flow.mjs)
