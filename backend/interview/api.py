from __future__ import annotations

from dataclasses import asdict, replace
import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from backend.interview.answer_analysis import analyze_answer_text
from backend.interview.llm_client import LlmClient
from backend.interview.question_engine import InterviewQuestion, generate_interview_questions
from backend.interview.session import (
    InterviewSession,
    create_interview_session,
    generate_markdown_report,
    record_video_event,
    record_answer,
    summarize_video,
)


class SessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, InterviewSession] = {}

    def create(self, payload: dict[str, Any]) -> InterviewSession:
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
        )
        session = replace(session, llm_status=llm_status)
        self.sessions[session.id] = session
        return session

    def get(self, session_id: str) -> InterviewSession | None:
        return self.sessions.get(session_id)

    def record_answer(self, session_id: str, payload: dict[str, Any]) -> InterviewSession | None:
        session = self.sessions.get(session_id)
        if session is None:
            return None
        answer_analysis = analyze_answer_text(str(payload.get("text", "")))
        updated = record_answer(
            session,
            text=str(payload.get("text", "")),
            duration_sec=int(payload.get("duration_sec", 0)),
            filler_word_count=answer_analysis.filler_word_count,
        )
        if answer_analysis.llm_status == "ok":
            updated = replace(updated, llm_status="ok")
        self.sessions[session_id] = updated
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
        return updated


def handle_api_request(
    store: SessionStore,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    path_parts = [part for part in urlparse(path).path.split("/") if part]
    body = payload or {}

    if method == "GET" and len(path_parts) == 3 and path_parts[:2] == ["api", "sessions"]:
        session = store.get(path_parts[2])
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        return HTTPStatus.OK, serialize_session(session)

    if method == "POST" and path_parts == ["api", "sessions"]:
        session = store.create(body)
        return HTTPStatus.CREATED, serialize_session(session)

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "answers"
    ):
        session = store.record_answer(path_parts[2], body)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        response = serialize_session(session)
        report, report_llm_status = generate_report(session)
        response["report"] = report
        response["llm_status"] = report_llm_status if report_llm_status == "ok" else response.get("llm_status", "fallback")
        return HTTPStatus.OK, response

    if (
        method == "POST"
        and len(path_parts) == 4
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "video-events"
    ):
        session = store.record_video_event(path_parts[2], body)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        return HTTPStatus.OK, serialize_session(session)

    return HTTPStatus.NOT_FOUND, {"error": "not_found"}


def create_server(host: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    store = SessionStore()

    class InterviewApiHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:
            self._send_json({}, HTTPStatus.NO_CONTENT)

        def do_GET(self) -> None:
            status, body = handle_api_request(store, "GET", self.path)
            self._send_json(body, HTTPStatus(status))

        def do_POST(self) -> None:
            payload = self._read_json()
            status, body = handle_api_request(store, "POST", self.path, payload)
            self._send_json(body, HTTPStatus(status))

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
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            if status != HTTPStatus.NO_CONTENT:
                self.wfile.write(raw)

    return ThreadingHTTPServer((host, port), InterviewApiHandler)


def serialize_session(session: InterviewSession) -> dict[str, Any]:
    body = asdict(session)
    body["current_question"] = asdict(session.current_question) if session.current_question else None
    body["video_summary"] = summarize_video(session)
    return body


def generate_report(session: InterviewSession) -> tuple[str, str]:
    fallback_report = generate_markdown_report(session)
    llm_result = LlmClient.from_env().complete_json(
        "你是面试纪要助手。请输出 JSON，字段 report_markdown。纪要必须基于问题、回答、事件和非语言观察信号；非语言观察只能作为可复核观察，禁止输出 hire/no-hire、录用、不录用或自动评分结论。",
        json.dumps(
            {
                "session": serialize_session(session),
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
