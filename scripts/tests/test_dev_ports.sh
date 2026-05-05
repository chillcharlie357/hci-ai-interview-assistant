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
