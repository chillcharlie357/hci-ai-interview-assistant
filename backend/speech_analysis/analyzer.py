from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from backend.speech_analysis.features import compute_acoustic_features
from backend.speech_analysis.loader import load_audio
from backend.speech_analysis.types import (
    AcousticFeatures,
    SpeechAnalysis,
    SpeechAnalysisError,
)

if TYPE_CHECKING:
    import numpy as np


def analyze_speech(
    source: "str | Path | bytes | np.ndarray",
    *,
    sample_rate: int | None = None,
    target_sample_rate: int | None = 16000,
) -> SpeechAnalysis:
    """对一段语音做基础声学分析。

    参数
    ----
    source:
        - 文件路径（str / Path），支持 wav / mp3 / webm / m4a / ogg / flac。
        - 原始字节 bytes（自动嗅探格式）。
        - 已经解码好的 numpy 一维 float 数组；此时必须同时提供 sample_rate。
    sample_rate:
        仅当 source 是 ndarray 时需要。
    target_sample_rate:
        读入后统一重采样到该采样率，默认 16 kHz。传 None 则保留原采样率。

    返回
    ----
    SpeechAnalysis: 包含状态、特征、observations、warnings。任何错误都会被
    收敛成 SpeechAnalysis(status="fallback", ...) 而不是抛出异常，方便调用方
    在主流程中无损接入。
    """

    try:
        samples, resolved_sample_rate = _resolve_input(source, sample_rate, target_sample_rate)
    except SpeechAnalysisError as error:
        return SpeechAnalysis(
            status="fallback",
            backend="none",
            acoustic=None,
            observations=[],
            warnings=[f"{error.code}: {error.message}"],
        )

    try:
        features, backend = compute_acoustic_features(samples, resolved_sample_rate)
    except SpeechAnalysisError as error:
        return SpeechAnalysis(
            status="fallback",
            backend="none",
            acoustic=None,
            observations=[],
            warnings=[f"{error.code}: {error.message}"],
        )
    except Exception as error:  # 防御性兜底：特征计算出任何未预期异常都退化
        return SpeechAnalysis(
            status="fallback",
            backend="none",
            acoustic=None,
            observations=[],
            warnings=[f"feature_computation_failed: {error}"],
        )

    observations = _build_observations(features)
    warnings = _build_warnings(features, backend)
    status = _resolve_status(features, backend)

    return SpeechAnalysis(
        status=status,
        backend=backend,
        acoustic=features,
        observations=observations,
        warnings=warnings,
    )


# -------------------- 输入归一化 --------------------


def _resolve_input(
    source: "str | Path | bytes | np.ndarray",
    sample_rate: int | None,
    target_sample_rate: int | None,
) -> "tuple[np.ndarray, int]":
    # ndarray 分支：调用方已解码好
    if _looks_like_ndarray(source):
        if sample_rate is None:
            raise SpeechAnalysisError(
                "missing_sample_rate",
                "传入 ndarray 时必须同时指定 sample_rate。",
            )
        import numpy as np  # 本地导入，避免模块级硬依赖

        samples = np.asarray(source, dtype=np.float32)
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        if target_sample_rate and target_sample_rate != sample_rate:
            from backend.speech_analysis.loader import _linear_resample

            samples = _linear_resample(samples, sample_rate, target_sample_rate)
            sample_rate = target_sample_rate
        return samples, int(sample_rate)

    return load_audio(source, target_sample_rate=target_sample_rate)


def _looks_like_ndarray(source: object) -> bool:
    return hasattr(source, "shape") and hasattr(source, "dtype")


# -------------------- observations & warnings --------------------


def _build_observations(features: AcousticFeatures) -> list[str]:
    """把数字翻译成谨慎的人类可读观察点。措辞必须是「观察到/检测到」，
    严禁给出能力/录用结论。
    """
    lines: list[str] = []

    # 语速
    if features.speech_rate_sps > 0:
        if features.speech_rate_sps > 6.0:
            lines.append(f"观察到语速偏快（约 {features.speech_rate_sps:.1f} 音节/秒），建议人工复核清晰度。")
        elif features.speech_rate_sps < 2.0:
            lines.append(f"观察到语速偏慢（约 {features.speech_rate_sps:.1f} 音节/秒），建议确认是否因思考或不熟悉话题。")
        else:
            lines.append(f"观察到语速约 {features.speech_rate_sps:.1f} 音节/秒，处于常见区间。")

    # 停顿
    if features.pause_count > 0:
        lines.append(
            f"检测到 {features.pause_count} 次句中停顿，累计 {features.pause_total_sec:.1f} 秒，"
            f"最长一次 {features.longest_pause_sec:.1f} 秒。"
        )
    else:
        lines.append("未检测到达到阈值的句中停顿。")

    # 语音占比
    lines.append(f"语音占比约 {features.speech_ratio * 100:.0f}%（剩余为静音或噪声）。")

    # F0 / 语调
    if features.f0_mean_hz is not None and features.f0_std_hz is not None:
        tone_hint = "起伏较平稳" if features.f0_std_hz < 25 else ("起伏明显" if features.f0_std_hz > 60 else "起伏适中")
        lines.append(
            f"检测到基频 F0 均值 {features.f0_mean_hz:.0f} Hz，标准差 {features.f0_std_hz:.0f} Hz，{tone_hint}。"
        )
        if features.f0_range_hz is not None:
            lines.append(f"F0 跨度约 {features.f0_range_hz:.0f} Hz，仅供复核语调丰富度参考。")
    else:
        lines.append("未能稳定检测到 F0，可能音频太短、太安静或未检测到人声。")

    # 音量
    lines.append(f"平均响度约 {features.rms_db_mean:.1f} dBFS，动态范围约 {features.dynamic_range_db:.1f} dB。")

    # 音质
    if features.jitter is not None and features.shimmer is not None:
        lines.append(
            f"检测到 jitter={features.jitter:.4f}，shimmer={features.shimmer:.4f}，"
            f"HNR={features.hnr_db:.1f} dB（仅作录音质量观察，不代表健康或情绪结论）。"
        )

    return lines


def _build_warnings(features: AcousticFeatures, backend: str) -> list[str]:
    warnings: list[str] = []
    if features.duration_sec < 2.0:
        warnings.append("录音时长不足 2 秒，所有指标仅供参考，建议要求重录。")
    if features.speech_ratio < 0.2 and features.duration_sec > 1.0:
        warnings.append("语音占比过低，可能存在噪声或麦克风问题。")
    if backend == "numpy-fallback":
        warnings.append("当前 F0 使用纯 numpy 自相关兜底算法，精度有限；建议安装 scipy 或 librosa。")
    elif backend == "scipy":
        warnings.append(
            "当前 F0 走 scipy 加窗自相关 + 抛物线插值（含倍频校正）；若需更精确可 `uv add librosa`，但 Intel Mac + Python 3.12 需预先解决 numba wheel 问题。"
        )
    if features.jitter is None:
        warnings.append("未安装 parselmouth，无法计算 jitter / shimmer / HNR；建议 `uv add praat-parselmouth`。")
    if features.rms_db_mean < -45.0 and features.duration_sec > 1.0:
        warnings.append("平均响度过低，可能录音过轻或采集设备有问题。")
    return warnings


def _resolve_status(features: AcousticFeatures, backend: str) -> str:
    if features.duration_sec == 0.0:
        return "fallback"
    if backend == "librosa" and features.jitter is not None:
        return "ok"
    if backend in ("librosa", "scipy"):
        return "partial"
    return "partial"
