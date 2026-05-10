from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime
import re
import time

from backend.interview.answer_analysis import analyze_answer_text
from backend.interview.question_engine import InterviewQuestion


@dataclass(frozen=True)
class InterviewEvent:
    type: str
    timestamp: str
    message: str
    question_id: str | None = None


@dataclass(frozen=True)
class AnswerRecord:
    question_id: str
    dimension: str
    prompt: str
    text: str
    duration_sec: int
    word_count: int
    filler_word_count: int
    recorded_at: str


@dataclass(frozen=True)
class VideoMetrics:
    face_present: bool | None = None
    brightness: float | None = None
    blur: float | None = None
    motion: float | None = None
    gaze_proxy: float | None = None
    head_pose_proxy: float | None = None
    blink_proxy: float | None = None
    blink_count: int | None = None
    blink_rate_per_minute: float | None = None
    eye_contact_ratio: float | None = None
    gaze_deviation_deg: float | None = None
    eye_aspect_ratio: float | None = None
    nod_proxy: float | None = None
    hand_activity: float | None = None
    body_activity: float | None = None


@dataclass(frozen=True)
class KeyframeRecord:
    timestamp: float
    reason: str
    data_url: str


@dataclass(frozen=True)
class VideoEvent:
    timestamp: float
    event_type: str
    confidence: float
    metrics: VideoMetrics
    keyframe_index: int | None = None


@dataclass(frozen=True)
class InterviewSession:
    id: str
    candidate_name: str
    role: str
    questions: list[InterviewQuestion]
    current_index: int
    answers: list[AnswerRecord]
    events: list[InterviewEvent]
    user_id: str = ""  # 所属用户 ID
    llm_status: str = "fallback"
    video_events: list[VideoEvent] | None = None
    keyframes: list[KeyframeRecord] | None = None
    meeting_room: str = ""
    enable_video_observation: bool = True

    @property
    def current_question(self) -> InterviewQuestion | None:
        if self.current_index >= len(self.questions):
            return None
        return self.questions[self.current_index]


def create_interview_session(
    candidate_name: str = "候选人",
    role: str = "候选人",
    questions: list[InterviewQuestion] | None = None,
    enable_video_observation: bool = True,
    user_id: str = "",
) -> InterviewSession:
    question_list = questions or []
    session_id = f"session_{int(time.time() * 1000)}"
    return InterviewSession(
        id=session_id,
        candidate_name=candidate_name,
        role=role,
        questions=question_list,
        current_index=0,
        answers=[],
        user_id=user_id,
        llm_status="fallback",
        video_events=[],
        keyframes=[],
        meeting_room=f"interview-{session_id}",
        enable_video_observation=enable_video_observation,
        events=[
            InterviewEvent(
                type="session_started",
                timestamp=_now(),
                message=f"数字人面试官已准备，将面向 {role} 开始提问。",
            )
        ],
    )


def build_avatar_prompt(session: InterviewSession) -> str:
    question = session.current_question
    if question is None:
        return "本轮问题已经结束，请确认是否生成面试纪要。"
    return f"{session.candidate_name}，你好。接下来是 {question.dimension} 相关问题。{question.prompt}"


def record_answer(
    session: InterviewSession,
    text: str = "",
    duration_sec: int = 0,
    filler_word_count: int | None = None,
) -> InterviewSession:
    question = session.current_question
    if question is None:
        return session

    recorded_at = _now()
    analysis = analyze_answer_text(text) if filler_word_count is None else None
    answer = AnswerRecord(
        question_id=question.id,
        dimension=question.dimension,
        prompt=question.prompt,
        text=text.strip(),
        duration_sec=duration_sec,
        word_count=_count_words(text),
        filler_word_count=analysis.filler_word_count if analysis else filler_word_count,
        recorded_at=recorded_at,
    )
    event = InterviewEvent(
        type="answer_recorded",
        timestamp=recorded_at,
        question_id=question.id,
        message=f"已记录 {question.dimension} 回答，用时 {duration_sec} 秒。",
    )

    return replace(
        session,
        current_index=session.current_index + 1,
        answers=[*session.answers, answer],
        events=[*session.events, event],
    )


def record_video_event(
    session: InterviewSession,
    timestamp: float,
    event_type: str,
    confidence: float,
    metrics: dict[str, object] | VideoMetrics,
    keyframe: dict[str, str] | None = None,
) -> InterviewSession:
    video_metrics = metrics if isinstance(metrics, VideoMetrics) else VideoMetrics(**_filter_metric_fields(metrics))
    keyframes = list(session.keyframes or [])
    keyframe_index: int | None = None
    if keyframe and keyframe.get("data_url"):
        keyframe_index = len(keyframes)
        keyframes.append(
            KeyframeRecord(
                timestamp=timestamp,
                reason=str(keyframe.get("reason") or event_type),
                data_url=str(keyframe["data_url"]),
            )
        )

    video_events = [
        *(session.video_events or []),
        VideoEvent(
            timestamp=timestamp,
            event_type=event_type,
            confidence=confidence,
            metrics=video_metrics,
            keyframe_index=keyframe_index,
        ),
    ]
    event = InterviewEvent(
        type="video_event_recorded",
        timestamp=_now(),
        message=f"已记录非语言观察：{event_type}，置信度 {confidence:.2f}。",
    )
    return replace(session, video_events=video_events, keyframes=keyframes, events=[*session.events, event])


def generate_markdown_report(session: InterviewSession) -> str:
    answered_question_ids = {answer.question_id for answer in session.answers}
    unanswered_questions = [question for question in session.questions if question.id not in answered_question_ids]

    lines = [
        "# 智能面试纪要",
        "",
        "## 1. 面试概览",
        f"- 候选人：{session.candidate_name}",
        f"- 岗位：{session.role}",
        f"- 问题数：{len(session.questions)}",
        f"- 已回答：{len(session.answers)}",
        "",
        "## 2. 问答记录",
    ]

    for index, answer in enumerate(session.answers, start=1):
        question = _find_question(session.questions, answer.question_id)
        lines.extend(
            [
                "",
                f"### {index}. {answer.dimension}",
                f"- 问题：{answer.prompt}",
                f"- 回答摘要：{answer.text or '未记录回答'}",
                f"- 回答用时：{answer.duration_sec} 秒",
                f"- 字数/字符数：{answer.word_count}",
                f"- 填充词数量：{answer.filler_word_count}",
                f"- 建议追问：{question.follow_ups[0] if question and question.follow_ups else '无'}",
                f"- 观察点：{question.evidence_hints[0] if question and question.evidence_hints else '无'}",
            ]
        )

    lines.extend(["", "## 3. 实时事件"])
    lines.extend(f"- {event.timestamp} {event.message}" for event in session.events)

    lines.extend(["", "## 4. 非语言观察"])
    lines.extend(_build_video_observations(session.video_events or [], session.keyframes or []))

    lines.extend(["", "## 5. 待人工确认"])
    lines.extend(_build_review_items(session.answers, unanswered_questions))
    return "\n".join(lines)


def summarize_video(session: InterviewSession) -> dict[str, object]:
    video_events = session.video_events or []
    keyframes = session.keyframes or []
    event_types = sorted({event.event_type for event in video_events})
    return {
        "event_count": len(video_events),
        "keyframe_count": len(keyframes),
        "event_types": event_types,
    }


def _find_question(questions: list[InterviewQuestion], question_id: str) -> InterviewQuestion | None:
    for question in questions:
        if question.id == question_id:
            return question
    return None


def _build_review_items(
    answers: list[AnswerRecord],
    unanswered_questions: list[InterviewQuestion],
) -> list[str]:
    items: list[str] = []
    for answer in answers:
        if answer.filler_word_count >= 3:
            items.append(f"- {answer.dimension} 回答填充词较多，建议人工复核表达流畅度。")
        if answer.word_count < 8:
            items.append(f"- {answer.dimension} 回答较短，建议确认是否需要追问。")
    for question in unanswered_questions:
        items.append(f"- 问题「{question.prompt}」尚未回答，建议确认是否跳过。")
    return items or ["- 当前无明显异常，仍建议面试官复核关键结论。"]


def _build_video_observations(video_events: list[VideoEvent], keyframes: list[KeyframeRecord]) -> list[str]:
    if not video_events:
        return ["- 未记录实时摄像头非语言观察。"]

    observations = [
        f"- 共记录 {len(video_events)} 条非语言观察、{len(keyframes)} 张关键帧。以下内容仅作为观察信号，不代表能力结论。"
    ]
    for event in video_events[-5:]:
        observations.append(
            f"- {event.timestamp:.1f}s：{event.event_type}（置信度 {event.confidence:.2f}，亮度 {format_metric(event.metrics.brightness)}，运动量 {format_metric(event.metrics.motion)}，眨眼频率 {format_rate(event.metrics.blink_rate_per_minute)}，眼神接触占比 {format_ratio(event.metrics.eye_contact_ratio)}）。"
        )
    return observations


def format_metric(value: float | None) -> str:
    return "未知" if value is None else f"{value:.2f}"


def format_rate(value: float | None) -> str:
    return "未知" if value is None else f"{value:.1f} 次/分钟"


def format_ratio(value: float | None) -> str:
    return "未知" if value is None else f"{value * 100:.0f}%"


def _filter_metric_fields(metrics: dict[str, object]) -> dict[str, object]:
    valid_fields = VideoMetrics.__dataclass_fields__.keys()
    return {key: value for key, value in metrics.items() if key in valid_fields}


def _count_words(text: str) -> int:
    compact = text.strip()
    if not compact:
        return 0
    latin_words = re.findall(r"[A-Za-z0-9_.+-]+", compact)
    chinese_chars = re.sub(r"[A-Za-z0-9_.+\-\s，。！？、；：,.!?;:]", "", compact)
    return len(latin_words) + len(chinese_chars)


def _now() -> str:
    return datetime.now(UTC).isoformat()
