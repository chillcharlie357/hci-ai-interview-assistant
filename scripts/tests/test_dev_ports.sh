#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

source "$ROOT_DIR/scripts/lib/dev_ports.sh"

TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

OCCUPIED_PORT="45678"
lsof() {
  if [[ "$*" == *"-iTCP:$OCCUPIED_PORT"* ]]; then
    echo "COMMAND   PID USER FD TYPE DEVICE SIZE/OFF NODE NAME"
    echo "python3 12345 test 3u IPv4 fake 0t0 TCP 127.0.0.1:$OCCUPIED_PORT (LISTEN)"
    return 0
  fi
  return 1
}

if require_port_available "$OCCUPIED_PORT" "API" >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"; then
  echo "expected occupied port check to fail" >&2
  exit 1
fi

grep -q "API port $OCCUPIED_PORT is already in use" "$TMP_DIR/stderr"
grep -q "lsof -nP -iTCP:$OCCUPIED_PORT -sTCP:LISTEN" "$TMP_DIR/stderr"

FREE_PORT="45679"
require_port_available "$FREE_PORT" "Frontend" >"$TMP_DIR/free-stdout" 2>"$TMP_DIR/free-stderr"
[[ ! -s "$TMP_DIR/free-stderr" ]]

KILLED_PORT="45680"
FAILED_KILL_PORT="45681"
kill_calls=()
lsof() {
  if [[ "$*" == *"-iTCP:$KILLED_PORT"* && "$*" == *"-t"* ]]; then
    if [[ "${PORT_RELEASED:-0}" == "1" ]]; then
      return 1
    fi
    echo "23456"
    return 0
  fi
  if [[ "$*" == *"-iTCP:$KILLED_PORT"* ]]; then
    if [[ "${PORT_RELEASED:-0}" == "1" ]]; then
      return 1
    fi
    echo "COMMAND   PID USER FD TYPE DEVICE SIZE/OFF NODE NAME"
    echo "node 23456 test 16u IPv4 fake 0t0 TCP *:$KILLED_PORT (LISTEN)"
    return 0
  fi
  if [[ "$*" == *"-iTCP:$FAILED_KILL_PORT"* && "$*" == *"-t"* ]]; then
    echo "34567"
    return 0
  fi
  if [[ "$*" == *"-iTCP:$FAILED_KILL_PORT"* ]]; then
    echo "COMMAND   PID USER FD TYPE DEVICE SIZE/OFF NODE NAME"
    echo "node 34567 test 16u IPv4 fake 0t0 TCP *:$FAILED_KILL_PORT (LISTEN)"
    return 0
  fi
  if [[ "$*" == *"-iTCP:$OCCUPIED_PORT"* ]]; then
    echo "COMMAND   PID USER FD TYPE DEVICE SIZE/OFF NODE NAME"
    echo "python3 12345 test 3u IPv4 fake 0t0 TCP 127.0.0.1:$OCCUPIED_PORT (LISTEN)"
    return 0
  fi
  return 1
}

kill() {
  kill_calls+=("$*")
  if [[ "$*" == *"34567"* ]]; then
    return 1
  fi
  PORT_RELEASED=1
  return 0
}

stop_port_listeners "$KILLED_PORT" "Frontend" >"$TMP_DIR/stop-stdout" 2>"$TMP_DIR/stop-stderr"
grep -q "Stopping old Frontend service on port $KILLED_PORT" "$TMP_DIR/stop-stderr"
[[ "${kill_calls[0]}" == "23456" ]]
require_port_available "$KILLED_PORT" "Frontend" >"$TMP_DIR/released-stdout" 2>"$TMP_DIR/released-stderr"
[[ ! -s "$TMP_DIR/released-stderr" ]]

if stop_port_listeners "$FAILED_KILL_PORT" "Frontend" >"$TMP_DIR/failed-kill-stdout" 2>"$TMP_DIR/failed-kill-stderr"; then
  echo "expected failed kill to return non-zero" >&2
  exit 1
fi
grep -q "Could not stop PID 34567 on port $FAILED_KILL_PORT" "$TMP_DIR/failed-kill-stderr"
