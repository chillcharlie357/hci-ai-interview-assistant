from __future__ import annotations

from dataclasses import asdict, dataclass

from backend.speech_analysis.types import SpeechAnalysis


@dataclass(frozen=True)
class SpeechChunkMetrics:
    status: str
    backend: str
    duration_sec: float
    voiced_duration_sec: float
    speech_rate_sps: float
    rms_db_mean: float | None
    f0_mean_hz: float | None
    f0_std_hz: float | None
    f0_std_semitones: float | None
    f0_min_hz: float | None
    f0_max_hz: float | None
    warnings: list[str]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class SpeechAggregateState:
    chunk_count: int = 0
    analyzed_duration_sec: float = 0.0
    voiced_duration_sec: float = 0.0
    speech_run_equivalent: float = 0.0
    rms_weighted_db_sum: float = 0.0
    rms_weight_count: float = 0.0
    pitch_weight_sum: float = 0.0
    pitch_weighted_mean_sum: float = 0.0
    pitch_weighted_second_moment_sum: float = 0.0
    semitone_weight_sum: float = 0.0
    semitone_weighted_mean_sum: float = 0.0
    semitone_weighted_second_moment_sum: float = 0.0
    f0_min_hz: float | None = None
    f0_max_hz: float | None = None


@dataclass(frozen=True)
class SpeechCumulativeMetrics:
    chunk_count: int
    analyzed_duration_sec: float
    voiced_duration_sec: float
    speech_rate_sps: float
    rms_db_mean: float | None
    f0_mean_hz: float | None
    f0_std_hz: float | None
    f0_std_semitones: float | None
    f0_min_hz: float | None
    f0_max_hz: float | None
    f0_range_hz: float | None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def chunk_metrics_from_analysis(analysis: SpeechAnalysis) -> SpeechChunkMetrics:
    acoustic = analysis.acoustic
    if acoustic is None:
        return SpeechChunkMetrics(
            status=analysis.status,
            backend=analysis.backend,
            duration_sec=0.0,
            voiced_duration_sec=0.0,
            speech_rate_sps=0.0,
            rms_db_mean=None,
            f0_mean_hz=None,
            f0_std_hz=None,
            f0_std_semitones=None,
            f0_min_hz=None,
            f0_max_hz=None,
            warnings=list(analysis.warnings),
        )

    voiced_ratio = acoustic.voiced_ratio if acoustic.voiced_ratio is not None else acoustic.speech_ratio
    voiced_duration_sec = max(0.0, float(acoustic.duration_sec) * float(voiced_ratio))
    return SpeechChunkMetrics(
        status=analysis.status,
        backend=analysis.backend,
        duration_sec=float(acoustic.duration_sec),
        voiced_duration_sec=voiced_duration_sec,
        speech_rate_sps=float(acoustic.speech_rate_sps),
        rms_db_mean=float(acoustic.rms_db_mean) if acoustic.rms_db_mean is not None else None,
        f0_mean_hz=acoustic.f0_mean_hz,
        f0_std_hz=acoustic.f0_std_hz,
        f0_std_semitones=acoustic.f0_std_semitones,
        f0_min_hz=acoustic.f0_min_hz,
        f0_max_hz=acoustic.f0_max_hz,
        warnings=list(analysis.warnings),
    )


def merge_chunk_metrics(state: SpeechAggregateState, chunk: SpeechChunkMetrics) -> SpeechAggregateState:
    if chunk.duration_sec <= 0:
        return state

    next_chunk_count = state.chunk_count + 1
    next_duration = state.analyzed_duration_sec + chunk.duration_sec
    next_voiced = state.voiced_duration_sec + max(0.0, chunk.voiced_duration_sec)
    next_speech_run = state.speech_run_equivalent + max(0.0, chunk.speech_rate_sps) * max(0.0, chunk.voiced_duration_sec)

    # dB 加权平均：按 voiced_duration 加权后取算术平均。
    # 数学上 dB 值应先转线性幅度再平均，但作为观察性指标近似计算足够。
    next_rms_weighted_db_sum = state.rms_weighted_db_sum
    next_rms_weight_count = state.rms_weight_count
    if chunk.rms_db_mean is not None and chunk.voiced_duration_sec > 0:
        next_rms_weighted_db_sum += chunk.rms_db_mean * chunk.voiced_duration_sec
        next_rms_weight_count += chunk.voiced_duration_sec

    next_weight_sum = state.pitch_weight_sum
    next_weighted_mean_sum = state.pitch_weighted_mean_sum
    next_weighted_second_sum = state.pitch_weighted_second_moment_sum

    # semitone 空间的加权二阶矩合并
    next_st_weight_sum = state.semitone_weight_sum
    next_st_weighted_mean_sum = state.semitone_weighted_mean_sum
    next_st_weighted_second_sum = state.semitone_weighted_second_moment_sum

    next_f0_min = state.f0_min_hz
    next_f0_max = state.f0_max_hz

    # 用 voiced_duration 作为权重，把 chunk 的均值/方差合并为全局方差
    weight = max(0.0, chunk.voiced_duration_sec)
    if weight > 0 and chunk.f0_mean_hz is not None and chunk.f0_std_hz is not None:
        variance = max(0.0, chunk.f0_std_hz * chunk.f0_std_hz)
        next_weight_sum += weight
        next_weighted_mean_sum += weight * chunk.f0_mean_hz
        next_weighted_second_sum += weight * (variance + chunk.f0_mean_hz * chunk.f0_mean_hz)

    # semitone 空间合并
    if weight > 0 and chunk.f0_std_semitones is not None:
        # chunk 的 semitone mean 由 f0_mean_hz 转换得到
        import math
        if chunk.f0_mean_hz is not None and chunk.f0_mean_hz > 0:
            st_mean = 12.0 * math.log2(chunk.f0_mean_hz)
            st_var = max(0.0, chunk.f0_std_semitones * chunk.f0_std_semitones)
            next_st_weight_sum += weight
            next_st_weighted_mean_sum += weight * st_mean
            next_st_weighted_second_sum += weight * (st_var + st_mean * st_mean)

    if chunk.f0_min_hz is not None:
        next_f0_min = chunk.f0_min_hz if next_f0_min is None else min(next_f0_min, chunk.f0_min_hz)
    if chunk.f0_max_hz is not None:
        next_f0_max = chunk.f0_max_hz if next_f0_max is None else max(next_f0_max, chunk.f0_max_hz)

    return SpeechAggregateState(
        chunk_count=next_chunk_count,
        analyzed_duration_sec=next_duration,
        voiced_duration_sec=next_voiced,
        speech_run_equivalent=next_speech_run,
        rms_weighted_db_sum=next_rms_weighted_db_sum,
        rms_weight_count=next_rms_weight_count,
        pitch_weight_sum=next_weight_sum,
        pitch_weighted_mean_sum=next_weighted_mean_sum,
        pitch_weighted_second_moment_sum=next_weighted_second_sum,
        semitone_weight_sum=next_st_weight_sum,
        semitone_weighted_mean_sum=next_st_weighted_mean_sum,
        semitone_weighted_second_moment_sum=next_st_weighted_second_sum,
        f0_min_hz=next_f0_min,
        f0_max_hz=next_f0_max,
    )


def summarize_cumulative_metrics(state: SpeechAggregateState) -> SpeechCumulativeMetrics:
    speech_rate = state.speech_run_equivalent / state.voiced_duration_sec if state.voiced_duration_sec > 0 else 0.0

    rms_db_mean: float | None = None
    if state.rms_weight_count > 0:
        # 按时长加权的算术平均，近似于能量加权平均；对观察性指标足够
        rms_db_mean = state.rms_weighted_db_sum / state.rms_weight_count

    f0_mean: float | None = None
    f0_std: float | None = None
    if state.pitch_weight_sum > 0:
        f0_mean = state.pitch_weighted_mean_sum / state.pitch_weight_sum
        second = state.pitch_weighted_second_moment_sum / state.pitch_weight_sum
        variance = max(0.0, second - f0_mean * f0_mean)
        f0_std = variance ** 0.5

    f0_range: float | None = None
    if state.f0_min_hz is not None and state.f0_max_hz is not None:
        f0_range = state.f0_max_hz - state.f0_min_hz

    f0_std_semitones: float | None = None
    if state.semitone_weight_sum > 0:
        st_mean = state.semitone_weighted_mean_sum / state.semitone_weight_sum
        st_second = state.semitone_weighted_second_moment_sum / state.semitone_weight_sum
        st_variance = max(0.0, st_second - st_mean * st_mean)
        f0_std_semitones = st_variance ** 0.5

    return SpeechCumulativeMetrics(
        chunk_count=state.chunk_count,
        analyzed_duration_sec=state.analyzed_duration_sec,
        voiced_duration_sec=state.voiced_duration_sec,
        speech_rate_sps=speech_rate,
        rms_db_mean=rms_db_mean,
        f0_mean_hz=f0_mean,
        f0_std_hz=f0_std,
        f0_std_semitones=f0_std_semitones,
        f0_min_hz=state.f0_min_hz,
        f0_max_hz=state.f0_max_hz,
        f0_range_hz=f0_range,
    )
