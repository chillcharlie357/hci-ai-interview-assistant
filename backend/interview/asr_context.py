from __future__ import annotations

import re
from typing import Any, Iterable

from backend.interview.question_engine import InterviewQuestion


_KNOWN_TECH_TERMS = [
    "RAG",
    "LLM",
    "Agent",
    "Prompt",
    "OpenAI",
    "Qwen",
    "Qwen-ASR",
    "ASR",
    "TTS",
    "LiveKit",
    "WebRTC",
    "Supabase",
    "TypeScript",
    "JavaScript",
    "React",
    "Vite",
    "Python",
    "FastAPI",
    "Docker",
    "Podman",
    "Render",
    "GHCR",
    "PostgreSQL",
    "Redis",
    "MySQL",
    "向量数据库",
    "检索增强生成",
    "大模型",
    "实时语音识别",
    "语音识别",
    "数字人",
    "面试官",
    "微服务",
    "分布式",
    "工程化",
    "知识库",
    "重排序",
    "嵌入模型",
]

_ASR_CONTEXT_SYSTEM_PROMPT = """你是语音识别热词提取器。请从候选人简历、岗位描述、面试目标和问题中提取最多 40 个有助于 ASR 识别的技术名词、产品名、英文缩写、框架名、领域词。

只输出 JSON：
{"terms": ["RAG", "TypeScript", "向量数据库"]}

要求：
- 保留原始大小写和常见写法。
- 不要输出普通虚词、长句子或敏感个人信息。
- 中文热词尽量不超过 15 个字符。
- 英文短语不超过 7 个空格分隔片段。"""


def extract_asr_context_terms(
    *,
    resume_markdown: str = "",
    job_description: str = "",
    interview_goal: str = "",
    role: str = "",
    questions: Iterable[InterviewQuestion] = (),
    llm_client: Any | None = None,
    max_terms: int = 80,
) -> list[str]:
    source = "\n".join(
        part
        for part in [
            role,
            resume_markdown,
            job_description,
            interview_goal,
            "\n".join(_question_text(question) for question in questions),
        ]
        if part
    )
    terms: list[str] = []
    terms.extend(_extract_with_llm(source, llm_client))
    terms.extend(_extract_known_terms(source))
    terms.extend(_extract_ascii_terms(source))
    terms.extend(_extract_cjk_terms(source))
    return _dedupe_and_filter_terms(terms, max_terms=max_terms)


def format_corpus_text(terms: Iterable[str], *, max_chars: int = 1200) -> str:
    lines: list[str] = []
    used_chars = 0
    for term in _dedupe_and_filter_terms(terms, max_terms=80):
        projected = used_chars + len(term) + (1 if lines else 0)
        if projected > max_chars:
            break
        lines.append(term)
        used_chars = projected
    return "\n".join(lines)


def _extract_with_llm(source: str, llm_client: Any | None) -> list[str]:
    if not source or llm_client is None:
        return []
    config = getattr(llm_client, "config", None)
    if config is not None and not getattr(config, "configured", False):
        return []
    try:
        result = llm_client.complete_json(_ASR_CONTEXT_SYSTEM_PROMPT, source[:5000])
    except Exception:
        return []
    if getattr(result, "status", "") != "ok" or not getattr(result, "data", None):
        return []
    raw_terms = result.data.get("terms") if isinstance(result.data, dict) else None
    if not isinstance(raw_terms, list):
        return []
    return [str(term) for term in raw_terms]


def _extract_known_terms(source: str) -> list[str]:
    lowered = source.lower()
    return [term for term in _KNOWN_TECH_TERMS if term.lower() in lowered]


def _extract_ascii_terms(source: str) -> list[str]:
    terms: list[str] = []
    for match in re.finditer(r"\b[A-Za-z][A-Za-z0-9+#./_-]{1,}\b", source):
        token = match.group(0).strip("._-")
        if len(token) >= 2 and not token.isdigit():
            terms.append(token)
    return terms


def _extract_cjk_terms(source: str) -> list[str]:
    patterns = [
        r"[\u4e00-\u9fffA-Za-z0-9-]{2,15}(?:数据库|模型|系统|平台|框架|服务|中台|模块|算法|工程|应用|部署|识别|检索|生成)",
        r"(?:向量数据库|检索增强生成|大模型|数字人|语音识别|实时语音识别|知识库|重排序|嵌入模型)",
    ]
    terms: list[str] = []
    for pattern in patterns:
        terms.extend(match.group(0) for match in re.finditer(pattern, source))
    return terms


def _question_text(question: InterviewQuestion) -> str:
    return "\n".join([question.dimension, question.prompt, *question.follow_ups, *question.evidence_hints])


def _dedupe_and_filter_terms(terms: Iterable[str], *, max_terms: int) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in terms:
        term = _normalize_term(raw)
        if not term or not _is_valid_hotword(term):
            continue
        key = term.lower() if term.isascii() else term
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(term)
        if len(cleaned) >= max_terms:
            break
    return cleaned


def _normalize_term(term: str) -> str:
    return re.sub(r"\s+", " ", term.strip().strip("，。！？、；：,.!?;:()（）[]【】")).strip()


def _is_valid_hotword(term: str) -> bool:
    if not term:
        return False
    if any(char.isspace() for char in term) and len(term.split()) > 7:
        return False
    if not term.isascii() and len(term) > 15:
        return False
    if len(term) > 48:
        return False
    if term.lower() in {"the", "and", "with", "for", "岗位", "候选人"}:
        return False
    return bool(re.search(r"[A-Za-z0-9\u4e00-\u9fff]", term))
