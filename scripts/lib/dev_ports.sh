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

stop_port_listeners() {
  local port="$1"
  local label="$2"
  local pids pid stop_failed

  pids="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -n "$pids" ]] || return 0

  echo "Stopping old $label service on port $port." >&2
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true

  stop_failed=0
  for pid in $pids; do
    if ! kill "$pid" >/dev/null 2>&1; then
      echo "Could not stop PID $pid on port $port." >&2
      stop_failed=1
    fi
  done
  [[ "$stop_failed" -eq 0 ]] || return 1

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done

  echo "Port $port is still occupied; forcing old $label service to stop." >&2
  stop_failed=0
  for pid in $pids; do
    if ! kill -KILL "$pid" >/dev/null 2>&1; then
      echo "Could not force stop PID $pid on port $port." >&2
      stop_failed=1
    fi
  done
  [[ "$stop_failed" -eq 0 ]] || return 1

  for _ in 1 2 3 4 5; do
    if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done

  return 1
}
