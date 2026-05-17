from __future__ import annotations

from dataclasses import dataclass
import json
import re
from datetime import UTC, datetime

from backend.interview.llm_client import LlmClient
from backend.interview.session import InterviewSession


@dataclass(frozen=True)
class AnswerHelpResult:
    llm_status: str
    summary: str
    reference_answer: str
    outline: list[str]
    key_points: list[str]
    cautions: list[str]
    generated_at: str


def generate_answer_help(
    session: InterviewSession,
    draft_text: str = "",
    llm_client: LlmClient | None = None,
) -> AnswerHelpResult:
    question = session.current_question
    if question is None:
        raise ValueError("no_current_question")

    client = llm_client or LlmClient.from_env()
    llm_result = client.complete_json(
        "你是模拟面试求助助手。请只输出 JSON，字段 reference_answer、outline、key_points、cautions、summary。"
        "reference_answer 是参考作答，不是标准答案；outline 是 3 个以内的回答提纲；"
        "key_points 是必须覆盖的要点；cautions 是必须提醒候选人的风险提示；summary 是一句话概述。"
        "禁止输出 hire/no-hire、录用、不录用、自动评分、人格、情绪、健康或敏感属性判断。"
        "不要要求候选人伪造经历。",
        json.dumps(_build_context(session, draft_text), ensure_ascii=False),
    )
    if llm_result.status == "ok" and llm_result.data:
        parsed = _parse_llm_result(llm_result.data, session, draft_text)
        if parsed is not None:
            return parsed

    return _build_fallback_result(session, draft_text)


def _build_context(session: InterviewSession, draft_text: str) -> dict[str, object]:
    recent_answers = []
    for answer in session.answers[-2:]:
        recent_answers.append(
            {
                "question_id": answer.question_id,
                "dimension": answer.dimension,
                "question": answer.prompt,
                "answer": answer.text,
            }
        )

    question = session.current_question
    return {
        "candidate_name": session.candidate_name,
        "role": session.role,
        "draft_text": draft_text.strip(),
        "current_question": {
            "id": question.id if question else "",
            "dimension": question.dimension if question else "",
            "prompt": question.prompt if question else "",
            "follow_ups": question.follow_ups if question else [],
            "evidence_hints": question.evidence_hints if question else [],
        },
        "recent_answers": recent_answers,
    }


def _parse_llm_result(
    data: dict[str, object],
    session: InterviewSession,
    draft_text: str,
) -> AnswerHelpResult | None:
    reference_answer = str(data.get("reference_answer", "")).strip()
    outline = _parse_string_list(data.get("outline"))
    key_points = _parse_string_list(data.get("key_points"))
    cautions = _parse_string_list(data.get("cautions"))
    summary = str(data.get("summary", "")).strip()

    if not reference_answer:
        return None

    if not outline:
        outline = _default_outline(session)
    if not key_points:
        key_points = _default_key_points(session, draft_text)
    if not cautions:
        cautions = _default_cautions()
    if not summary:
        summary = "可以先按背景、方法、结果的结构组织回答。"

    return AnswerHelpResult(
        llm_status="ok",
        summary=summary,
        reference_answer=reference_answer,
        outline=outline,
        key_points=key_points,
        cautions=cautions,
        generated_at=_now(),
    )


def _build_fallback_result(session: InterviewSession, draft_text: str) -> AnswerHelpResult:
    summary = _build_summary(session, draft_text)
    reference_answer = _build_reference_answer(session, draft_text)
    outline = _default_outline(session)
    key_points = _default_key_points(session, draft_text)
    cautions = _default_cautions()
    return AnswerHelpResult(
        llm_status="fallback",
        summary=summary,
        reference_answer=reference_answer,
        outline=outline,
        key_points=key_points,
        cautions=cautions,
        generated_at=_now(),
    )


def _build_summary(session: InterviewSession, draft_text: str) -> str:
    question = session.current_question
    if question is None:
        return "当前没有可求助的问题。"
    if draft_text.strip():
        return f"你已经有草稿，可以沿着 {question.dimension} 的思路继续补充。"
    return f"可以先围绕 {question.dimension} 题目，用真实经历组织一个简洁回答。"


def _build_reference_answer(session: InterviewSession, draft_text: str) -> str:
    question = session.current_question
    if question is None:
        return ""
    outline = _default_outline(session)
    base = [
        f"这道题可以按“{outline[0]}、{outline[1]}、{outline[2]}”来回答。",
        f"你可以先说：在 {session.role} 相关场景里，我负责过和“{question.prompt}”类似的问题，通常会从需求、方案和结果三个部分来讲。",
        "如果你已有草稿，建议保留其中最具体的一句话，再补上你的角色、做法和结果。",
    ]
    if draft_text.strip():
        base.append("你现在的草稿已经有方向了，下一步重点补足事实、过程和结果，而不是单纯扩写措辞。")
    return "\n\n".join(base)


def _default_outline(session: InterviewSession) -> list[str]:
    question = session.current_question
    if question is None:
        return ["问题背景", "你的做法", "结果与复盘"]

    text = f"{question.dimension} {question.prompt}".lower()
    if "项目" in text:
        return ["项目背景", "你的职责和方法", "结果与复盘"]
    if "架构" in text or "设计" in text or "系统" in text:
        return ["需求和目标", "核心设计", "容错和扩展性"]
    if "协作" in text or "沟通" in text:
        return ["协作背景", "推进方式", "达成结果"]
    if "应变" in text or "追问" in text or "短" in text:
        return ["先承认边界", "再给思路", "补真实例子"]
    if "表达" in text:
        return ["先给结论", "分点展开", "最后收束"]
    return ["先给结论", "举一个例子", "补结果和反思"]


def _default_key_points(session: InterviewSession, draft_text: str) -> list[str]:
    question = session.current_question
    if question is None:
        return ["先说明题意", "再给出结构", "最后补充结果"]

    text = f"{question.dimension} {question.prompt}".lower()
    points: list[str]
    if "项目" in text:
        points = ["项目目标和场景", "你的具体职责", "技术方案或方法", "结果或影响"]
    elif "架构" in text or "设计" in text or "系统" in text:
        points = ["需求拆解", "模块划分", "数据流", "容错和扩展"]
    elif "协作" in text or "沟通" in text:
        points = ["协作对象", "推进方式", "你做了什么", "最后达成了什么"]
    elif "应变" in text or "追问" in text:
        points = ["先说明不确定性", "再讲思考过程", "给出真实例子", "明确边界"]
    else:
        points = ["先给结论", "用例子支撑", "补结果", "收束到岗位要求"]

    if draft_text.strip():
        points.append("保留草稿里最具体的一句")

    return points


def _default_cautions() -> list[str]:
    return [
        "这只是参考答案，不要直接照抄。",
        "没有真实数据时不要编造，可以如实说明边界。",
        "如果某个细节不确定，直接说不确定并给出思路更稳妥。",
    ]


def _parse_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _now() -> str:
    return datetime.now(UTC).isoformat()
