#!/usr/bin/env bash
# 语音分析实验脚本的 shell 封装。
#
# 用法：
#   scripts/speech_analysis.sh synthetic
#       用合成正弦波跑一次端到端自检（不需要任何音频文件）。
#
#   scripts/speech_analysis.sh file <音频路径> [其他参数...]
#       分析指定的单个音频文件或目录（目录会批量处理）。
#
#   scripts/speech_analysis.sh sample
#       跑 scripts/resource/07-C-1-1.aiff 这个示例录音。
#
#   scripts/speech_analysis.sh json <音频路径>
#       file 模式 + 以 JSON 输出（方便再处理）。
#
#   scripts/speech_analysis.sh batch <目录> [csv输出路径]
#       对整个目录批量分析，并把结果写进 CSV（默认 ./speech_results.csv）。
#
#   scripts/speech_analysis.sh test
#       跑 backend/tests 下的全部单测。
#
# 环境变量：
#   SAMPLE_RATE  统一重采样率，默认 16000；设为 0 保留原采样率。
#   PYTHON_BIN   强制指定 python 解释器，默认走 uv run。
#
# 所有 <其他参数...> 会原样透传给底层 Python 脚本，比如：
#   scripts/speech_analysis.sh file my.wav --sample-rate 0 --json

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_SCRIPT="$ROOT_DIR/scripts/experiment_speech_analysis.py"
SAMPLE_RATE="${SAMPLE_RATE:-16000}"

# 让 macOS 上手装的 uv（~/.local/bin/uv）也能被找到
if [[ -d "$HOME/.local/bin" ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

run_python() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    (cd "$ROOT_DIR" && "$PYTHON_BIN" "$PY_SCRIPT" "$@")
    return
  fi
  if command -v uv >/dev/null 2>&1; then
    (cd "$ROOT_DIR" && uv run python "$PY_SCRIPT" "$@")
  else
    echo "[speech_analysis.sh] 未检测到 uv，也没有设置 PYTHON_BIN。" >&2
    echo "  → 建议安装 uv：curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
    echo "  → 或者：PYTHON_BIN=python3 scripts/speech_analysis.sh ..." >&2
    exit 1
  fi
}

usage() {
  sed -n '2,30p' "$0"
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  synthetic | syn)
    run_python --mode synthetic --sample-rate "$SAMPLE_RATE" "$@"
    ;;
  file)
    if [[ $# -lt 1 ]]; then
      echo "[speech_analysis.sh] file 模式需要一个音频路径。" >&2
      echo "  例如：scripts/speech_analysis.sh file scripts/resource/07-C-1-1.aiff" >&2
      exit 2
    fi
    audio="$1"
    shift
    run_python --mode file --audio "$audio" --sample-rate "$SAMPLE_RATE" "$@"
    ;;
  sample)
    sample_audio="$ROOT_DIR/scripts/resource/07-C-1-1.aiff"
    if [[ ! -f "$sample_audio" ]]; then
      echo "[speech_analysis.sh] 找不到示例音频：$sample_audio" >&2
      exit 2
    fi
    run_python --mode file --audio "$sample_audio" --sample-rate "$SAMPLE_RATE" "$@"
    ;;
  json)
    if [[ $# -lt 1 ]]; then
      echo "[speech_analysis.sh] json 子命令需要一个音频路径。" >&2
      exit 2
    fi
    audio="$1"
    shift
    run_python --mode file --audio "$audio" --sample-rate "$SAMPLE_RATE" --json "$@"
    ;;
  batch)
    if [[ $# -lt 1 ]]; then
      echo "[speech_analysis.sh] batch 子命令需要一个目录。" >&2
      exit 2
    fi
    target_dir="$1"
    shift
    csv_out="${1:-$ROOT_DIR/speech_results.csv}"
    [[ $# -gt 0 ]] && shift || true
    run_python --mode file --audio "$target_dir" --csv "$csv_out" --sample-rate "$SAMPLE_RATE" "$@"
    echo "[speech_analysis.sh] CSV 已写入：$csv_out"
    ;;
  test)
    if command -v uv >/dev/null 2>&1; then
      (cd "$ROOT_DIR" && uv run python -m unittest discover -s backend/tests)
    else
      (cd "$ROOT_DIR" && "${PYTHON_BIN:-python3}" -m unittest discover -s backend/tests)
    fi
    ;;
  help | -h | --help | "")
    usage
    ;;
  *)
    echo "[speech_analysis.sh] 未知子命令：$cmd" >&2
    echo "" >&2
    usage >&2
    exit 2
    ;;
esac
