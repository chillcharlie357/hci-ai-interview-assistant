"""本地文件语音分析实验脚本。

两种模式，通过 --mode 切换：

1. file 模式（默认）：分析你指定的本地音频文件或目录
    python scripts/experiment_speech_analysis.py --mode file --audio scripts/resource/07-C-1-1.aiff
    # 省略 --mode 也行，直接给路径
    python scripts/experiment_speech_analysis.py scripts/resource/07-C-1-1.aiff
    # 批量目录
    python scripts/experiment_speech_analysis.py --mode file --audio samples/ --csv out.csv
    # JSON 输出
    python scripts/experiment_speech_analysis.py sample.mp3 --json

2. synthetic 模式：不用外部文件，脚本内生成正弦波 + 静音做端到端自检
    python scripts/experiment_speech_analysis.py --mode synthetic

支持的格式：wav / mp3 / webm / m4a / ogg / flac / aiff / aif / aifc
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import asdict
from pathlib import Path

# 让脚本既能 `python scripts/xxx.py`，也能 `python -m scripts.xxx`
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.speech_analysis import analyze_speech  # noqa: E402
from backend.speech_analysis.types import SpeechAnalysis  # noqa: E402


AUDIO_EXTS = {".wav", ".mp3", ".webm", ".m4a", ".ogg", ".flac", ".aiff", ".aif", ".aifc"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Speech analysis experiment runner.")
    parser.add_argument(
        "--mode",
        choices=("file", "synthetic"),
        default=None,
        help="运行模式：file=分析本地文件/目录；synthetic=脚本内合成音频自检。缺省时：给了路径走 file，没给则走 synthetic。",
    )
    parser.add_argument(
        "target",
        nargs="?",
        help="file 模式下的音频文件或目录路径（也可用 --audio 指定）。",
    )
    parser.add_argument(
        "--audio",
        "-a",
        type=str,
        default=None,
        help="file 模式的音频路径，等价于位置参数 target。",
    )
    parser.add_argument("--json", action="store_true", help="file 模式下以 JSON 形式输出单文件结果。")
    parser.add_argument("--csv", type=Path, help="file 批量模式下把结果写入 CSV。")
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="等价于 --mode synthetic，保留向后兼容。",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=16000,
        help="统一重采样到的采样率，传 0 表示保留原采样率。",
    )
    args = parser.parse_args()

    target_sample_rate = None if args.sample_rate == 0 else args.sample_rate

    # 模式决策：显式 --mode 最优先；其次 --synthetic；再次按是否给了路径
    audio_arg = args.audio or args.target
    if args.mode == "synthetic" or args.synthetic:
        mode = "synthetic"
    elif args.mode == "file":
        mode = "file"
    else:
        mode = "file" if audio_arg else "synthetic"

    if mode == "synthetic":
        return _run_synthetic(target_sample_rate)

    if not audio_arg:
        parser.error("file 模式需要传音频路径（位置参数或 --audio）。或改用 --mode synthetic。")

    target_path = Path(audio_arg).expanduser().resolve()
    if not target_path.exists():
        print(f"[error] 路径不存在：{target_path}", file=sys.stderr)
        return 2

    if target_path.is_file():
        return _run_single(target_path, target_sample_rate, as_json=args.json)
    return _run_batch(target_path, target_sample_rate, csv_path=args.csv)


# -------------------- 单文件 --------------------


def _run_single(path: Path, target_sample_rate: int | None, *, as_json: bool) -> int:
    print(f"[info] 正在分析：{path}")
    result = analyze_speech(path, target_sample_rate=target_sample_rate)

    if as_json:
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        return 0

    _print_human_report(path, result)
    return 0


def _print_human_report(path: Path, result: SpeechAnalysis) -> None:
    print()
    print("=" * 60)
    print(f"文件：{path.name}")
    print(f"状态：{result.status}    后端：{result.backend}")
    print("=" * 60)

    if result.acoustic is None:
        print("未能计算特征。")
    else:
        f = result.acoustic
        print(f"时长            : {f.duration_sec:.2f} s  (采样率 {f.sample_rate} Hz)")
        print(f"语音占比        : {f.speech_ratio * 100:.1f} %")
        print(
            f"停顿            : {f.pause_count} 次，合计 {f.pause_total_sec:.2f} s，"
            f"最长 {f.longest_pause_sec:.2f} s"
        )
        print(f"语速（VAD节奏） : {f.speech_rate_sps:.2f} 次/秒")
        print(f"响度            : mean={f.rms_db_mean:.1f} dBFS  动态范围={f.dynamic_range_db:.1f} dB")
        print(
            "F0              : "
            + (
                f"mean={f.f0_mean_hz:.1f} Hz, std={f.f0_std_hz:.1f} Hz, "
                f"range={f.f0_range_hz:.1f} Hz, voiced_ratio={f.voiced_ratio:.2f}"
                if f.f0_mean_hz is not None
                else "未检测到稳定基频"
            )
        )
        print(
            "音质            : "
            + (
                f"jitter={f.jitter:.4f}, shimmer={f.shimmer:.4f}, HNR={f.hnr_db:.1f} dB"
                if f.jitter is not None
                else "未安装 parselmouth，跳过"
            )
        )

    if result.observations:
        print("\n观察点：")
        for item in result.observations:
            print(f"  - {item}")

    if result.warnings:
        print("\n提醒：")
        for item in result.warnings:
            print(f"  ! {item}")
    print()


# -------------------- 批量 --------------------


def _run_batch(directory: Path, target_sample_rate: int | None, *, csv_path: Path | None) -> int:
    audio_files = sorted(p for p in directory.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTS)
    if not audio_files:
        print(f"[warn] 目录下没有找到支持的音频文件：{directory}")
        return 1

    rows: list[dict[str, object]] = []
    for path in audio_files:
        print(f"[info] {path.relative_to(directory)} ...")
        result = analyze_speech(path, target_sample_rate=target_sample_rate)
        row: dict[str, object] = {
            "file": str(path.relative_to(directory)),
            "status": result.status,
            "backend": result.backend,
        }
        if result.acoustic:
            row.update(asdict(result.acoustic))
        row["warnings"] = " | ".join(result.warnings)
        rows.append(row)

    if csv_path:
        _write_csv(csv_path, rows)
        print(f"[done] 已写入 {csv_path}")
    else:
        print("\n汇总：")
        for row in rows:
            print(
                f"- {row['file']}: status={row['status']}, "
                f"duration={row.get('duration_sec', 0):.1f}s, "
                f"pause_count={row.get('pause_count', 0)}, "
                f"rate={row.get('speech_rate_sps', 0):.1f} sps"
            )
    return 0


def _write_csv(csv_path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    fieldnames: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


# -------------------- 合成样本自检 --------------------


def _run_synthetic(target_sample_rate: int | None) -> int:
    try:
        import numpy as np
    except ImportError:
        print("[error] 需要 numpy 才能生成合成样本：pip install numpy", file=sys.stderr)
        return 3

    print("[info] 生成合成音频：3 段 220Hz 元音 + 2 段静音，共约 3.5 秒")
    sample_rate = target_sample_rate or 16000
    segments = []
    tone_dur = 0.6
    pause_dur = 0.4
    t = np.arange(int(sample_rate * tone_dur)) / sample_rate
    tone = 0.5 * np.sin(2 * np.pi * 220 * t).astype(np.float32)
    silence = np.zeros(int(sample_rate * pause_dur), dtype=np.float32)
    for _ in range(3):
        segments.extend([tone, silence])
    samples = np.concatenate(segments[:-1])  # 结尾不加静音

    result = analyze_speech(samples, sample_rate=sample_rate, target_sample_rate=target_sample_rate)
    _print_human_report(Path("<synthetic>"), result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
