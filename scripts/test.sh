#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT_DIR/.uv-cache}"
export UV_DEFAULT_INDEX="${UV_DEFAULT_INDEX:-https://pypi.tuna.tsinghua.edu.cn/simple}"
export INTERVIEW_DISABLE_DOTENV=1

echo "Running Python unit tests..."
(cd "$ROOT_DIR" && uv run python -m unittest discover -s backend/tests)

echo "Running script unit tests..."
(cd "$ROOT_DIR" && bash scripts/tests/test_dev_ports.sh)

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && pnpm install)
fi

echo "Running frontend unit tests..."
(cd "$ROOT_DIR/frontend" && pnpm test)

echo "Building frontend..."
(cd "$ROOT_DIR/frontend" && pnpm build)
