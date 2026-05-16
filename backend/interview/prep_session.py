from __future__ import annotations

from dataclasses import dataclass, replace
import logging
import re
import time
from typing import Any


log = logging.getLogger("backend.prep_session")

DEFAULT_FOLLOWUP_QUESTIONS: list[str] = []  # 不再需要默认追问


_EXTRACT_SYSTEM_PROMPT = """你是一个简历解析助手。请从简历 Markdown 中提取以下 JSON 字段：

{
  "candidateName": "候选人姓名（2-4 个汉字）",
  "matchingTemplate": "匹配的岗位模板 key: frontend|backend|fullstack|ai|pm, 不匹配则为 null",
  "detectedSkills": ["技能1", "技能2", ...],
  "jobTitle": "简历中提到的目标岗位或当前岗位, 如 '高级前端工程师', 未知则为 null"
}

模板说明：
- frontend: React/Vue/Angular/CSS/HTML/Web 前端相关
- backend: Python/Java/Go/分布式/微服务/后端相关
- fullstack: 前后端都有涉及（React + Python/Node 等）
- ai: LLM/RAG/Agent/大模型/Machine Learning 相关
- pm: 产品/需求/数据分析/项目协作相关

只返回 JSON，不要额外文字。如果无法提取，字段设为 null 或空数组。"""

_SECTION_HEADERS = {"项目经验", "工作经历", "教育背景", "专业技能", "自我介绍", "个人简介", "联系方式"}

_TEMPLATE_KEYWORDS: dict[str, set[str]] = {
    "frontend": {"react", "vue", "angular", "css", "html", "webpack", "前端", "h5", "web", "es6", "typescript", "javascript", "ui"},
    "backend": {"python", "java", "go", "分布式", "微服务", "mysql", "redis", "docker", "api", "后端", "server", "grpc", "rust"},
    "fullstack": {"react", "python", "node", "全栈", "前后端", "vue", "javascript", "typescript"},
    "ai": {"llm", "rag", "agent", "prompt", "大模型", "gpt", "openai", "machine learning", "深度学习", "transformer", "nlp", "tensorflow", "pytorch", "ai"},
    "pm": {"产品", "需求", "用户", "数据分析", "项目", "协作", "roadmap", "原型", "axure", "figma", "敏捷", "scrum"},
}


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
    prep = PrepSession(
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
    log.info("created prep session: id=%s, candidate=%s, resume_len=%d, user_id=%s",
             prep.id, candidate_name, len(resume_markdown), user_id)
    return prep


def advance_followup(session: PrepSession, answer: str) -> PrepSession:
    """提交岗位信息，直接标记为 ready"""
    turns = [*session.turns, FollowupTurn(answer=answer.strip())]

    # 直接从回答中提取岗位信息，标记为 ready
    summary = _fallback_ready_summary(answer)
    updated = replace(
        session,
        turns=turns,
        followup_questions=[],
        ready=True,
        ready_summary=summary,
        llm_status="fallback",
    )
    log.info("advance followup: prep_id=%s, role=%s, answer_len=%d, ready=%s",
             session.id, summary.role, len(answer), updated.ready)
    return updated


def extract_resume_info(
    resume_markdown: str,
    llm_client: Any | None = None,
) -> dict[str, object]:
    """LLM + JSON schema 提取简历结构化信息，降级为正则匹配。"""
    # 尝试 LLM 提取
    if llm_client is not None and getattr(llm_client, 'config', None) is not None and llm_client.config.configured:
        log.debug("attempting LLM resume info extraction (resume_len=%d)", len(resume_markdown))
        result = llm_client.complete_json(_EXTRACT_SYSTEM_PROMPT, resume_markdown[:4000])
        if result.status == "ok" and result.data:
            data = result.data
            info = {
                "extracted_candidate_name": data.get("candidateName") or "",
                "matching_template": data.get("matchingTemplate") or None,
                "detected_skills": data.get("detectedSkills") or [],
            }
            log.info("LLM resume extraction succeeded: name=%s, template=%s, skills=%d",
                     info["extracted_candidate_name"], info["matching_template"], len(info["detected_skills"]))
            return info
        log.info("LLM resume extraction failed (status=%s), falling back to regex", result.status)
    else:
        log.debug("LLM client not configured, using regex fallback for resume info extraction")

    # 降级：正则提取姓名 + 关键词匹配模板
    name = _extract_name_regex(resume_markdown)
    profile = _detect_template_keywords(resume_markdown)
    info = {
        "extracted_candidate_name": name,
        "matching_template": profile["matching_template"],
        "detected_skills": profile["detected_skills"],
    }
    log.info("regex resume extraction: name=%s, template=%s, skills=%d",
             info["extracted_candidate_name"], info["matching_template"], len(info["detected_skills"]))
    return info


def _extract_name_regex(resume_markdown: str) -> str:
    lines = resume_markdown.strip().split("\n")
    for line in lines:
        m = re.match(r'^#\s+(.+)$', line.strip())
        if m:
            name = m.group(1).strip()
            if name not in _SECTION_HEADERS and re.match(r'^[\u4e00-\u9fff]{2,4}$', name):
                return name
    m = re.search(r'\*\*(.{2,4})\*\*', resume_markdown[:200])
    if m and re.match(r'^[\u4e00-\u9fff]{2,4}$', m.group(1)):
        return m.group(1)
    m = re.search(r'姓名[：:]\s*([^\n]{2,4})', resume_markdown[:300])
    if m and re.match(r'^[\u4e00-\u9fff]{2,4}$', m.group(1)):
        return m.group(1)
    return ""


def _detect_template_keywords(resume_markdown: str) -> dict[str, object]:
    from backend.interview.question_engine import _extract_skills
    text_lower = resume_markdown.lower()
    scores = [(key, sum(1 for kw in kws if kw in text_lower)) for key, kws in _TEMPLATE_KEYWORDS.items()]
    scores.sort(key=lambda x: -x[1])
    best_key, best_score = scores[0] if scores else ("", 0)
    return {
        "matching_template": best_key if best_score >= 3 else None,
        "detected_skills": _extract_skills(resume_markdown),
    }


def serialize_prep_session(session: PrepSession) -> dict[str, object]:
    from backend.interview.llm_client import LlmClient
    log.info("serializing prep session: id=%s, candidate=%s, ready=%s, llm_status=%s",
             session.id, session.candidate_name, session.ready, session.llm_status)
    info = extract_resume_info(session.resume_markdown, LlmClient.from_env())
    return {
        "prep_session_id": session.id,
        "candidate_name": session.candidate_name,
        "resume_markdown_preview": session.resume_markdown[:1200],
        "followup_questions": session.followup_questions,
        "ready": session.ready,
        "ready_summary": _summary_to_dict(session.ready_summary) if session.ready_summary else None,
        "llm_status": session.llm_status,
        **info,
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
