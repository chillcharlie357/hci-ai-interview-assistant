from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from backend.speech_analysis.types import AcousticFeatures

if TYPE_CHECKING:
    import numpy as np


# 默认窗口参数：25 ms 帧长，10 ms 步长，是语音处理常用值
FRAME_MS = 25
HOP_MS = 10

# VAD 能量阈值：相对最大帧能量的比例
VAD_ENERGY_RATIO = 0.02
# 低于此绝对能量的帧无论如何都视作静音（防止背景噪声拉高阈值）
VAD_ABSOLUTE_FLOOR = 1e-4
# 一段连续静音达到这个秒数才算作「停顿」
MIN_PAUSE_SEC = 0.25

# F0 搜索范围（典型语音基频）
F0_MIN_HZ = 75.0
F0_MAX_HZ = 450.0


@dataclass(frozen=True)
class _FramedSignal:
    frames: "np.ndarray"       # shape: (n_frames, frame_length)
    frame_length: int
    hop_length: int
    rms: "np.ndarray"          # shape: (n_frames,)
    voiced_mask: "np.ndarray"  # bool, shape: (n_frames,)


def compute_acoustic_features(
    samples: "np.ndarray",
    sample_rate: int,
) -> tuple[AcousticFeatures, str]:
    """计算声学特征。

    返回 (features, backend_name)。backend_name 标明实际使用的能力等级，
    方便调用方在 observations 中说明。
    """

    numpy = _require_numpy()

    if samples.size == 0:
        empty = _empty_features(sample_rate)
        return empty, "numpy-fallback"

    duration_sec = float(samples.shape[0]) / float(sample_rate)
    framed = _frame_signal(samples, sample_rate, numpy)

    pause_stats = _pause_statistics(framed, sample_rate)
    speech_rate = _estimate_speech_rate(framed, sample_rate, numpy)
    rms_stats = _rms_statistics(framed.rms, numpy)
    f0_stats, backend = _f0_statistics(samples, sample_rate, framed, numpy)
    voice_quality = _voice_quality(samples, sample_rate)

    features = AcousticFeatures(
        duration_sec=duration_sec,
        sample_rate=sample_rate,
        speech_ratio=pause_stats["speech_ratio"],
        pause_count=pause_stats["pause_count"],
        pause_total_sec=pause_stats["pause_total_sec"],
        longest_pause_sec=pause_stats["longest_pause_sec"],
        speech_rate_sps=speech_rate,
        rms_mean=rms_stats["rms_mean"],
        rms_std=rms_stats["rms_std"],
        rms_db_mean=rms_stats["rms_db_mean"],
        dynamic_range_db=rms_stats["dynamic_range_db"],
        f0_mean_hz=f0_stats.get("f0_mean_hz"),
        f0_std_hz=f0_stats.get("f0_std_hz"),
        f0_min_hz=f0_stats.get("f0_min_hz"),
        f0_max_hz=f0_stats.get("f0_max_hz"),
        f0_range_hz=f0_stats.get("f0_range_hz"),
        voiced_ratio=f0_stats.get("voiced_ratio"),
        jitter=voice_quality.get("jitter"),
        shimmer=voice_quality.get("shimmer"),
        hnr_db=voice_quality.get("hnr_db"),
    )
    return features, backend


# -------------------- 帧切分与 VAD --------------------


def _frame_signal(samples: "np.ndarray", sample_rate: int, numpy) -> _FramedSignal:
    frame_length = max(1, int(sample_rate * FRAME_MS / 1000))
    hop_length = max(1, int(sample_rate * HOP_MS / 1000))

    if samples.shape[0] < frame_length:
        padded = numpy.pad(samples, (0, frame_length - samples.shape[0]))
        frames = padded[None, :]
    else:
        n_frames = 1 + (samples.shape[0] - frame_length) // hop_length
        shape = (n_frames, frame_length)
        strides = (samples.strides[0] * hop_length, samples.strides[0])
        frames = numpy.lib.stride_tricks.as_strided(samples, shape=shape, strides=strides)

    rms = numpy.sqrt(numpy.mean(frames.astype(numpy.float64) ** 2, axis=1)).astype(numpy.float32)
    if rms.size:
        threshold = max(VAD_ABSOLUTE_FLOOR, float(rms.max()) * VAD_ENERGY_RATIO)
    else:
        threshold = VAD_ABSOLUTE_FLOOR
    voiced_mask = rms >= threshold

    return _FramedSignal(
        frames=frames,
        frame_length=frame_length,
        hop_length=hop_length,
        rms=rms,
        voiced_mask=voiced_mask,
    )


def _pause_statistics(framed: _FramedSignal, sample_rate: int) -> dict[str, float]:
    hop_sec = framed.hop_length / float(sample_rate)
    voiced_mask = framed.voiced_mask
    total_frames = int(voiced_mask.shape[0])
    if total_frames == 0:
        return {
            "speech_ratio": 0.0,
            "pause_count": 0,
            "pause_total_sec": 0.0,
            "longest_pause_sec": 0.0,
        }

    speech_ratio = float(voiced_mask.sum()) / float(total_frames)

    # 跳过首尾静音，只统计「句中停顿」
    voiced_indices = [i for i, flag in enumerate(voiced_mask) if flag]
    if not voiced_indices:
        return {
            "speech_ratio": 0.0,
            "pause_count": 0,
            "pause_total_sec": 0.0,
            "longest_pause_sec": 0.0,
        }

    first_voiced, last_voiced = voiced_indices[0], voiced_indices[-1]
    pause_runs: list[int] = []
    run_length = 0
    for index in range(first_voiced, last_voiced + 1):
        if voiced_mask[index]:
            if run_length > 0:
                pause_runs.append(run_length)
                run_length = 0
        else:
            run_length += 1

    pause_durations = [run * hop_sec for run in pause_runs if run * hop_sec >= MIN_PAUSE_SEC]
    return {
        "speech_ratio": speech_ratio,
        "pause_count": len(pause_durations),
        "pause_total_sec": float(sum(pause_durations)),
        "longest_pause_sec": float(max(pause_durations)) if pause_durations else 0.0,
    }


# -------------------- 语速估计 --------------------


def _estimate_speech_rate(framed: _FramedSignal, sample_rate: int, numpy) -> float:
    """用能量局部极大值做「音节核」粗估。

    注意：这是一个近似值，不等价于真实音节数；仅作为观察信号，
    告诉人工复核「语速明显偏快/偏慢」的候选。
    """

    rms = framed.rms
    if rms.size < 3:
        return 0.0

    hop_sec = framed.hop_length / float(sample_rate)
    voiced_duration = float(framed.voiced_mask.sum()) * hop_sec
    if voiced_duration <= 0.1:
        return 0.0

    # 平滑一下防止噪声导致多峰
    kernel = max(3, int(0.05 / hop_sec))  # 50ms 平滑窗
    if kernel > rms.size:
        smoothed = rms.astype(numpy.float64)
    else:
        weights = numpy.ones(kernel, dtype=numpy.float64) / kernel
        smoothed = numpy.convolve(rms.astype(numpy.float64), weights, mode="same")

    threshold = float(smoothed.mean())
    peaks = 0
    for i in range(1, smoothed.size - 1):
        if smoothed[i] > threshold and smoothed[i] >= smoothed[i - 1] and smoothed[i] > smoothed[i + 1]:
            peaks += 1
    return peaks / voiced_duration if voiced_duration > 0 else 0.0


# -------------------- RMS / 动态范围 --------------------


def _rms_statistics(rms: "np.ndarray", numpy) -> dict[str, float]:
    if rms.size == 0:
        return {"rms_mean": 0.0, "rms_std": 0.0, "rms_db_mean": -120.0, "dynamic_range_db": 0.0}

    rms_mean = float(rms.mean())
    rms_std = float(rms.std())
    db = 20.0 * numpy.log10(numpy.clip(rms, 1e-6, None))
    return {
        "rms_mean": rms_mean,
        "rms_std": rms_std,
        "rms_db_mean": float(db.mean()),
        "dynamic_range_db": float(db.max() - db.min()),
    }


# -------------------- F0 （优先 librosa.pyin） --------------------


def _f0_statistics(
    samples: "np.ndarray",
    sample_rate: int,
    framed: _FramedSignal,
    numpy,
) -> tuple[dict[str, float | None], str]:
    backend = "numpy-fallback"
    try:
        import librosa  # type: ignore
    except Exception:
        librosa = None

    f0_series: "np.ndarray | None" = None
    voiced_flag: "np.ndarray | None" = None

    if librosa is not None:
        try:
            f0, voiced, _ = librosa.pyin(
                samples,
                fmin=F0_MIN_HZ,
                fmax=F0_MAX_HZ,
                sr=sample_rate,
                frame_length=max(1024, framed.frame_length * 2),
            )
            f0_series = f0
            voiced_flag = voiced
            backend = "librosa"
        except Exception:
            f0_series = None

    if f0_series is None:
        f0_series = _autocorrelation_f0(framed, sample_rate, numpy)
        voiced_flag = f0_series > 0

    if f0_series is None or f0_series.size == 0:
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": None,
        }, backend

    voiced_mask = numpy.isfinite(f0_series) & (f0_series > 0)
    if voiced_flag is not None:
        voiced_mask = voiced_mask & numpy.asarray(voiced_flag, dtype=bool)

    voiced_values = f0_series[voiced_mask]
    voiced_ratio = float(voiced_mask.sum()) / float(f0_series.size) if f0_series.size else 0.0

    if voiced_values.size == 0:
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": voiced_ratio,
        }, backend

    return {
        "f0_mean_hz": float(voiced_values.mean()),
        "f0_std_hz": float(voiced_values.std()),
        "f0_min_hz": float(voiced_values.min()),
        "f0_max_hz": float(voiced_values.max()),
        "f0_range_hz": float(voiced_values.max() - voiced_values.min()),
        "voiced_ratio": voiced_ratio,
    }, backend


def _autocorrelation_f0(framed: _FramedSignal, sample_rate: int, numpy) -> "np.ndarray":
    """无 librosa 时的兜底：逐帧自相关估计 F0。结果精度有限但可用。"""
    min_lag = max(1, int(sample_rate / F0_MAX_HZ))
    max_lag = min(framed.frame_length - 1, int(sample_rate / F0_MIN_HZ))
    if max_lag <= min_lag:
        return numpy.zeros(framed.frames.shape[0], dtype=numpy.float32)

    f0 = numpy.zeros(framed.frames.shape[0], dtype=numpy.float32)
    for i, frame in enumerate(framed.frames):
        if not framed.voiced_mask[i]:
            continue
        windowed = frame - frame.mean()
        energy = float(numpy.dot(windowed, windowed))
        if energy <= 0:
            continue
        # 计算自相关（仅正向 lag，避免 FFT 依赖）
        autocorr = numpy.correlate(windowed, windowed, mode="full")[len(windowed) - 1 :]
        if autocorr.size <= max_lag:
            continue
        segment = autocorr[min_lag : max_lag + 1]
        lag = int(numpy.argmax(segment)) + min_lag
        peak = float(segment[lag - min_lag])
        if peak <= 0.3 * energy:
            continue  # 相关性太弱，视为无声帧
        f0[i] = sample_rate / lag
    return f0


# -------------------- 音质：jitter / shimmer / HNR --------------------


def _voice_quality(samples: "np.ndarray", sample_rate: int) -> dict[str, float | None]:
    """只有装了 parselmouth 才会返回有效值；否则全是 None。

    这里不做手写版本——jitter/shimmer 算法对周期检测非常敏感，
    手写版本容易误导人。宁可 None 也不要错。
    """
    try:
        import parselmouth  # type: ignore
    except Exception:
        return {"jitter": None, "shimmer": None, "hnr_db": None}

    try:
        sound = parselmouth.Sound(values=samples.astype("float64"), sampling_frequency=float(sample_rate))
        point_process = parselmouth.praat.call(sound, "To PointProcess (periodic, cc)", F0_MIN_HZ, F0_MAX_HZ)
        jitter = parselmouth.praat.call(
            point_process, "Get jitter (local)", 0.0, 0.0, 0.0001, 0.02, 1.3
        )
        shimmer = parselmouth.praat.call(
            [sound, point_process], "Get shimmer (local)", 0.0, 0.0, 0.0001, 0.02, 1.3, 1.6
        )
        harmonicity = parselmouth.praat.call(sound, "To Harmonicity (cc)", 0.01, F0_MIN_HZ, 0.1, 1.0)
        hnr = parselmouth.praat.call(harmonicity, "Get mean", 0.0, 0.0)
        return {
            "jitter": _safe_float(jitter),
            "shimmer": _safe_float(shimmer),
            "hnr_db": _safe_float(hnr),
        }
    except Exception:
        return {"jitter": None, "shimmer": None, "hnr_db": None}


def _safe_float(value: object) -> float | None:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if result != result:  # NaN
        return None
    return result


def _empty_features(sample_rate: int) -> AcousticFeatures:
    return AcousticFeatures(
        duration_sec=0.0,
        sample_rate=sample_rate,
        speech_ratio=0.0,
        pause_count=0,
        pause_total_sec=0.0,
        longest_pause_sec=0.0,
        speech_rate_sps=0.0,
        rms_mean=0.0,
        rms_std=0.0,
        rms_db_mean=-120.0,
        dynamic_range_db=0.0,
        f0_mean_hz=None,
        f0_std_hz=None,
        f0_min_hz=None,
        f0_max_hz=None,
        f0_range_hz=None,
        voiced_ratio=None,
        jitter=None,
        shimmer=None,
        hnr_db=None,
    )


def _require_numpy():
    try:
        import numpy
    except ImportError as exc:
        from backend.speech_analysis.types import SpeechAnalysisError

        raise SpeechAnalysisError(
            "numpy_not_installed",
            "语音分析需要 numpy，请执行 `uv add numpy` 或 `pip install numpy`。",
        ) from exc
    return numpy
