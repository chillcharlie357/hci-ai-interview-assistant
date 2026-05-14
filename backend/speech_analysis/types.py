from __future__ import annotations

from dataclasses import dataclass, field


class SpeechAnalysisError(Exception):
    """音频解码或特征计算过程中的可恢复错误。"""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class AcousticFeatures:
    """声学特征的结构化结果。

    所有浮点字段在无法计算时为 None，调用方应据此判断是否可信。
    """

    duration_sec: float
    sample_rate: int

    # 节奏 / 停顿
    speech_ratio: float              # 语音帧占比 ∈ [0, 1]
    pause_count: int                 # 静音段数量（首尾静音不计入）
    pause_total_sec: float
    longest_pause_sec: float
    speech_rate_sps: float           # 估算的音节/秒（基于能量峰值）

    # 音量 / 能量
    rms_mean: float
    rms_std: float
    rms_db_mean: float
    dynamic_range_db: float

    # 音高（F0，基频）
    f0_mean_hz: float | None
    f0_std_hz: float | None
    f0_std_semitones: float | None   # 半音标准差，消除绝对基频影响
    f0_min_hz: float | None
    f0_max_hz: float | None
    f0_range_hz: float | None
    voiced_ratio: float | None       # 有声帧占比

    # 音质（可选，依赖 parselmouth/Praat）
    jitter: float | None
    shimmer: float | None
    hnr_db: float | None


@dataclass(frozen=True)
class SpeechAnalysis:
    """对外暴露的完整分析结果。"""

    status: str                      # "ok" | "partial" | "fallback"
    backend: str                     # 实际使用的特征后端，如 "librosa" / "numpy-fallback"
    acoustic: AcousticFeatures | None
    observations: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        from dataclasses import asdict

        return {
            "status": self.status,
            "backend": self.backend,
            "acoustic": asdict(self.acoustic) if self.acoustic else None,
            "observations": list(self.observations),
            "warnings": list(self.warnings),
        }
