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
FACE_ASSETS_REQUIRED="${FACE_ASSETS_REQUIRED:-0}"

command -v curl >/dev/null 2>&1 || {
  echo "curl is required to download the face landmarker model." >&2
  exit 1
}

if [[ ! -d "$FRONTEND_DIR/node_modules/@mediapipe/tasks-vision/wasm" ]]; then
  echo "frontend dependencies are missing. Run 'cd frontend && pnpm install' first." >&2
  exit 1
fi

mkdir -p "$MODEL_DIR" "$WASM_DIR"

if [[ -f "$MODEL_DIR/face_landmarker.task" ]]; then
  echo "Face landmarker model already exists, skipping download."
else
  echo "Downloading face landmarker model..."
  if ! curl -L --connect-timeout 10 --max-time 120 "$MODEL_URL" -o "$MODEL_DIR/face_landmarker.task"; then
    echo "WARNING: Failed to download face landmarker model (network issue)." >&2
    if [[ "$FACE_ASSETS_REQUIRED" == "1" ]]; then
      echo "Face analysis assets are required for this build." >&2
      exit 1
    fi
    echo "Face analysis will be degraded but interview flow is not affected." >&2
  fi
fi

echo "Copying MediaPipe wasm runtime..."
cp "$FRONTEND_DIR/node_modules/@mediapipe/tasks-vision/wasm/"* "$WASM_DIR/"

if [[ "$FACE_ASSETS_REQUIRED" == "1" ]]; then
  test -f "$MODEL_DIR/face_landmarker.task"
  test -f "$WASM_DIR/vision_wasm_internal.js"
  test -f "$WASM_DIR/vision_wasm_internal.wasm"
fi

echo "Face analysis assets are ready:"
echo "  Model: $MODEL_DIR/face_landmarker.task"
echo "  Wasm:  $WASM_DIR"
