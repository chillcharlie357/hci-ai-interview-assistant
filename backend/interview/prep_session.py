from __future__ import annotations

from dataclasses import dataclass, replace
import json
import re
import time

from backend.interview.llm_client import LlmClient


DEFAULT_FOLLOWUP_QUESTIONS = [
    "请补充这次招聘的岗位名称和职级范围。",
    "请说明该岗位最核心的 3 项职责。",
    "请说明本轮面试最想验证的能力或项目经历。",
]


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


def create_prep_session(candidate_name: str, resume_markdown: str) -> PrepSession:
    return PrepSession(
        id=f"prep_{int(time.time() * 1000)}",
        candidate_name=candidate_name or "候选人",
        resume_markdown=resume_markdown,
        followup_questions=DEFAULT_FOLLOWUP_QUESTIONS,
        turns=[],
        ready=False,
        ready_summary=None,
        llm_status="fallback",
    )


def advance_followup(session: PrepSession, answer: str) -> PrepSession:
    turns = [*session.turns, FollowupTurn(answer=answer.strip())]
    llm_result = LlmClient.from_env().complete_json(
        "你是招聘需求澄清助手。请只输出 JSON：ready(boolean), questions(string[]), role, job_description, interview_goal, focus_areas(string[])。如果职位要求和考察重点足够生成面试题，ready=true 且 questions=[]；否则 ready=false 并继续提出 1-3 个具体追问。",
        json.dumps(
            {
                "resume_markdown": session.resume_markdown,
                "recruiter_answers": [turn.answer for turn in turns],
            },
            ensure_ascii=False,
        ),
    )
    if llm_result.status == "ok" and llm_result.data:
        parsed = _parse_llm_followup(llm_result.data)
        return replace(
            session,
            turns=turns,
            followup_questions=parsed["questions"],
            ready=bool(parsed["ready"]),
            ready_summary=parsed["ready_summary"],
            llm_status="ok",
        )

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


def _parse_llm_followup(data: dict[str, object]) -> dict[str, object]:
    ready = bool(data.get("ready"))
    questions = [str(item).strip() for item in data.get("questions", []) if str(item).strip()] if isinstance(data.get("questions"), list) else []
    summary = ReadySummary(
        role=str(data.get("role") or "候选人").strip() or "候选人",
        job_description=str(data.get("job_description") or "").strip(),
        interview_goal=str(data.get("interview_goal") or "").strip(),
        focus_areas=[str(item).strip() for item in data.get("focus_areas", []) if str(item).strip()] if isinstance(data.get("focus_areas"), list) else [],
    )
    return {
        "ready": ready,
        "questions": [] if ready else questions or DEFAULT_FOLLOWUP_QUESTIONS[:1],
        "ready_summary": summary if ready else None,
    }


def _fallback_ready_summary(answer: str) -> ReadySummary:
    role = _extract_role(answer) or "候选人"
    return ReadySummary(
        role=role,
        job_description=answer.strip() or "招聘方未补充职位要求。",
        interview_goal=answer.strip() or "评估候选人与岗位相关的项目经验、技术实现能力和表达能力。",
        focus_areas=_extract_focus_areas(answer),
    )


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
