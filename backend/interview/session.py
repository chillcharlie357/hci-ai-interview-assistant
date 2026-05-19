from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime
import re
import time
from typing import TYPE_CHECKING

from backend.interview.answer_analysis import analyze_answer_text
from backend.interview.question_engine import InterviewQuestion
from backend.speech_analysis.aggregate import SpeechCumulativeMetrics

if TYPE_CHECKING:
    from backend.interview.followup_engine import FollowupDecision  # noqa: F401


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
    speech_rate_wpm: float | None = None
    audio_rms_db: float | None = None
    audio_f0_std_hz: float | None = None
    audio_f0_std_semitones: float | None = None
    is_followup: bool = False
    followup_round: int = 0          # 0 表示主问题回答；1/2 表示第几轮追问的回答
    followup_prompt: str = ""        # 当 is_followup=True 时记录追问问题文本


@dataclass(frozen=True)
class FollowupTurn:
    """追问对话窗口里的一条消息。"""
    role: str          # "interviewer" | "candidate"
    text: str
    timestamp: str


@dataclass(frozen=True)
class FollowupState:
    """单道主问题的追问状态。"""
    question_id: str
    turns: list[FollowupTurn]
    asked_count: int = 0                # 已经发出的追问次数（不含主问题）
    finished: bool = False              # True 表示这题不再追问
    pending_question: str | None = None # 下一句要朗读给候选人的追问文本


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
    nod_count: int | None = None
    nod_rate_per_minute: float | None = None
    hand_activity: float | None = None
    body_activity: float | None = None


@dataclass(frozen=True)
class KeyframeRecord:
    timestamp: float
    reason: str
    data_url: str = ""
    video_timestamp_sec: float | None = None


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
    created_at: str = ""  # 创建时间（从数据库读取时填充，创建时不填）
    llm_status: str = "fallback"
    video_events: list[VideoEvent] | None = None
    keyframes: list[KeyframeRecord] | None = None
    enable_video_observation: bool = True
    video_path: str | None = None
    video_duration_sec: float | None = None
    video_upload_failed: bool = False
    followup_states: dict[str, FollowupState] | None = None

    @property
    def current_question(self) -> InterviewQuestion | None:
        if self.current_index >= len(self.questions):
            return None
        return self.questions[self.current_index]

    @property
    def current_followup(self) -> str | None:
        """当前主问题尚未结束、且 LLM 决定追问时，返回应朗读给候选人的追问文本。"""
        question = self.current_question
        if question is None:
            return None
        state = (self.followup_states or {}).get(question.id)
        if state is None or state.finished:
            return None
        return state.pending_question


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
        enable_video_observation=enable_video_observation,
        followup_states={},
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
    audio_rms_db: float | None = None,
    audio_f0_std_hz: float | None = None,
    audio_f0_std_semitones: float | None = None,
    followup_decision: "FollowupDecision | None" = None,
) -> InterviewSession:
    """记录一次回答。

    若 ``followup_decision`` 为 ``None`` 或 ``finished=True``，按原有逻辑推进 ``current_index``；
    若决定继续追问，则当前题保持不动，并在 ``followup_states`` 中记录待发追问。
    """
    question = session.current_question
    if question is None:
        return session

    recorded_at = _now()
    analysis = analyze_answer_text(text) if filler_word_count is None else None
    word_count = _count_words(text)
    speech_rate_wpm = round(word_count / (duration_sec / 60), 1) if duration_sec >= 5 else None

    # 当前题在记录前已处于第 N 轮追问对话状态：
    #   N == 0 -> 这是对主问题的首答
    #   N >= 1 -> 这是对第 N 轮追问的回答
    prev_state = (session.followup_states or {}).get(question.id)
    answered_round = prev_state.asked_count if prev_state else 0
    answered_followup_prompt = prev_state.pending_question if (prev_state and answered_round > 0) else ""

    answer = AnswerRecord(
        question_id=question.id,
        dimension=question.dimension,
        prompt=question.prompt,
        text=text.strip(),
        duration_sec=duration_sec,
        word_count=word_count,
        filler_word_count=analysis.filler_word_count if analysis else filler_word_count,
        recorded_at=recorded_at,
        speech_rate_wpm=speech_rate_wpm,
        audio_rms_db=audio_rms_db,
        audio_f0_std_hz=audio_f0_std_hz,
        audio_f0_std_semitones=audio_f0_std_semitones,
        is_followup=answered_round > 0,
        followup_round=answered_round,
        followup_prompt=answered_followup_prompt or "",
    )
    event_message = (
        f"已记录 {question.dimension} 第 {answered_round} 轮追问回答，用时 {duration_sec} 秒。"
        if answered_round > 0
        else f"已记录 {question.dimension} 回答，用时 {duration_sec} 秒。"
    )
    event = InterviewEvent(
        type="answer_recorded",
        timestamp=recorded_at,
        question_id=question.id,
        message=event_message,
    )

    next_states = dict(session.followup_states or {})
    next_index = session.current_index
    extra_events: list[InterviewEvent] = []

    if followup_decision is None or followup_decision.finished:
        # 不再追问，推进到下一题。状态标记 finished，便于报告检查。
        new_state = FollowupState(
            question_id=question.id,
            turns=_append_followup_turns(prev_state, question, text, recorded_at, append_pending=False),
            asked_count=answered_round,
            finished=True,
            pending_question=None,
        )
        next_states[question.id] = new_state
        next_index = session.current_index + 1
    else:
        new_state = FollowupState(
            question_id=question.id,
            turns=_append_followup_turns(
                prev_state,
                question,
                text,
                recorded_at,
                append_pending=True,
                pending_text=followup_decision.followup_question,
            ),
            asked_count=answered_round + 1,
            finished=False,
            pending_question=followup_decision.followup_question,
        )
        next_states[question.id] = new_state
        extra_events.append(
            InterviewEvent(
                type="followup_asked",
                timestamp=recorded_at,
                question_id=question.id,
                message=f"针对 {question.dimension} 触发第 {new_state.asked_count} 轮追问。",
            )
        )

    return replace(
        session,
        current_index=next_index,
        answers=[*session.answers, answer],
        events=[*session.events, event, *extra_events],
        followup_states=next_states,
    )


def _append_followup_turns(
    prev_state: "FollowupState | None",
    question: InterviewQuestion,
    candidate_text: str,
    timestamp: str,
    *,
    append_pending: bool,
    pending_text: str = "",
) -> list[FollowupTurn]:
    """根据上一次的状态拼接最新的对话窗口。"""
    if prev_state is None:
        turns: list[FollowupTurn] = [
            FollowupTurn(role="interviewer", text=question.prompt, timestamp=timestamp),
        ]
    else:
        turns = list(prev_state.turns)
    turns.append(FollowupTurn(role="candidate", text=candidate_text.strip(), timestamp=timestamp))
    if append_pending and pending_text:
        turns.append(FollowupTurn(role="interviewer", text=pending_text, timestamp=timestamp))
    return turns


def record_video_event(
    session: InterviewSession,
    timestamp: float,
    event_type: str,
    confidence: float,
    metrics: dict[str, object] | VideoMetrics,
    keyframe: dict[str, object] | None = None,
) -> InterviewSession:
    video_metrics = metrics if isinstance(metrics, VideoMetrics) else VideoMetrics(**_filter_metric_fields(metrics))
    keyframes = list(session.keyframes or [])
    keyframe_index: int | None = None
    if keyframe:
        has_data = keyframe.get("data_url") or keyframe.get("video_timestamp_sec") is not None
        if has_data:
            keyframe_index = len(keyframes)
            keyframes.append(
                KeyframeRecord(
                    timestamp=timestamp,
                    reason=str(keyframe.get("reason") or event_type),
                    data_url=str(keyframe.get("data_url", "")),
                    video_timestamp_sec=keyframe.get("video_timestamp_sec"),
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


def generate_markdown_report(
    session: InterviewSession,
    speech_metrics: SpeechCumulativeMetrics | None = None,
) -> str:
    answered_question_ids = {answer.question_id for answer in session.answers}
    unanswered_questions = [question for question in session.questions if question.id not in answered_question_ids]

    lines = [
        "# 智能面试纪要",
        "",
        "## 1. 面试概览",
        f"- 候选人：{session.candidate_name}",
        f"- 岗位：{session.role}",
        f"- 问题数：{len(session.questions)}",
        f"- 已回答：{len([a for a in session.answers if not a.is_followup])}",
        f"- 触发追问回合：{len([a for a in session.answers if a.is_followup])}",
        "",
        "## 2. 问答记录",
    ]

    # 按主问题聚合：主回答 + 该题所有追问回答
    main_answers = [a for a in session.answers if not a.is_followup]
    answers_by_question: dict[str, list[AnswerRecord]] = {}
    for a in session.answers:
        answers_by_question.setdefault(a.question_id, []).append(a)

    for index, main_answer in enumerate(main_answers, start=1):
        question = _find_question(session.questions, main_answer.question_id)
        answer_lines = [
            "",
            f"### {index}. {main_answer.dimension}",
            f"- 问题：{main_answer.prompt}",
            f"- 回答摘要：{main_answer.text or '未记录回答'}",
            f"- 回答用时：{main_answer.duration_sec} 秒",
            f"- 字数/字符数：{main_answer.word_count}",
            f"- 语速：{format_speech_rate(main_answer.speech_rate_wpm)}",
        ]
        if main_answer.audio_rms_db is not None:
            answer_lines.append(f"- 音频响度：{main_answer.audio_rms_db:.1f} dBFS")
        if main_answer.audio_f0_std_semitones is not None:
            answer_lines.append(f"- 语调起伏：{main_answer.audio_f0_std_semitones:.1f} st")
        elif main_answer.audio_f0_std_hz is not None:
            answer_lines.append(f"- 语调起伏：{main_answer.audio_f0_std_hz:.0f} Hz")
        answer_lines.append(f"- 填充词数量：{main_answer.filler_word_count}")

        # 展开 LLM 追问轨迹（按 followup_round 排序）
        followups = sorted(
            [a for a in answers_by_question.get(main_answer.question_id, []) if a.is_followup],
            key=lambda a: a.followup_round,
        )
        for fa in followups:
            answer_lines.append(f"- 追问 {fa.followup_round}：{fa.followup_prompt or '（未知追问）'}")
            answer_lines.append(f"  - 候选人回答：{fa.text or '未记录回答'}（用时 {fa.duration_sec} 秒）")

        answer_lines.append(
            f"- 备用追问参考：{question.follow_ups[0] if question and question.follow_ups else '无'}"
        )
        answer_lines.append(
            f"- 观察点：{question.evidence_hints[0] if question and question.evidence_hints else '无'}"
        )
        lines.extend(answer_lines)

    lines.extend(["", "## 3. 实时事件"])
    lines.extend(f"- {event.timestamp} {event.message}" for event in session.events)

    lines.extend(["", "## 4. 语音观察"])
    lines.extend(_build_speech_observations(speech_metrics))

    lines.extend(["", "## 5. 非语言观察"])
    lines.extend(_build_video_observations(session.video_events or [], session.keyframes or []))

    lines.extend(["", "## 6. 待人工确认"])
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
    # 只对主回答做长度复核提示，追问回答仅看填充词
    for answer in answers:
        if answer.filler_word_count >= 3:
            scope = f"{answer.dimension} 第 {answer.followup_round} 轮追问" if answer.is_followup else answer.dimension
            items.append(f"- {scope} 回答填充词较多，建议人工复核表达流畅度。")
        if not answer.is_followup and answer.word_count < 8:
            items.append(f"- {answer.dimension} 回答较短，建议确认是否需要追问。")
    for question in unanswered_questions:
        items.append(f"- 问题「{question.prompt}」尚未回答，建议确认是否跳过。")
    return items or ["- 当前无明显异常，仍建议面试官复核关键结论。"]


def _build_speech_observations(metrics: SpeechCumulativeMetrics | None) -> list[str]:
    if metrics is None or metrics.chunk_count == 0:
        return ["- 未采集语音分析数据。"]

    observations = [
        f"- 共分析 {metrics.chunk_count} 个语音片段，累计 {metrics.analyzed_duration_sec:.0f} 秒。以下内容仅作为观察信号，不代表能力结论。"
    ]

    # 语速（基于音频 VAD 估算，中文场景下约等于字/分钟；每题精确语速见第 2 节）
    speech_rate_audio_wpm = metrics.speech_rate_sps * 60
    if speech_rate_audio_wpm > 0:
        if speech_rate_audio_wpm < 120:
            observations.append(f"- 基于音频分析估算语速偏慢（约 {speech_rate_audio_wpm:.0f} 字/分钟），参考范围 120–160 字/分钟，建议人工复核是否因思考或不熟悉话题。")
        elif speech_rate_audio_wpm > 160:
            observations.append(f"- 基于音频分析估算语速偏快（约 {speech_rate_audio_wpm:.0f} 字/分钟），参考范围 120–160 字/分钟，建议人工复核清晰度。")
        else:
            observations.append(f"- 基于音频分析估算语速约 {speech_rate_audio_wpm:.0f} 字/分钟，处于常见区间。")

    # 音量
    if metrics.rms_db_mean is not None:
        if metrics.rms_db_mean < -35:
            observations.append(f"- 检测到平均响度约 {metrics.rms_db_mean:.1f} dBFS，偏低，建议复核录音设备或说话音量。")
        elif metrics.rms_db_mean > -10:
            observations.append(f"- 检测到平均响度约 {metrics.rms_db_mean:.1f} dBFS，偏高，建议复核录音设备增益设置。")
        else:
            observations.append(f"- 检测到平均响度约 {metrics.rms_db_mean:.1f} dBFS，处于常见区间。")

    # 语调变化
    if metrics.f0_std_semitones is not None:
        if metrics.f0_std_semitones < 1.5:
            observations.append(f"- 检测到语调起伏较平稳（半音标准差 {metrics.f0_std_semitones:.1f} st，参考范围 1.5–4.0 st），建议复核表达丰富度。")
        elif metrics.f0_std_semitones > 4.0:
            observations.append(f"- 检测到语调起伏明显（半音标准差 {metrics.f0_std_semitones:.1f} st，参考范围 1.5–4.0 st），建议复核是否因紧张或激动。")
        else:
            observations.append(f"- 检测到语调起伏适中（半音标准差 {metrics.f0_std_semitones:.1f} st，参考范围 1.5–4.0 st）。")

    return observations


def _build_video_observations(video_events: list[VideoEvent], keyframes: list[KeyframeRecord]) -> list[str]:
    if not video_events:
        return ["- 未记录实时摄像头非语言观察。"]

    observations = [
        f"- 共记录 {len(video_events)} 条非语言观察、{len(keyframes)} 张关键帧。以下内容仅作为观察信号，不代表能力结论。"
    ]
    for event in video_events[-5:]:
        observations.append(
            f"- {event.timestamp:.1f}s：{event.event_type}（置信度 {event.confidence:.2f}，亮度 {format_metric(event.metrics.brightness)}，运动量 {format_metric(event.metrics.motion)}，眨眼频率 {format_rate(event.metrics.blink_rate_per_minute)}，眼神接触占比 {format_ratio(event.metrics.eye_contact_ratio)}，点头频率 {format_rate(event.metrics.nod_rate_per_minute)}）。"
        )
    return observations


def format_metric(value: float | None) -> str:
    return "未知" if value is None else f"{value:.2f}"


def format_rate(value: float | None) -> str:
    return "未知" if value is None else f"{value:.1f} 次/分钟"


def format_ratio(value: float | None) -> str:
    return "未知" if value is None else f"{value * 100:.0f}%"


def format_speech_rate(value: float | None) -> str:
    if value is None:
        return "未知"
    hint = ""
    if value < 120:
        hint = "（偏慢，参考范围 120–160 字/分钟）"
    elif value > 160:
        hint = "（偏快，参考范围 120–160 字/分钟）"
    return f"{value:.0f} 字/分钟{hint}"


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
