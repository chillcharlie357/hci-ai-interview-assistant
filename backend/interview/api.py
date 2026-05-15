from __future__ import annotations

import base64
import binascii
from dataclasses import asdict, replace
import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from backend.auth import (
    AuthContext,
    AuthMiddleware,
    register,
    login,
    logout,
    refresh_session,
    AuthError,
    InvalidCredentialsError,
    EmailAlreadyRegisteredError,
    WeakPasswordError,
)
from backend.storage import upload_video as storage_upload_video, get_video_signed_url
from backend.interview.answer_analysis import analyze_answer_text
from backend.interview.config import is_auth_required, is_debug
from backend.interview.exceptions import PersistenceError
from backend.interview.document_extractor import DocumentExtractionError, extract_resume_markdown
from backend.interview.livekit_token import LiveKitConfigError, create_livekit_token
from backend.interview.llm_client import LlmClient
from backend.interview.prep_session import PrepSession, advance_followup, create_prep_session, serialize_prep_session
from backend.interview.question_engine import InterviewQuestion, generate_interview_questions
from backend.interview.session import (
    InterviewSession,
    create_interview_session,
    generate_markdown_report,
    record_video_event,
    record_answer,
    summarize_video,
)
from backend.speech_analysis import analyze_speech
from backend.speech_analysis.aggregate import (
    SpeechAggregateState,
    chunk_metrics_from_analysis,
    merge_chunk_metrics,
    summarize_cumulative_metrics,
)
from backend.database.prep_session_repo import PrepSessionRepository
from backend.database.session_repo import SessionRepository
from backend.database.utils import is_valid_uuid


def _dbg(*args, **kwargs) -> None:
    """调试日志，仅在 DEBUG 环境变量为 true/1/yes 时输出"""
    if is_debug():
        print(*args, **kwargs)


class SessionStore:
    def __init__(self, repo: SessionRepository | None = None, prep_repo: PrepSessionRepository | None = None) -> None:
        self.sessions: dict[str, InterviewSession] = {}
        self.prep_sessions: dict[str, PrepSession] = {}
        self.speech_aggregates: dict[str, SpeechAggregateState] = {}
        self.repo = repo
        self.prep_repo = prep_repo

    def create(self, payload: dict[str, Any], user_id: str = "") -> InterviewSession:
        _dbg(f"[create] user_id={user_id!r}", flush=True)
        llm_status = "fallback"
        question_set = generate_interview_questions(
            resume=str(payload.get("resume", "")),
            job_description=str(payload.get("job_description", "")),
            interview_goal=str(payload.get("interview_goal", "")),
        )
        if payload.get("use_llm_questions"):
            llm_result = LlmClient.from_env().complete_json(
                "你是技术面试官，请输出 JSON，包含 questions 数组；每个问题包含 dimension, prompt, follow_ups, evidence_hints。",
                json.dumps(
                    {
                        "resume": payload.get("resume", ""),
                        "job_description": payload.get("job_description", ""),
                        "interview_goal": payload.get("interview_goal", ""),
                    },
                    ensure_ascii=False,
                ),
            )
            llm_status = llm_result.status
            if llm_result.status == "ok" and llm_result.data:
                llm_questions = _questions_from_llm(llm_result.data)
                if llm_questions:
                    question_set = replace(question_set, questions=llm_questions)

        session = create_interview_session(
            candidate_name=str(payload.get("candidate_name", "候选人")),
            role=question_set.role,
            questions=question_set.questions,
            user_id=user_id,
        )
        session = replace(session, llm_status=llm_status)
        self.sessions[session.id] = session
        if self.repo:
            if not self.repo.save_session(session, user_id):
                from backend.interview.exceptions import PersistenceError
                raise PersistenceError(f"Failed to save session {session.id}")
        return session

    def create_prep(self, payload: dict[str, Any], user_id: str = "") -> tuple[int, dict[str, Any]]:
        _dbg(f"[create_prep] user_id={user_id!r}", flush=True)
        try:
            extracted = extract_resume_markdown(
                file_name=str(payload.get("file_name", "")),
                data_base64=str(payload.get("data_base64", "")),
            )
        except DocumentExtractionError as error:
            print(f"[create_prep] extraction failed: {error.code}", flush=True)
            return HTTPStatus.BAD_REQUEST, {"error": error.code, "message": error.message}

        prep = create_prep_session(
            candidate_name=str(payload.get("candidate_name", "候选人")),
            resume_markdown=extracted.markdown,
            user_id=user_id,
        )
        self.prep_sessions[prep.id] = prep
        if self.prep_repo:
            _dbg(f"[create_prep] saving prep session to DB...", flush=True)
            ok = self.prep_repo.save_prep_session(prep, user_id)
            _dbg(f"[create_prep] save_prep_session returned {ok}", flush=True)
            if not ok:
                from backend.interview.exceptions import PersistenceError
                raise PersistenceError(f"Failed to save prep session {prep.id}")
        return HTTPStatus.CREATED, serialize_prep_session(prep)

    def record_followup(self, prep_session_id: str, payload: dict[str, Any], user_id: str = "") -> PrepSession | None:
        _dbg(f"[record_followup] id={prep_session_id} user_id={user_id!r}", flush=True)
        prep = self.prep_sessions.get(prep_session_id)
        if prep is None and self.prep_repo:
            prep = self.prep_repo.get_prep_session(prep_session_id, user_id)
            if prep is not None:
                self.prep_sessions[prep_session_id] = prep
        if prep is None:
            return None
        updated = advance_followup(prep, str(payload.get("answer", "")))
        self.prep_sessions[prep_session_id] = updated
        if self.prep_repo:
            _dbg(f"[record_followup] saving to DB...", flush=True)
            ok = self.prep_repo.save_prep_session(updated, user_id)
            _dbg(f"[record_followup] save_prep_session returned {ok}", flush=True)
            if not ok:
                from backend.interview.exceptions import PersistenceError
                raise PersistenceError(f"Failed to save prep session {prep_session_id}")
        return updated

    def create_from_prep(self, prep_session_id: str, payload: dict[str, Any], user_id: str = "") -> InterviewSession | None:
        _dbg(f"[create_from_prep] prep_id={prep_session_id} user_id={user_id!r}", flush=True)
        prep = self.prep_sessions.get(prep_session_id)
        if prep is None and self.prep_repo:
            _dbg(f"[create_from_prep] not in memory, querying DB...", flush=True)
            prep = self.prep_repo.get_prep_session(prep_session_id, user_id)
            if prep is not None:
                self.prep_sessions[prep_session_id] = prep
        if prep is None:
            _dbg(f"[create_from_prep] prep not found", flush=True)
            return None
        summary = prep.ready_summary
        job_description = summary.job_description if summary else " ".join(turn.answer for turn in prep.turns)
        interview_goal = summary.interview_goal if summary else "评估项目经验、技术实现能力和表达能力。"
        question_set = generate_interview_questions(
            resume=prep.resume_markdown,
            job_description=job_description,
            interview_goal=interview_goal,
        )
        llm_status = prep.llm_status
        if payload.get("use_llm_questions"):
            llm_result = LlmClient.from_env().complete_json(
                "你是技术面试官，请输出 JSON，包含 questions 数组；每个问题包含 dimension, prompt, follow_ups, evidence_hints。",
                json.dumps(
                    {
                        "resume": prep.resume_markdown,
                        "job_description": job_description,
                        "interview_goal": interview_goal,
                    },
                    ensure_ascii=False,
                ),
            )
            llm_status = llm_result.status
            if llm_result.status == "ok" and llm_result.data:
                llm_questions = _questions_from_llm(llm_result.data)
                if llm_questions:
                    question_set = replace(question_set, questions=llm_questions)
        session = create_interview_session(
            candidate_name=prep.candidate_name,
            role=summary.role if summary else question_set.role,
            questions=question_set.questions,
            enable_video_observation=bool(payload.get("enable_video_observation", True)),
            user_id=user_id,
        )
        session = replace(session, llm_status=llm_status)
        self.sessions[session.id] = session
        self.speech_aggregates[session.id] = SpeechAggregateState()
        if self.repo:
            _dbg(f"[create_from_prep] saving interview session to DB...", flush=True)
            ok = self.repo.save_session(session, user_id)
            _dbg(f"[create_from_prep] save_session returned {ok}", flush=True)
            if not ok:
                from backend.interview.exceptions import PersistenceError
                raise PersistenceError(f"Failed to save session {session.id}")
        return session

    def get(self, session_id: str, user_id: str = "") -> InterviewSession | None:
        session = self.sessions.get(session_id)
        if session is not None:
            return session
        if self.repo:
            session = self.repo.get_session(session_id, user_id)
            if session is not None:
                self.sessions[session_id] = session
                if session_id not in self.speech_aggregates:
                    agg = self.repo.get_speech_aggregate(session_id)
                    self.speech_aggregates[session_id] = agg if agg is not None else SpeechAggregateState()
        return session

    def list_sessions(self, user_id: str = "", limit: int = 50) -> list[dict[str, Any]]:
        if self.repo:
            return self.repo.list_sessions(user_id, limit)
        result = []
        for session in self.sessions.values():
            result.append({
                "id": session.id,
                "candidate_name": session.candidate_name,
                "role": session.role,
                "created_at": "",
                "current_index": session.current_index,
                "llm_status": session.llm_status,
                "total_questions": len(session.questions),
            })
        return result[:limit]

    def delete_session(self, session_id: str, user_id: str = "") -> bool:
        self.sessions.pop(session_id, None)
        self.speech_aggregates.pop(session_id, None)
        if self.repo:
            return self.repo.delete_session(session_id, user_id)
        return True

    def record_answer(self, session_id: str, payload: dict[str, Any], user_id: str = "") -> InterviewSession | None:
        session = self.sessions.get(session_id)
        if session is None:
            return None
        answer_analysis = analyze_answer_text(str(payload.get("text", "")))
        # 从语音聚合状态快照音频指标
        audio_rms_db = None
        audio_f0_std_hz = None
        audio_f0_std_semitones = None
        agg = self.speech_aggregates.get(session_id)
        if agg and agg.chunk_count > 0:
            cumulative = summarize_cumulative_metrics(agg)
            audio_rms_db = cumulative.rms_db_mean
            audio_f0_std_hz = cumulative.f0_std_hz
            audio_f0_std_semitones = cumulative.f0_std_semitones
        updated = record_answer(
            session,
            text=str(payload.get("text", "")),
            duration_sec=int(payload.get("duration_sec", 0)),
            filler_word_count=answer_analysis.filler_word_count,
            audio_rms_db=audio_rms_db,
            audio_f0_std_hz=audio_f0_std_hz,
            audio_f0_std_semitones=audio_f0_std_semitones,
        )
        if answer_analysis.llm_status == "ok":
            updated = replace(updated, llm_status="ok")
        self.sessions[session_id] = updated
        if self.repo:
            if not self.repo.save_session(updated, user_id):
                from backend.interview.exceptions import PersistenceError
                raise PersistenceError(f"Failed to save session {session_id}")
        return updated

    def record_video_event(self, session_id: str, payload: dict[str, Any]) -> InterviewSession | None:
        session = self.sessions.get(session_id)
        if session is None:
            return None
        updated = record_video_event(
            session,
            timestamp=float(payload.get("timestamp", 0)),
            event_type=str(payload.get("event_type", "observation")),
            confidence=float(payload.get("confidence", 0)),
            metrics=dict(payload.get("metrics", {})),
            keyframe=payload.get("keyframe") if isinstance(payload.get("keyframe"), dict) else None,
        )
        self.sessions[session_id] = updated
        # 视频事件仅更新内存，持久化在答题时一并进行，避免高频写入打爆数据库
        return updated

    def record_speech_chunk(self, session_id: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        session = self.sessions.get(session_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}

        audio_base64 = str(payload.get("audio_base64", "")).strip()
        if not audio_base64:
            return HTTPStatus.BAD_REQUEST, {"error": "audio_payload_missing", "message": "缺少 audio_base64。"}

        try:
            audio_bytes = _decode_audio_base64(audio_base64)
        except ValueError as error:
            return HTTPStatus.BAD_REQUEST, {"error": "invalid_audio_payload", "message": str(error)}

        target_sample_rate = payload.get("target_sample_rate", 16000)
        if target_sample_rate in (0, None):
            target_sample_rate = None
        elif not isinstance(target_sample_rate, int):
            return HTTPStatus.BAD_REQUEST, {"error": "invalid_target_sample_rate", "message": "target_sample_rate 必须是整数。"}

        analysis = analyze_speech(audio_bytes, target_sample_rate=target_sample_rate)
        chunk_metrics = chunk_metrics_from_analysis(analysis)

        current_state = self.speech_aggregates.get(session_id, SpeechAggregateState())
        next_state = merge_chunk_metrics(current_state, chunk_metrics)
        self.speech_aggregates[session_id] = next_state

        if self.repo:
            self.repo.save_speech_aggregate(session_id, next_state)

        return HTTPStatus.OK, {
            "chunk": chunk_metrics.to_dict(),
            "cumulative": summarize_cumulative_metrics(next_state).to_dict(),
        }


def handle_api_request(
    store: SessionStore,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    user_id: str = "",
    auth: AuthContext | None = None,
) -> tuple[int, dict[str, Any]]:
    parsed_url = urlparse(path)
    path_parts = [part for part in parsed_url.path.split("/") if part]
    body = payload or {}

    # 认证路由
    if method == "POST" and path_parts == ["api", "auth", "login"]:
        return _handle_login(body)

    if method == "POST" and path_parts == ["api", "auth", "register"]:
        return _handle_register(body)

    if method == "POST" and path_parts == ["api", "auth", "refresh"]:
        return _handle_refresh(body)

    if method == "POST" and path_parts == ["api", "auth", "logout"]:
        return _handle_logout(auth)

    if method == "GET" and path_parts == ["api", "auth", "me"]:
        if auth is None:
            return HTTPStatus.UNAUTHORIZED, {"error": "authentication_required"}
        return HTTPStatus.OK, {
            "user": {
                "id": auth.user_id,
                "email": auth.email,
                "full_name": auth.full_name or "",
            }
        }

    if method == "GET" and path_parts == ["api", "sessions"]:
        sessions = store.list_sessions(user_id)
        return HTTPStatus.OK, {"sessions": sessions}

    if method == "GET" and path_parts == ["api", "prep-sessions"]:
        if store.prep_repo:
            prep_sessions = store.prep_repo.list_prep_sessions(user_id)
        else:
            prep_sessions = [
                {"id": pid, "candidate_name": p.candidate_name, "ready": p.ready, "created_at": ""}
                for pid, p in store.prep_sessions.items()
            ]
        return HTTPStatus.OK, {"prep_sessions": prep_sessions}

    if method == "DELETE" and len(path_parts) == 3 and path_parts[:2] == ["api", "sessions"]:
        success = store.delete_session(path_parts[2], user_id)
        if not success:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        return HTTPStatus.OK, {"message": "session_deleted"}

    if method == "GET" and len(path_parts) == 3 and path_parts[:2] == ["api", "sessions"]:
        session = store.get(path_parts[2], user_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        return HTTPStatus.OK, serialize_session(session, _get_speech_cumulative(store, path_parts[2]))

    if (
        method == "GET"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "report"
    ):
        session = store.get(path_parts[2], user_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        speech_metrics = _get_speech_cumulative(store, path_parts[2])
        report, report_llm_status = generate_report(session, speech_metrics)
        return HTTPStatus.OK, {"report": report, "llm_status": report_llm_status if report_llm_status == "ok" else session.llm_status}

    if method == "POST" and path_parts == ["api", "sessions"]:
        session = store.create(body, user_id=user_id)
        return HTTPStatus.CREATED, serialize_session(session)

    if method == "POST" and path_parts == ["api", "prep-sessions", "resume"]:
        return store.create_prep(body, user_id=user_id)

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "prep-sessions"]
        and path_parts[3] == "followups"
    ):
        prep = store.record_followup(path_parts[2], body, user_id)
        if prep is None:
            return HTTPStatus.NOT_FOUND, {"error": "prep_session_not_found"}
        return HTTPStatus.OK, serialize_prep_session(prep)

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "prep-sessions"]
        and path_parts[3] == "interview-session"
    ):
        session = store.create_from_prep(path_parts[2], body, user_id=user_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "prep_session_not_found"}
        return HTTPStatus.CREATED, serialize_session(session)

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "answers"
    ):
        session = store.record_answer(path_parts[2], body, user_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        speech_metrics = _get_speech_cumulative(store, path_parts[2])
        response = serialize_session(session, speech_metrics)
        report, report_llm_status = generate_report(session, speech_metrics)
        response["report"] = report
        response["llm_status"] = report_llm_status if report_llm_status == "ok" else response.get("llm_status", "fallback")
        return HTTPStatus.OK, response

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "livekit-token"
    ):
        session = store.get(path_parts[2], user_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        try:
            token = create_livekit_token(
                room=session.meeting_room,
                participant_name=str(body.get("participant_name", session.candidate_name)),
                participant_role=str(body.get("participant_role", "candidate")),
            )
        except LiveKitConfigError as error:
            return HTTPStatus.SERVICE_UNAVAILABLE, {"error": "livekit_not_configured", "message": str(error)}
        return HTTPStatus.OK, token

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "speech-chunks"
    ):
        return store.record_speech_chunk(path_parts[2], body)

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "video-events"
    ):
        session = store.record_video_event(path_parts[2], body)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        return HTTPStatus.OK, serialize_session(session, _get_speech_cumulative(store, path_parts[2]))

    if (
        method == "GET"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "video"
    ):
        return _handle_video_download(store, path_parts[2], user_id)

    # Mock session creation - 快速创建测试面试
    if method == "POST" and path_parts == ["api", "mock-session"]:
        _dbg(f"[ROUTE] mock-session user_id={user_id!r}", flush=True)
        return _create_mock_session(store, body, user_id=user_id)

    print(f"[ROUTE] 404 NOT FOUND: {method} {path} path_parts={path_parts}", flush=True)
    return HTTPStatus.NOT_FOUND, {"error": "not_found"}


# Mock 数据 - 用于快速调试
MOCK_RESUMES = {
    "frontend": """# 李明 - 高级前端工程师

目标岗位：高级前端工程师 / 前端架构方向

工作年限：6 年。常用技术：TypeScript、React、Vite、Node.js、Vitest、Playwright。

最近项目：负责 B2B 数据分析平台前端架构升级，将多页配置台改造为模块化工作台，沉淀表单 schema、权限菜单、图表组件和前端监控。

核心成果：首屏加载时间从 3.8 秒降至 1.6 秒；将关键页面 E2E 覆盖率从 0 提升到 65%；推动代码评审规范和组件文档落地。

可追问点：复杂表单状态管理、权限控制、性能优化、跨团队协作、前端测试策略。
""",
    "backend": """# 陈宇 - 后端平台工程师

目标岗位：Python 后端工程师 / 平台工程方向

工作年限：5 年。常用技术：Python、FastAPI、PostgreSQL、Redis、Celery、Docker、Kubernetes。

最近项目：设计并实现企业内部任务编排平台，支持异步任务、重试、审计日志、租户隔离和指标告警。

核心成果：任务失败定位时间从小时级降到分钟级；通过连接池和批处理将高峰期 API P95 从 900ms 降到 240ms。

可追问点：数据库索引设计、异步任务一致性、接口限流、容器部署、故障排查案例。
""",
    "ai": """# 赵楠 - 机器学习工程师

目标岗位：机器学习工程师 / 多模态算法方向

工作年限：3 年。常用技术：PyTorch、Transformers、OpenCV、PaddleOCR、向量检索、模型评测。

最近项目：负责面向工业质检的图像异常检测系统，构建数据清洗、训练、离线评测和在线推理服务。

核心成果：缺陷召回率从 82% 提升到 93%；通过蒸馏和 TensorRT 将单图推理耗时从 120ms 降到 38ms。

可追问点：数据不平衡、模型上线监控、误报漏报分析、视觉模型优化、多模态应用边界。
""",
    "pm": """# 王欣 - AI 产品经理

目标岗位：AI 产品经理 / 智能应用方向

工作年限：4 年。常用领域：LLM 应用、RAG、标注体系、B 端产品设计、数据分析。

最近项目：从 0 到 1 推动客服知识库助手，负责需求访谈、数据闭环、评测集设计、灰度策略和运营看板。

核心成果：试点团队平均响应时长降低 28%；建立命中率、幻觉率、人工接管率等评估指标。

可追问点：如何定义 AI 产品效果、如何处理模型失败、评测集建设、跨部门推进、隐私与合规边界。
""",
}

MOCK_FOLLOWUP_ANSWERS = {
    "frontend": "岗位：高级前端工程师\n岗位描述：负责 Web 前端开发，熟悉 React/Vue 框架，有良好的工程化实践。要求有架构设计经验，能推动团队技术规范落地。\n面试目标：评估前端架构能力、工程化实践、性能优化和团队协作经验。",
    "backend": "岗位：后端平台工程师\n岗位描述：负责服务端开发，熟悉 Python/Java/Go，有分布式系统经验。要求有高并发系统设计能力，熟悉微服务架构。\n面试目标：评估后端系统设计、数据库优化、异步任务处理和故障排查能力。",
    "ai": "岗位：机器学习工程师\n岗位描述：负责 LLM 应用开发，熟悉 RAG、Agent、Prompt Engineering。要求有模型落地经验，能独立完成从训练到部署的全流程。\n面试目标：评估模型落地能力、多模态应用、数据工程和工程化实践。",
    "pm": "岗位：AI 产品经理\n岗位描述：负责产品规划和迭代，有用户研究、数据分析和跨团队协作经验。要求有 AI 产品经验，能独立推动产品从 0 到 1。\n面试目标：评估产品思维、数据驱动决策、跨团队推进和 AI 应用理解。",
}

def _handle_login(body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    """处理登录请求"""
    email = str(body.get("email", "")).strip()
    password = str(body.get("password", "")).strip()

    if not email or not password:
        return HTTPStatus.BAD_REQUEST, {
            "error": "missing_fields",
            "message": "请提供邮箱和密码",
        }

    try:
        result = login(email, password)
        return HTTPStatus.OK, result
    except InvalidCredentialsError as e:
        return HTTPStatus.UNAUTHORIZED, {
            "error": e.code,
            "message": e.message,
        }
    except AuthError as e:
        return HTTPStatus.BAD_REQUEST, {
            "error": e.code,
            "message": e.message,
        }


def _handle_register(body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    """处理注册请求"""
    email = str(body.get("email", "")).strip()
    password = str(body.get("password", "")).strip()
    full_name = str(body.get("full_name", "")).strip()

    if not email or not password:
        return HTTPStatus.BAD_REQUEST, {
            "error": "missing_fields",
            "message": "请提供邮箱和密码",
        }

    if len(password) < 6:
        return HTTPStatus.BAD_REQUEST, {
            "error": "weak_password",
            "message": "密码至少需要 6 个字符",
        }

    try:
        result = register(email, password, full_name)
        return HTTPStatus.CREATED, result
    except EmailAlreadyRegisteredError as e:
        return HTTPStatus.CONFLICT, {
            "error": e.code,
            "message": e.message,
        }
    except WeakPasswordError as e:
        return HTTPStatus.BAD_REQUEST, {
            "error": e.code,
            "message": e.message,
        }
    except AuthError as e:
        return HTTPStatus.BAD_REQUEST, {
            "error": e.code,
            "message": e.message,
        }


def _handle_refresh(body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    """处理刷新 token 请求"""
    refresh_token = str(body.get("refresh_token", "")).strip()

    if not refresh_token:
        return HTTPStatus.BAD_REQUEST, {
            "error": "missing_fields",
            "message": "请提供 refresh_token",
        }

    result = refresh_session(refresh_token)
    if result is None:
        return HTTPStatus.UNAUTHORIZED, {
            "error": "refresh_failed",
            "message": "刷新失败，请重新登录",
        }

    return HTTPStatus.OK, result


def _handle_logout(auth: AuthContext | None) -> tuple[int, dict[str, Any]]:
    """处理退出登录请求"""
    if auth is None:
        return HTTPStatus.OK, {"message": "已退出"}

    # Supabase 的 sign_out 需要 token，但前端已经清除了
    # 这里主要返回成功响应，前端会清除本地存储
    return HTTPStatus.OK, {"message": "已退出登录"}


def _create_mock_session(store: SessionStore, body: dict[str, Any], user_id: str = "") -> tuple[int, dict[str, Any]]:
    """使用 mock 数据快速创建面试 session，走完整 PrepSession 流程"""
    _dbg(f"[_create_mock_session] repo={store.repo is not None} prep_repo={store.prep_repo is not None} user_id={user_id!r}", flush=True)
    template = str(body.get("template", "frontend"))
    candidate_name = str(body.get("candidate_name", "测试候选人"))
    enable_video_observation = bool(body.get("enable_video_observation", True))

    resume = MOCK_RESUMES.get(template, MOCK_RESUMES["frontend"])
    answer = MOCK_FOLLOWUP_ANSWERS.get(template, MOCK_FOLLOWUP_ANSWERS["frontend"])

    # 1. 创建 PrepSession（与正常流程一致）
    prep = create_prep_session(
        candidate_name=candidate_name,
        resume_markdown=resume,
        user_id=user_id,
    )

    # 2. 用预设回答完成追问，标记 ready
    prep = advance_followup(prep, answer)
    store.prep_sessions[prep.id] = prep
    if store.prep_repo:
        if not store.prep_repo.save_prep_session(prep, user_id):
            raise PersistenceError(f"Failed to save prep session {prep.id}")

    # 3. 从 PrepSession 创建 InterviewSession（与正常流程一致）
    session = store.create_from_prep(
        prep.id,
        {
            "enable_video_observation": enable_video_observation,
        },
        user_id=user_id,
    )
    if session is None:
        return HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "mock_session_creation_failed"}

    return HTTPStatus.CREATED, serialize_session(session)


def create_server(host: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    from backend.auth.supabase_client import get_service_client
    from backend.interview.config import get_supabase_config
    service_client = get_service_client()
    if service_client:
        print("[startup] Supabase service client initialized, DB persistence enabled", flush=True)
    else:
        supabase_cfg = get_supabase_config()
        if supabase_cfg.get("url") and supabase_cfg.get("anon_key") and not supabase_cfg.get("service_role_key"):
            print("[startup] WARNING: SUPABASE_SERVICE_ROLE_KEY 未配置！", flush=True)
            print("[startup]   请在 .env 中添加 SUPABASE_SERVICE_ROLE_KEY（从 Supabase Dashboard → Settings → API → service_role 获取）", flush=True)
            print("[startup]   当前 database 持久化已禁用，session 仅保存在内存中，服务重启后将丢失。", flush=True)
        else:
            print("[startup] WARNING: Supabase service client NOT available, DB persistence disabled", flush=True)
    repo = SessionRepository(service_client) if service_client else None
    prep_repo = PrepSessionRepository(service_client) if service_client else None
    store = SessionStore(repo, prep_repo)
    auth_middleware = AuthMiddleware(require_auth=is_auth_required())

    class InterviewApiHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:
            _dbg(f"[REQ] OPTIONS {self.path}", flush=True)
            self._send_json({}, HTTPStatus.NO_CONTENT)

        def do_GET(self) -> None:
            try:
                _dbg(f"[REQ] GET {self.path}", flush=True)
                auth = self._authenticate()
                if auth is None and auth_middleware.require_auth:
                    self._send_json({"error": "authentication_required"}, HTTPStatus.UNAUTHORIZED)
                    return
                user_id = auth.user_id if auth else ""
                status, body = handle_api_request(store, "GET", self.path, user_id=user_id, auth=auth)
                _dbg(f"[RES] GET {self.path} -> {status} user_id={user_id!r}", flush=True)
                self._send_json(body, HTTPStatus(status))
            except Exception as e:
                import traceback
                traceback.print_exc()
                try:
                    self._send_json({"error": "internal_error", "message": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                except Exception:
                    pass

        def do_POST(self) -> None:
            try:
                _dbg(f"[REQ] POST {self.path}", flush=True)
                if self._is_public_auth_route():
                    auth = None
                else:
                    auth = self._authenticate()
                    if auth is None and auth_middleware.require_auth:
                        self._send_json({"error": "authentication_required"}, HTTPStatus.UNAUTHORIZED)
                        return

                user_id = auth.user_id if auth else ""

                # 视频 raw binary body 上传
                if self._is_video_upload_route():
                    _dbg(f"[REQ] POST video upload session_id={self._extract_session_id()}", flush=True)
                    status, body = self._handle_video_upload_raw(user_id)
                    self._send_json(body, HTTPStatus(status))
                    return

                payload = self._read_json()
                _dbg(f"[REQ] POST {self.path} user_id={user_id!r} auth={auth is not None}", flush=True)
                status, body = handle_api_request(store, "POST", self.path, payload, user_id=user_id, auth=auth)
                _dbg(f"[RES] POST {self.path} -> {status}", flush=True)
                self._send_json(body, HTTPStatus(status))
            except PersistenceError as e:
                try:
                    self._send_json({"error": "persistence_failed", "message": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                except Exception:
                    pass
            except Exception as e:
                import traceback
                traceback.print_exc()
                try:
                    self._send_json({"error": "internal_error", "message": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                except Exception:
                    pass

        def do_DELETE(self) -> None:
            try:
                auth = self._authenticate()
                if auth is None and auth_middleware.require_auth:
                    self._send_json({"error": "authentication_required"}, HTTPStatus.UNAUTHORIZED)
                    return
                user_id = auth.user_id if auth else ""
                status, body = handle_api_request(store, "DELETE", self.path, user_id=user_id, auth=auth)
                self._send_json(body, HTTPStatus(status))
            except Exception as e:
                import traceback
                traceback.print_exc()
                try:
                    self._send_json({"error": "internal_error", "message": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                except Exception:
                    pass

        def _is_public_auth_route(self) -> bool:
            """检查是否是公开的认证路由"""
            path = self.path.split("?")[0]  # 去掉查询参数
            public_routes = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/logout"]
            return path in public_routes

        def _is_video_upload_route(self) -> bool:
            """检查是否是视频上传路由（raw binary body）"""
            path = self.path.split("?")[0]
            parts = [p for p in path.split("/") if p]
            return (
                len(parts) == 4
                and parts[:2] == ["api", "sessions"]
                and parts[3] == "video"
            )

        def _extract_session_id(self) -> str:
            """从路径中提取 session_id"""
            path = self.path.split("?")[0]
            parts = [p for p in path.split("/") if p]
            return parts[2] if len(parts) >= 3 else ""

        def _handle_video_upload_raw(self, user_id: str) -> tuple[int, dict[str, Any]]:
            """处理 raw binary body 视频上传"""
            if not is_valid_uuid(user_id):
                return HTTPStatus.UNAUTHORIZED, {"error": "authentication_required"}

            session_id = self._extract_session_id()
            session = store.get(session_id, user_id)
            if session is None:
                return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}

            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length == 0:
                return HTTPStatus.BAD_REQUEST, {"error": "empty_body"}
            if content_length > MAX_VIDEO_SIZE:
                return HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "video_too_large", "message": f"视频文件超过 {MAX_VIDEO_SIZE // (1024 * 1024)}MB 上限"}

            try:
                video_bytes = self.rfile.read(content_length)
            except Exception as error:
                return HTTPStatus.BAD_REQUEST, {"error": "read_failed", "message": str(error)}

            try:
                video_path = storage_upload_video(user_id, session_id, video_bytes)
            except Exception as error:
                _dbg(f"[video_upload] Storage upload failed: {error}", flush=True)
                updated = replace(session, video_upload_failed=True)
                store.sessions[session_id] = updated
                if store.repo:
                    store.repo.save_session(updated, user_id)
                return HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "storage_upload_failed", "message": str(error)}

            # 优先使用前端上报的真实录制时长，fallback 为码率估算
            query_params = parse_qs(urlparse(self.path).query)
            client_duration = query_params.get("duration_sec", [None])[0]
            duration_sec = float(client_duration) if client_duration else None
            if duration_sec is None:
                estimated_duration = content_length / (200_000 / 8) if content_length > 0 else 0
                duration_sec = round(estimated_duration, 1)

            updated = replace(session, video_path=video_path, video_duration_sec=duration_sec, video_upload_failed=False)
            store.sessions[session_id] = updated
            if store.repo:
                store.repo.save_session(updated, user_id)

            return HTTPStatus.OK, {"video_path": video_path, "video_duration_sec": updated.video_duration_sec}

        def _authenticate(self) -> AuthContext | None:
            """从请求头中提取并验证认证信息"""
            headers = dict(self.headers)
            return auth_middleware.authenticate(headers)

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length == 0:
                return {}
            raw = self.rfile.read(length).decode("utf-8")
            return json.loads(raw)

        def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                if status != HTTPStatus.NO_CONTENT:
                    self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                return

    return ThreadingHTTPServer((host, port), InterviewApiHandler)


def serialize_session(session: InterviewSession, speech_metrics: SpeechCumulativeMetrics | None = None) -> dict[str, Any]:
    body = asdict(session)
    body["current_question"] = asdict(session.current_question) if session.current_question else None
    body["video_summary"] = summarize_video(session)
    if speech_metrics is not None:
        body["speech_summary"] = speech_metrics.to_dict()
    return body


def _get_speech_cumulative(store: SessionStore, session_id: str) -> SpeechCumulativeMetrics | None:
    state = store.speech_aggregates.get(session_id)
    if state is None or state.chunk_count == 0:
        return None
    return summarize_cumulative_metrics(state)


def generate_report(session: InterviewSession, speech_metrics: SpeechCumulativeMetrics | None = None) -> tuple[str, str]:
    fallback_report = generate_markdown_report(session, speech_metrics)
    llm_result = LlmClient.from_env().complete_json(
        "你是面试纪要助手。请输出 JSON，字段 report_markdown。纪要必须基于问题、回答、语音观察和非语言观察信号；语音观察和非语言观察只能作为可复核观察，禁止输出 hire/no-hire、录用、不录用或自动评分结论。",
        json.dumps(
            {
                "session": serialize_session(session, speech_metrics),
                "fallback_report": fallback_report,
            },
            ensure_ascii=False,
        ),
    )
    if llm_result.status != "ok" or not llm_result.data:
        return fallback_report, "fallback"

    report = str(llm_result.data.get("report_markdown", "")).strip()
    if not report or _contains_forbidden_hiring_language(report):
        return fallback_report, "fallback"
    return report, "ok"


def _questions_from_llm(data: dict[str, Any]) -> list[InterviewQuestion]:
    questions: list[InterviewQuestion] = []
    raw_questions = data.get("questions", [])
    if not isinstance(raw_questions, list):
        return questions
    for index, item in enumerate(raw_questions, start=1):
        if not isinstance(item, dict):
            continue
        prompt = str(item.get("prompt", "")).strip()
        if not prompt:
            continue
        questions.append(
            InterviewQuestion(
                id=f"q_{index:03d}",
                dimension=str(item.get("dimension", "综合能力")),
                prompt=prompt,
                follow_ups=[str(value) for value in item.get("follow_ups", []) if str(value).strip()] or ["请补充一个具体例子。"],
                evidence_hints=[str(value) for value in item.get("evidence_hints", []) if str(value).strip()] or ["关注回答是否可追溯到具体经历。"],
            )
        )
    return questions


def _contains_forbidden_hiring_language(text: str) -> bool:
    lowered = text.lower()
    forbidden_terms = ["hire", "no-hire", "no hire", "录用", "不录用", "自动评分"]
    return any(term in lowered for term in forbidden_terms)


def _decode_audio_base64(value: str) -> bytes:
    candidate = value.split(",", 1)[1] if "," in value else value
    try:
        decoded = base64.b64decode(candidate, validate=True)
    except binascii.Error as error:
        raise ValueError("audio_base64 不是合法的 base64。") from error
    if not decoded:
        raise ValueError("audio_base64 解码后为空。")
    return decoded


MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200MB


def _handle_video_download(store: SessionStore, session_id: str, user_id: str) -> tuple[int, dict[str, Any]]:
    """返回面试视频的签名 URL"""
    if not is_valid_uuid(user_id):
        return HTTPStatus.UNAUTHORIZED, {"error": "authentication_required"}

    session = store.get(session_id, user_id)
    if session is None:
        return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}

    if not session.video_path:
        return HTTPStatus.NOT_FOUND, {"error": "video_not_found"}

    try:
        signed_url = get_video_signed_url(user_id, session_id, expires_in=14400)
    except Exception as error:
        return HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "storage_error", "message": str(error)}

    return HTTPStatus.OK, {"video_url": signed_url}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the AI-assisted interview MVP API server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = create_server(args.host, args.port)
    print(f"Serving interview API on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
