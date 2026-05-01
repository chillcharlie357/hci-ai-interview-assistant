from __future__ import annotations

from dataclasses import asdict
import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from backend.interview.question_engine import generate_interview_questions
from backend.interview.session import (
    InterviewSession,
    create_interview_session,
    generate_markdown_report,
    record_answer,
)


class SessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, InterviewSession] = {}

    def create(self, payload: dict[str, Any]) -> InterviewSession:
        question_set = generate_interview_questions(
            resume=str(payload.get("resume", "")),
            job_description=str(payload.get("job_description", "")),
            interview_goal=str(payload.get("interview_goal", "")),
        )
        session = create_interview_session(
            candidate_name=str(payload.get("candidate_name", "候选人")),
            role=question_set.role,
            questions=question_set.questions,
        )
        self.sessions[session.id] = session
        return session

    def get(self, session_id: str) -> InterviewSession | None:
        return self.sessions.get(session_id)

    def record_answer(self, session_id: str, payload: dict[str, Any]) -> InterviewSession | None:
        session = self.sessions.get(session_id)
        if session is None:
            return None
        updated = record_answer(
            session,
            text=str(payload.get("text", "")),
            duration_sec=int(payload.get("duration_sec", 0)),
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
        response["report"] = generate_markdown_report(session)
        return HTTPStatus.OK, response

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
    return body


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
