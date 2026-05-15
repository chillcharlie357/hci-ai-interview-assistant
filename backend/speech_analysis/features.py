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
# 一段连续有声达到这个秒数才算作有效发声段（防止爆音碎片抖动）
MIN_SPEECH_RUN_SEC = 0.06

# F0 搜索范围（典型语音基频）
F0_MIN_HZ = 75.0
F0_MAX_HZ = 450.0
# 长音频时分块计算 F0，避免一次性高内存/高时延
F0_CHUNK_SEC = 30.0
# 无 librosa 时，自相关 F0 的最大采样帧数，避免 1h 音频计算过慢
MAX_AUTOCORR_FRAMES = 12000


@dataclass(frozen=True)
class _FramedSignal:
    samples: "np.ndarray"      # 原始波形（mono float32）
    frame_starts: "np.ndarray"  # 每帧起点（sample index）
    frame_length: int
    hop_length: int
    rms: "np.ndarray"          # shape: (n_frames,)
    voiced_mask: "np.ndarray"  # bool, shape: (n_frames,)


@dataclass(frozen=True)
class _RunningMoments:
    count: int = 0
    sum: float = 0.0
    sum_sq: float = 0.0
    min_value: float | None = None
    max_value: float | None = None

    def update(self, values: "np.ndarray") -> "_RunningMoments":
        if values.size == 0:
            return self
        values64 = values.astype("float64", copy=False)
        chunk_count = int(values64.size)
        chunk_sum = float(values64.sum())
        chunk_sum_sq = float((values64 * values64).sum())
        chunk_min = float(values64.min())
        chunk_max = float(values64.max())
        return _RunningMoments(
            count=self.count + chunk_count,
            sum=self.sum + chunk_sum,
            sum_sq=self.sum_sq + chunk_sum_sq,
            min_value=chunk_min if self.min_value is None else min(self.min_value, chunk_min),
            max_value=chunk_max if self.max_value is None else max(self.max_value, chunk_max),
        )

    def to_stats(self) -> dict[str, float | None]:
        if self.count <= 0:
            return {
                "mean": None,
                "std": None,
                "min": None,
                "max": None,
                "range": None,
            }
        mean = self.sum / self.count
        variance = max(0.0, self.sum_sq / self.count - mean * mean)
        std = variance ** 0.5
        min_value = self.min_value
        max_value = self.max_value
        return {
            "mean": mean,
            "std": std,
            "min": min_value,
            "max": max_value,
            "range": (max_value - min_value) if (min_value is not None and max_value is not None) else None,
        }


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

    pause_stats = _pause_statistics(framed, sample_rate, numpy)
    speech_rate = _estimate_speech_rate_vad(framed, sample_rate, numpy)
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
        f0_std_semitones=f0_stats.get("f0_std_semitones"),
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

    # 确保至少 1 帧
    if samples.shape[0] < frame_length:
        padded = numpy.pad(samples, (0, frame_length - samples.shape[0]))
    else:
        padded = samples

    max_start = max(0, padded.shape[0] - frame_length)
    frame_starts = numpy.arange(0, max_start + 1, hop_length, dtype=numpy.int64)
    if frame_starts.size == 0:
        frame_starts = numpy.asarray([0], dtype=numpy.int64)

    # 低内存 RMS：用平方和前缀和计算滑窗能量，避免构造 (n_frames, frame_length) 大矩阵
    squared = padded.astype(numpy.float64, copy=False) ** 2
    cumsum = numpy.empty(squared.shape[0] + 1, dtype=numpy.float64)
    cumsum[0] = 0.0
    cumsum[1:] = numpy.cumsum(squared)
    ends = frame_starts + frame_length
    frame_energy = cumsum[ends] - cumsum[frame_starts]
    rms = numpy.sqrt(frame_energy / float(frame_length)).astype(numpy.float32)

    if rms.size:
        threshold = max(VAD_ABSOLUTE_FLOOR, float(rms.max()) * VAD_ENERGY_RATIO)
    else:
        threshold = VAD_ABSOLUTE_FLOOR
    voiced_mask = rms >= threshold

    return _FramedSignal(
        samples=padded,
        frame_starts=frame_starts,
        frame_length=frame_length,
        hop_length=hop_length,
        rms=rms,
        voiced_mask=voiced_mask,
    )


def _pause_statistics(framed: _FramedSignal, sample_rate: int, numpy) -> dict[str, float]:
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
    voiced_indices = numpy.flatnonzero(voiced_mask)
    if voiced_indices.size == 0:
        return {
            "speech_ratio": 0.0,
            "pause_count": 0,
            "pause_total_sec": 0.0,
            "longest_pause_sec": 0.0,
        }

    first_voiced, last_voiced = int(voiced_indices[0]), int(voiced_indices[-1])
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


# -------------------- 语速估计（VAD） --------------------


def _estimate_speech_rate_vad(framed: _FramedSignal, sample_rate: int, numpy) -> float:
    """基于 VAD 语音片段估计语速 proxy（单位 sps）。

    定义：
    - 先从 voiced_mask 中提取连续有声段（过滤掉短于 MIN_SPEECH_RUN_SEC 的碎片）。
    - 再计算：`有效有声段数量 / 总有声时长(秒)`。

    该值是稳定、低成本的节奏指标，适用于长面试趋势观察；
    不等价于精确音节计数，但比能量峰值法在噪声场景下更稳。
    """

    if framed.voiced_mask.size == 0:
        return 0.0

    hop_sec = framed.hop_length / float(sample_rate)
    voiced_duration = float(framed.voiced_mask.sum()) * hop_sec
    if voiced_duration <= 0.1:
        return 0.0

    min_frames = max(1, int(round(MIN_SPEECH_RUN_SEC / hop_sec)))
    speech_run_count = _count_true_runs(framed.voiced_mask, min_frames=min_frames, numpy=numpy)

    return float(speech_run_count) / voiced_duration if voiced_duration > 0 else 0.0


def _count_true_runs(mask: "np.ndarray", *, min_frames: int, numpy) -> int:
    if mask.size == 0:
        return 0
    padded = numpy.concatenate(
        [numpy.asarray([False], dtype=bool), mask.astype(bool, copy=False), numpy.asarray([False], dtype=bool)]
    )
    edges = numpy.diff(padded.astype(numpy.int8))
    starts = numpy.flatnonzero(edges == 1)
    ends = numpy.flatnonzero(edges == -1)
    if starts.size == 0:
        return 0
    run_lengths = ends - starts
    return int((run_lengths >= int(min_frames)).sum())


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

    if librosa is not None:
        librosa_stats = _f0_statistics_with_librosa_chunked(samples, sample_rate, framed, numpy, librosa)
        if librosa_stats is not None:
            return librosa_stats, "librosa"

    # scipy 增强路径：Hann 窗自相关 + 抛物线插值 + 倍频校正。精度介于 librosa 与纯
    # 自相关之间，且在 Intel Mac + Python 3.12 这种没有 numba wheel 的环境下可用。
    try:
        import scipy  # type: ignore  # noqa: F401
    except Exception:
        scipy = None
    if scipy is not None:
        scipy_stats = _f0_statistics_with_scipy(framed, sample_rate, numpy)
        if scipy_stats is not None:
            return scipy_stats, "scipy"

    fallback_stats = _f0_statistics_with_autocorr_chunked(framed, sample_rate, numpy)
    return fallback_stats, backend


def _f0_statistics_with_scipy(framed: _FramedSignal, sample_rate: int, numpy) -> dict[str, float | None] | None:
    """基于加窗自相关 + 抛物线峰值插值的 F0 估计。

    相比纯 numpy 自相关：
    - 使用 Hann 窗抑制边缘泄漏，自相关峰更稳定。
    - 对峰值附近三个采样点做抛物线拟合，得到亚采样精度 lag。
    - 对 1/2 倍频处的假峰做简单回溯校验，减少「八度误判」。
    """
    try:
        from scipy.signal import get_window  # type: ignore
    except Exception:
        return None

    frame_indices = numpy.flatnonzero(framed.voiced_mask)
    if frame_indices.size == 0:
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_std_semitones": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": 0.0,
        }

    if frame_indices.size > MAX_AUTOCORR_FRAMES:
        choose = numpy.linspace(0, frame_indices.size - 1, num=MAX_AUTOCORR_FRAMES, dtype=numpy.int64)
        frame_indices = frame_indices[choose]

    min_lag = max(2, int(sample_rate / F0_MAX_HZ))
    max_lag = min(framed.frame_length - 2, int(sample_rate / F0_MIN_HZ))
    if max_lag <= min_lag:
        voiced_ratio = float(framed.voiced_mask.sum()) / float(framed.voiced_mask.size)
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_std_semitones": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": voiced_ratio,
        }

    window = get_window("hann", framed.frame_length, fftbins=False).astype(numpy.float32)
    values: list[float] = []

    for frame_index in frame_indices:
        start = int(framed.frame_starts[int(frame_index)])
        frame = framed.samples[start : start + framed.frame_length]
        if frame.size < framed.frame_length:
            continue
        windowed = (frame - frame.mean()) * window
        energy = float(numpy.dot(windowed, windowed))
        if energy <= 0:
            continue

        autocorr = numpy.correlate(windowed, windowed, mode="full")[len(windowed) - 1 :]
        if autocorr.size <= max_lag + 1:
            continue

        segment = autocorr[min_lag : max_lag + 1]
        peak_index = int(numpy.argmax(segment))
        peak_value = float(segment[peak_index])
        if peak_value <= 0.3 * energy:
            continue

        lag = peak_index + min_lag
        # 抛物线插值：用峰值及左右邻点拟合二次函数取极值
        if 0 < peak_index < segment.size - 1:
            y0 = float(segment[peak_index - 1])
            y1 = peak_value
            y2 = float(segment[peak_index + 1])
            denom = (y0 - 2.0 * y1 + y2)
            if denom != 0:
                shift = 0.5 * (y0 - y2) / denom
                if -1.0 < shift < 1.0:
                    lag = lag + shift

        # 倍频校正：如果半周期位置自相关也很强，说明真实周期是 lag/2
        half_lag = lag / 2.0
        half_index = int(round(half_lag)) - min_lag
        if 0 <= half_index < segment.size:
            half_value = float(segment[half_index])
            if half_value >= 0.85 * peak_value:
                lag = half_lag

        if lag <= 0:
            continue
        values.append(float(sample_rate) / float(lag))

    voiced_ratio = float(framed.voiced_mask.sum()) / float(framed.voiced_mask.size)
    if not values:
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_std_semitones": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": voiced_ratio,
        }

    values_np = numpy.asarray(values, dtype=numpy.float64)
    f0_mean = float(values_np.mean())
    x_values = 12.0 * numpy.log2(values_np)
    return {
        "f0_mean_hz": f0_mean,
        "f0_std_hz": float(values_np.std()),
        "f0_std_semitones": float(x_values.std()),
        "f0_min_hz": float(values_np.min()),
        "f0_max_hz": float(values_np.max()),
        "f0_range_hz": float(values_np.max() - values_np.min()),
        "voiced_ratio": voiced_ratio,
    }


def _f0_statistics_with_librosa_chunked(samples: "np.ndarray", sample_rate: int, framed: _FramedSignal, numpy, librosa):
    chunk_samples = max(int(sample_rate * F0_CHUNK_SEC), framed.frame_length * 4)
    moments = _RunningMoments()
    semitone_moments = _RunningMoments()
    total_frames = 0
    voiced_frames = 0

    frame_length = max(1024, framed.frame_length * 2)
    hop_length = framed.hop_length

    for start in range(0, samples.shape[0], chunk_samples):
        chunk = samples[start : start + chunk_samples]
        if chunk.size < framed.frame_length:
            continue
        try:
            f0, voiced, _ = librosa.pyin(
                chunk,
                fmin=F0_MIN_HZ,
                fmax=F0_MAX_HZ,
                sr=sample_rate,
                frame_length=frame_length,
                hop_length=hop_length,
            )
        except Exception:
            return None

        if f0 is None or len(f0) == 0:
            continue

        f0_arr = numpy.asarray(f0, dtype=numpy.float64)
        voiced_flag = numpy.asarray(voiced, dtype=bool) if voiced is not None else numpy.ones_like(f0_arr, dtype=bool)
        valid_mask = numpy.isfinite(f0_arr) & (f0_arr > 0) & voiced_flag

        total_frames += int(f0_arr.size)
        voiced_frames += int(valid_mask.sum())
        if valid_mask.any():
            valid_f0 = f0_arr[valid_mask]
            moments = moments.update(valid_f0)
            semitone_moments = semitone_moments.update(12.0 * numpy.log2(valid_f0))

    voiced_ratio = float(voiced_frames) / float(total_frames) if total_frames > 0 else None
    stats = moments.to_stats()
    st_stats = semitone_moments.to_stats()
    return {
        "f0_mean_hz": stats["mean"],
        "f0_std_hz": stats["std"],
        "f0_std_semitones": st_stats["std"],
        "f0_min_hz": stats["min"],
        "f0_max_hz": stats["max"],
        "f0_range_hz": stats["range"],
        "voiced_ratio": voiced_ratio,
    }


def _f0_statistics_with_autocorr_chunked(framed: _FramedSignal, sample_rate: int, numpy) -> dict[str, float | None]:
    frame_indices = numpy.flatnonzero(framed.voiced_mask)
    if frame_indices.size == 0:
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_std_semitones": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": 0.0,
        }

    # 超长音频抽样部分有声帧估计 F0，保证时延可控
    if frame_indices.size > MAX_AUTOCORR_FRAMES:
        choose = numpy.linspace(0, frame_indices.size - 1, num=MAX_AUTOCORR_FRAMES, dtype=numpy.int64)
        frame_indices = frame_indices[choose]

    values: list[float] = []
    min_lag = max(1, int(sample_rate / F0_MAX_HZ))
    max_lag = min(framed.frame_length - 1, int(sample_rate / F0_MIN_HZ))
    if max_lag <= min_lag:
        voiced_ratio = float(framed.voiced_mask.sum()) / float(framed.voiced_mask.size)
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_std_semitones": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": voiced_ratio,
        }

    for frame_index in frame_indices:
        start = int(framed.frame_starts[int(frame_index)])
        frame = framed.samples[start : start + framed.frame_length]
        windowed = frame - frame.mean()
        energy = float(numpy.dot(windowed, windowed))
        if energy <= 0:
            continue
        autocorr = numpy.correlate(windowed, windowed, mode="full")[len(windowed) - 1 :]
        if autocorr.size <= max_lag:
            continue
        segment = autocorr[min_lag : max_lag + 1]
        lag = int(numpy.argmax(segment)) + min_lag
        peak = float(segment[lag - min_lag])
        if peak <= 0.3 * energy:
            continue
        values.append(float(sample_rate / lag))

    voiced_ratio = float(framed.voiced_mask.sum()) / float(framed.voiced_mask.size)
    if not values:
        return {
            "f0_mean_hz": None,
            "f0_std_hz": None,
            "f0_std_semitones": None,
            "f0_min_hz": None,
            "f0_max_hz": None,
            "f0_range_hz": None,
            "voiced_ratio": voiced_ratio,
        }

    values_np = numpy.asarray(values, dtype=numpy.float64)
    x_values = 12.0 * numpy.log2(values_np)
    return {
        "f0_mean_hz": float(values_np.mean()),
        "f0_std_hz": float(values_np.std()),
        "f0_std_semitones": float(x_values.std()),
        "f0_min_hz": float(values_np.min()),
        "f0_max_hz": float(values_np.max()),
        "f0_range_hz": float(values_np.max() - values_np.min()),
        "voiced_ratio": voiced_ratio,
    }
# ----------------------------------------------------------------
# jitter / shimmer / HNR (requires parselmouth)
# ----------------------------------------------------------------


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
        f0_std_semitones=None,
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
