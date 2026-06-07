from __future__ import annotations

from dataclasses import dataclass
import re


KNOWN_SKILLS = [
    "Python",
    "TypeScript",
    "JavaScript",
    "React",
    "Node.js",
    "LLM",
    "LiveKit",
    "ASR",
    "TTS",
    "WebRTC",
]

GOAL_DIMENSIONS = ["专业能力", "项目经验", "技术实现能力", "应变能力", "表达能力", "协作能力"]


@dataclass(frozen=True)
class Signals:
    role: str
    skills: list[str]
    projects: list[str]
    goals: list[str]


@dataclass(frozen=True)
class InterviewQuestion:
    id: str
    dimension: str
    prompt: str
    follow_ups: list[str]
    evidence_hints: list[str]


@dataclass(frozen=True)
class QuestionSet:
    role: str
    signals: Signals
    questions: list[InterviewQuestion]


def extract_signals(resume: str = "", job_description: str = "", interview_goal: str = "") -> Signals:
    source = "\n".join([resume, job_description, interview_goal])
    role = _extract_role(job_description) or _extract_role(source) or "候选人"
    return Signals(
        role=role,
        skills=_extract_skills(source),
        projects=_extract_projects(resume),
        goals=_extract_goals(interview_goal or source),
    )


def generate_interview_questions(
    resume: str = "", job_description: str = "", interview_goal: str = "",
    max_questions: int = 6,
) -> QuestionSet:
    signals = extract_signals(resume, job_description, interview_goal)
    primary_skills = signals.skills[:4]
    skill_text = "、".join(primary_skills) if primary_skills else "你的核心技术栈"
    primary_project = signals.projects[0] if signals.projects else "你最有代表性的项目"

    templates = [
        InterviewQuestion(
            id="",
            dimension="专业能力",
            prompt=f"请结合 {skill_text}，介绍你对 {signals.role} 这个岗位核心能力的理解。",
            follow_ups=["这些能力里你最有把握的是哪一项？请举一个具体例子。"],
            evidence_hints=["关注候选人是否能把岗位要求和自身技术经验对应起来。"],
        ),
        InterviewQuestion(
            id="",
            dimension="项目经验",
            prompt=f"请详细讲一下 {primary_project}，重点说明你的职责、技术选型和最终结果。",
            follow_ups=["这个项目里最困难的问题是什么？你是怎么解决的？"],
            evidence_hints=["关注项目背景、个人贡献、技术深度和结果可验证性。"],
        ),
        InterviewQuestion(
            id="",
            dimension="技术实现能力",
            prompt="如果要实现一个 AI 面试系统的问题生成和回答记录模块，你会如何设计前后端数据流？",
            follow_ups=["如果候选人回答中断或网络抖动，你会怎么保证状态一致？"],
            evidence_hints=["关注模块拆分、状态管理、异常处理和工程落地能力。"],
        ),
        InterviewQuestion(
            id="",
            dimension="技术实现能力",
            prompt=f"针对 {primary_skills[0] if primary_skills else '核心技术'}，请说一个你在生产项目中做过的质量或稳定性优化。",
            follow_ups=["优化前后你用什么指标证明效果？"],
            evidence_hints=["关注是否有指标意识和真实工程经验。"],
        ),
        InterviewQuestion(
            id="",
            dimension="应变能力",
            prompt="如果候选人回答很短、信息不足，数字人面试官应该如何继续追问？",
            follow_ups=["哪些回答应该标记为需要面试官人工复核？"],
            evidence_hints=["关注候选人是否能识别不确定性并设计人工复核机制。"],
        ),
        InterviewQuestion(
            id="",
            dimension="表达能力",
            prompt="请用两分钟向非技术招聘同事解释这个 AI 辅助面试系统的价值和边界。",
            follow_ups=["你会如何避免系统被误用成自动录用决策？"],
            evidence_hints=["关注表达清晰度、产品边界意识和风险意识。"],
        ),
    ]

    desired_dimensions = set(signals.goals or GOAL_DIMENSIONS[:4])
    prioritized = sorted(
        templates,
        key=lambda question: question.dimension not in desired_dimensions,
    )
    selected = prioritized[:max_questions]
    questions = [
        InterviewQuestion(
            id=f"q_{index:03d}",
            dimension=question.dimension,
            prompt=question.prompt,
            follow_ups=question.follow_ups,
            evidence_hints=question.evidence_hints,
        )
        for index, question in enumerate(selected, start=1)
    ]

    return QuestionSet(role=signals.role, signals=signals, questions=questions)


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


def _extract_skills(text: str) -> list[str]:
    found: list[tuple[int, str]] = []
    for skill in KNOWN_SKILLS:
        match = re.search(re.escape(skill), text, flags=re.IGNORECASE)
        if match:
            found.append((match.start(), skill))
    return [skill for _, skill in sorted(found)]


def _extract_projects(resume: str) -> list[str]:
    candidates = [part.strip() for part in re.split(r"[。；;\n]", resume) if part.strip()]
    return [part for part in candidates if re.search(r"项目|平台|系统|面试|产品|模块", part)]


def _extract_goals(text: str) -> list[str]:
    return [goal for goal in GOAL_DIMENSIONS if goal in text]
