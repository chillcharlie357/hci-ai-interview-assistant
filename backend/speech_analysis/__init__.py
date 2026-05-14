"""Speech analysis subpackage.

声学特征分析模块，已接入面试主流程：
- 前端通过 POST /api/sessions/<id>/speech-chunks 上传音频分片
- 后端调用 analyze_speech() 分析，增量合并至 SpeechAggregateState
- 报告生成时通过 SpeechCumulativeMetrics 输出语音观察章节

设计原则：
- 全部函数为纯函数，输入明确、输出使用 frozen dataclass。
- 所有重依赖（numpy / librosa / parselmouth / ffmpeg）都走可选导入，
  缺失时返回 fallback 结果而不是崩溃。
- 不将音频写入磁盘（除了解码过程中必要的临时文件，用完即删）。
- 输出只作为可人工复核的 observation signals，避免能力/人格结论。
"""

from backend.speech_analysis.analyzer import analyze_speech
from backend.speech_analysis.types import (
    AcousticFeatures,
    SpeechAnalysis,
    SpeechAnalysisError,
)

__all__ = [
    "analyze_speech",
    "AcousticFeatures",
    "SpeechAnalysis",
    "SpeechAnalysisError",
]
