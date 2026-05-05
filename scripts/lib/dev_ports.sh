#!/usr/bin/env bash

require_port_available() {
  local port="$1"
  local label="$2"

  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "$label port $port is already in use." >&2
    echo "Run: lsof -nP -iTCP:$port -sTCP:LISTEN" >&2
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
    echo "Stop the old process, or choose another port:" >&2
    echo "  VITE_API_BASE_URL=http://127.0.0.1:8001 API_PORT=8001 FRONTEND_PORT=5174 ./scripts/dev.sh" >&2
    return 1
  fi
}
