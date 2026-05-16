"""LLM-driven 追问决策器。

调用方：``backend.interview.api.SessionStore.record_answer``。

设计原则：
- 仅在 LLM 可用时尝试追问；LLM 不可用 / 解析失败 / 输出含义不明时一律返回 ``finished=True``，
  保证主流程不会因追问能力降级而卡住。
- 追问最多 ``max_rounds`` 次，硬上限由调用方传入（默认 2）。
- 仅根据当前题的对话窗口（主问题 + 历次回答 + 已发追问）判断；不读其它题。
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging

from backend.interview.config import get_env
from backend.interview.llm_client import LlmClient
from backend.interview.session import FollowupState

log = logging.getLogger("backend.followup")


_SYSTEM_PROMPT = (
    "你是面试官的追问助手。你将基于本题的问题和候选人到目前为止的回答，"
    "判断是否需要再追问一次以澄清能力证据。\n"
    "判定原则：\n"
    "1. 如果候选人回答足够具体（包含背景、行动、结果或可量化指标），不要追问。\n"
    "2. 如果回答含糊、跳过细节、无法验证，或回避关键点，给出一个简短追问。\n"
    "3. 不要重复已经问过的内容。\n"
    "4. 追问不要给出答案、不要评价好坏、不要超过 30 个汉字。\n"
    "仅输出严格 JSON：\n"
    '{ "need_followup": true|false, '
    '"followup_question": "若 need_followup=true 给出追问；否则空字符串", '
    '"reason": "一句话内部说明，不展示给候选人" }'
)


@dataclass(frozen=True)
class FollowupDecision:
    """追问决策结果。

    ``finished=True`` 表示这一题不再追问，主流程应推进 ``current_index``。
    """
    finished: bool
    followup_question: str = ""
    reason: str = ""
    llm_status: str = "fallback"


def get_followup_max_rounds() -> int:
    raw = get_env("INTERVIEW_FOLLOWUP_MAX_ROUNDS", "2")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return 2
    return max(0, value)


def is_followup_enabled() -> bool:
    return get_env("INTERVIEW_FOLLOWUP_ENABLED", "true").strip().lower() not in ("0", "false", "no")


def decide_followup(
    *,
    question_prompt: str,
    question_dimension: str,
    prev_state: FollowupState | None,
    latest_answer: str,
    llm_client: LlmClient | None = None,
    max_rounds: int | None = None,
) -> FollowupDecision:
    """根据当前题历史 + 最新回答，决定是否继续追问。"""
    if not is_followup_enabled():
        return FollowupDecision(finished=True, reason="followup_disabled")

    upper = max_rounds if max_rounds is not None else get_followup_max_rounds()
    asked_so_far = prev_state.asked_count if prev_state else 0
    if asked_so_far >= upper:
        return FollowupDecision(finished=True, reason="max_rounds_reached")

    cleaned = (latest_answer or "").strip()
    if len(cleaned) < 2:
        # 空答案不追问，避免在静音/未识别场景反复打扰候选人
        return FollowupDecision(finished=True, reason="empty_answer")

    client = llm_client or LlmClient.from_env()
    if not client.config.configured:
        return FollowupDecision(finished=True, reason="llm_not_configured", llm_status="fallback")

    user_payload = {
        "dimension": question_dimension,
        "question": question_prompt,
        "asked_followups_so_far": asked_so_far,
        "max_followups_allowed_total": upper,
        "conversation": _serialize_turns(prev_state, latest_answer),
    }
    result = client.complete_json(_SYSTEM_PROMPT, json.dumps(user_payload, ensure_ascii=False))
    if result.status != "ok" or not result.data:
        log.info("decide_followup: llm fallback (status=%s)", result.status)
        return FollowupDecision(finished=True, reason="llm_fallback", llm_status=result.status)

    need = bool(result.data.get("need_followup"))
    followup_q = str(result.data.get("followup_question", "")).strip()
    reason = str(result.data.get("reason", "")).strip()
    if not need or not followup_q:
        return FollowupDecision(finished=True, reason=reason or "llm_no_need", llm_status="ok")

    # 限制追问长度：避免 LLM 偶尔吐出过长内容
    if len(followup_q) > 60:
        followup_q = followup_q[:60].rstrip("，。；,;.") + "…"

    return FollowupDecision(
        finished=False,
        followup_question=followup_q,
        reason=reason or "llm_decided",
        llm_status="ok",
    )


def _serialize_turns(prev_state: FollowupState | None, latest_answer: str) -> list[dict[str, str]]:
    turns: list[dict[str, str]] = []
    if prev_state:
        for turn in prev_state.turns:
            turns.append({"role": turn.role, "text": turn.text})
    turns.append({"role": "candidate", "text": latest_answer.strip()})
    return turns
