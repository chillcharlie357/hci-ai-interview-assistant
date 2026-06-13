from __future__ import annotations

from dataclasses import dataclass
import json
import re

from backend.interview.config import DEFAULT_FILLER_WORDS, get_csv_env
from backend.interview.llm_client import LlmClient


@dataclass(frozen=True)
class AnswerTextAnalysis:
    filler_word_count: int
    llm_status: str
    observations: list[str]
    cleaned_text: str


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
                cleaned_text=clean_filler_words(text),
            )

    return AnswerTextAnalysis(
        filler_word_count=_count_configured_filler_words(text),
        llm_status="fallback",
        observations=[],
        cleaned_text=clean_filler_words(text),
    )


def _count_configured_filler_words(text: str) -> int:
    return sum(_count_filler_word(text, word) for word in _configured_filler_words())


def clean_filler_words(text: str) -> str:
    cleaned = text.strip()
    for word in sorted(_configured_filler_words(), key=len, reverse=True):
        cleaned = _remove_filler_word(cleaned, word)
    return _normalize_cleaned_text(cleaned)


def _configured_filler_words() -> list[str]:
    words = [*DEFAULT_FILLER_WORDS, *get_csv_env("INTERVIEW_FILLER_WORDS", [])]
    result: list[str] = []
    seen: set[str] = set()
    for word in words:
        normalized = word.strip()
        key = normalized.lower()
        if normalized and key not in seen:
            seen.add(key)
            result.append(normalized)
    return result


def _count_filler_word(text: str, word: str) -> int:
    if word.isascii():
        pattern = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(word)}(?![A-Za-z0-9_])", re.IGNORECASE)
        return len(pattern.findall(text))
    return text.count(word)


def _remove_filler_word(text: str, word: str) -> str:
    escaped = re.escape(word)
    if word.isascii():
        pattern = re.compile(
            rf"(^|[\s，,。.!?！？；;、]){escaped}(?=$|[\s，,。.!?！？；;、])",
            re.IGNORECASE,
        )
        return pattern.sub(lambda match: match.group(1), text)

    leading = re.compile(rf"^(?:[\s，,。.!?！？；;、]*{escaped})+[\s，,。.!?！？；;、]*")
    text = leading.sub("", text)
    isolated = re.compile(rf"(^|[\s，,。.!?！？；;、]){escaped}(?=$|[\s，,。.!?！？；;、])")
    return isolated.sub(lambda match: match.group(1), text)


def _normalize_cleaned_text(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*([，。！？；：、])\s*", r"\1", text)
    text = re.sub(r"\s*([,.!?;:])\s*", r"\1 ", text)
    text = re.sub(r"([，,；;、])(?:[，,；;、])+", r"\1", text)
    text = re.sub(r"([，。！？；：、])\s+", r"\1", text)
    text = re.sub(r"^[\s，,。.!?！？；;、]+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


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
