#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Running Python unit tests..."
(cd "$ROOT_DIR" && python3 -m unittest discover -s backend/tests)

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && pnpm install)
fi

echo "Running frontend unit tests..."
(cd "$ROOT_DIR/frontend" && pnpm test)

echo "Building frontend..."
(cd "$ROOT_DIR/frontend" && pnpm build)
