from __future__ import annotations

from dataclasses import dataclass
import json

from backend.interview.config import DEFAULT_FILLER_WORDS, get_csv_env
from backend.interview.llm_client import LlmClient


@dataclass(frozen=True)
class AnswerTextAnalysis:
    filler_word_count: int
    llm_status: str
    observations: list[str]


def analyze_answer_text(text: str, llm_client: LlmClient | None = None) -> AnswerTextAnalysis:
    client = llm_client or LlmClient.from_env()
    llm_result = client.complete_json(
        "你是面试回答文本分析器。请只输出 JSON，字段 filler_word_count 和 observations。filler_word_count 表示回答中的口头填充、犹豫、重复或无意义停顿词数量；observations 是可复核文本观察数组。禁止输出录用、不录用、人格、情绪或能力结论。",
        json.dumps({"answer_text": text}, ensure_ascii=False),
    )
    if llm_result.status == "ok" and llm_result.data:
        count = _parse_non_negative_int(llm_result.data.get("filler_word_count"))
        if count is not None:
            return AnswerTextAnalysis(
                filler_word_count=count,
                llm_status="ok",
                observations=_parse_observations(llm_result.data.get("observations")),
            )

    return AnswerTextAnalysis(
        filler_word_count=_count_configured_filler_words(text),
        llm_status="fallback",
        observations=[],
    )


def _count_configured_filler_words(text: str) -> int:
    filler_words = get_csv_env("INTERVIEW_FILLER_WORDS", DEFAULT_FILLER_WORDS)
    return sum(text.count(word) for word in filler_words)


def _parse_non_negative_int(value: object) -> int | None:
    try:
        count = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return max(0, count)


def _parse_observations(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]
