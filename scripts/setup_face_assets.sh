#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
if [[ ! -d "$FRONTEND_DIR" && -d "$ROOT_DIR" && -f "$ROOT_DIR/package.json" ]]; then
  FRONTEND_DIR="$ROOT_DIR"
fi
MODEL_DIR="$FRONTEND_DIR/public/models"
WASM_DIR="$FRONTEND_DIR/public/mediapipe/wasm"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

command -v curl >/dev/null 2>&1 || {
  echo "curl is required to download the face landmarker model." >&2
  exit 1
}

if [[ ! -d "$FRONTEND_DIR/node_modules/@mediapipe/tasks-vision/wasm" ]]; then
  echo "frontend dependencies are missing. Run 'cd frontend && pnpm install' first." >&2
  exit 1
fi

mkdir -p "$MODEL_DIR" "$WASM_DIR"

echo "Downloading face landmarker model..."
curl -L "$MODEL_URL" -o "$MODEL_DIR/face_landmarker.task"

echo "Copying MediaPipe wasm runtime..."
cp "$FRONTEND_DIR/node_modules/@mediapipe/tasks-vision/wasm/"* "$WASM_DIR/"

echo "Face analysis assets are ready:"
echo "  Model: $MODEL_DIR/face_landmarker.task"
echo "  Wasm:  $WASM_DIR"
