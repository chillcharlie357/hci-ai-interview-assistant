from __future__ import annotations

from dataclasses import dataclass, replace
import re
import time


DEFAULT_FOLLOWUP_QUESTIONS: list[str] = []  # 不再需要默认追问


@dataclass(frozen=True)
class ReadySummary:
    role: str
    job_description: str
    interview_goal: str
    focus_areas: list[str]


@dataclass(frozen=True)
class FollowupTurn:
    answer: str


@dataclass(frozen=True)
class PrepSession:
    id: str
    candidate_name: str
    resume_markdown: str
    followup_questions: list[str]
    turns: list[FollowupTurn]
    ready: bool
    ready_summary: ReadySummary | None
    llm_status: str
    user_id: str = ""  # 所属用户 ID


def create_prep_session(candidate_name: str, resume_markdown: str, user_id: str = "") -> PrepSession:
    return PrepSession(
        id=f"prep_{int(time.time() * 1000)}",
        candidate_name=candidate_name or "候选人",
        resume_markdown=resume_markdown,
        followup_questions=DEFAULT_FOLLOWUP_QUESTIONS,
        turns=[],
        ready=False,
        ready_summary=None,
        llm_status="fallback",
        user_id=user_id,
    )


def advance_followup(session: PrepSession, answer: str) -> PrepSession:
    """提交岗位信息，直接标记为 ready"""
    turns = [*session.turns, FollowupTurn(answer=answer.strip())]

    # 直接从回答中提取岗位信息，标记为 ready
    summary = _fallback_ready_summary(answer)
    return replace(
        session,
        turns=turns,
        followup_questions=[],
        ready=True,
        ready_summary=summary,
        llm_status="fallback",
    )


def serialize_prep_session(session: PrepSession) -> dict[str, object]:
    return {
        "prep_session_id": session.id,
        "candidate_name": session.candidate_name,
        "resume_markdown_preview": session.resume_markdown[:1200],
        "followup_questions": session.followup_questions,
        "ready": session.ready,
        "ready_summary": _summary_to_dict(session.ready_summary) if session.ready_summary else None,
        "llm_status": session.llm_status,
    }


def _fallback_ready_summary(answer: str) -> ReadySummary:
    """从回答中提取岗位信息"""
    # 尝试解析格式化的岗位信息
    role = _extract_field(answer, "岗位") or _extract_role(answer) or "候选人"
    job_description = _extract_field(answer, "岗位描述") or answer.strip() or "招聘方未补充职位要求。"
    interview_goal = _extract_field(answer, "面试目标") or "评估候选人与岗位相关的项目经验、技术实现能力和表达能力。"

    return ReadySummary(
        role=role,
        job_description=job_description,
        interview_goal=interview_goal,
        focus_areas=_extract_focus_areas(answer),
    )


def _extract_field(text: str, field_name: str) -> str:
    """从格式化文本中提取字段值，例如 '岗位：前端工程师'"""
    pattern = rf"{field_name}[：:]\s*([^\n]+)"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return ""


def _extract_role(text: str) -> str:
    patterns = [
        r"岗位是\s*([^，。,.；;\n]+)",
        r"职位是\s*([^，。,.；;\n]+)",
        r"招聘\s*([^，。,.；;\n]+(?:岗位|职位|工程师|开发|专家|架构师|经理))",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    return ""


def _extract_focus_areas(text: str) -> list[str]:
    areas = [item for item in ["Python", "TypeScript", "LLM", "项目深度", "工程落地", "沟通表达"] if item.lower() in text.lower()]
    return areas or ["项目经验", "技术实现能力", "表达能力"]


def _summary_to_dict(summary: ReadySummary) -> dict[str, object]:
    return {
        "role": summary.role,
        "job_description": summary.job_description,
        "interview_goal": summary.interview_goal,
        "focus_areas": summary.focus_areas,
    }
