#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
ASR_WS_PORT="${ASR_WS_PORT:-8765}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT_DIR/.uv-cache}"
export UV_DEFAULT_INDEX="${UV_DEFAULT_INDEX:-https://pypi.tuna.tsinghua.edu.cn/simple}"

source "$ROOT_DIR/scripts/lib/dev_ports.sh"

command -v uv >/dev/null 2>&1 || {
  echo "uv is required. Install it from https://docs.astral.sh/uv/ before starting the backend." >&2
  exit 1
}

command -v pnpm >/dev/null 2>&1 || {
  echo "pnpm is required." >&2
  exit 1
}

load_env_file() {
  local env_file="$ROOT_DIR/.env"
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    local line key value
    line="${raw_line#"${raw_line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    [[ -n "${!key:-}" ]] && continue
    export "$key=$value"
  done < "$env_file"
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

if [[ "${INTERVIEW_DISABLE_DOTENV:-0}" != "1" ]]; then
  load_env_file
fi

if [[ "${INTERVIEW_STOP_OLD_SERVICES:-1}" != "0" ]]; then
  stop_port_listeners "$API_PORT" "API" || true
  stop_port_listeners "$FRONTEND_PORT" "Frontend" || true
fi

PORT_CHECK_STATUS=0
require_port_available "$API_PORT" "API" || PORT_CHECK_STATUS=1
require_port_available "$FRONTEND_PORT" "Frontend" || PORT_CHECK_STATUS=1
if [[ "$PORT_CHECK_STATUS" -ne 0 ]]; then
  exit "$PORT_CHECK_STATUS"
fi

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  (cd "$ROOT_DIR/frontend" && pnpm install)
fi

(cd "$ROOT_DIR" && uv run python -m backend.interview.api --host 127.0.0.1 --port "$API_PORT") &
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
