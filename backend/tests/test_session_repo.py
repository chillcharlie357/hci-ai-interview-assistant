import json
import unittest

from backend.database.session_repo import SessionRepository
from backend.interview.question_engine import InterviewQuestion
from backend.interview.session import create_interview_session, session_status_from_parts


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, rows, fail_summary=False):
        self.rows = rows
        self.fail_summary = fail_summary
        self.selected = ""
        self.upsert_payloads = []

    def select(self, fields):
        self.selected = fields
        return self

    def eq(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def upsert(self, payload):
        self.upsert_payloads.append(payload)
        return self

    def execute(self):
        if self.fail_summary and "total_questions" in self.selected:
            raise RuntimeError("column interview_sessions.total_questions does not exist")
        if self.upsert_payloads and self.fail_summary:
            payload = self.upsert_payloads[-1]
            if "total_questions" in payload or "status" in payload:
                raise RuntimeError("column interview_sessions.status does not exist")
        return _FakeResult(self.rows)


class _FakeClient:
    def __init__(self, rows, fail_summary=False):
        self.query = _FakeQuery(rows, fail_summary=fail_summary)

    def table(self, _name):
        return self.query


class SessionRepositoryMappingTest(unittest.TestCase):
    def test_session_mapping_persists_asr_context_terms(self):
        repo = SessionRepository(client=None)  # type: ignore[arg-type]
        session = create_interview_session(
            candidate_name="张三",
            role="AI/LLM 工程师",
            questions=[
                InterviewQuestion(
                    id="q_001",
                    dimension="RAG",
                    prompt="请介绍 RAG 系统。",
                    follow_ups=[],
                    evidence_hints=[],
                )
            ],
            asr_context_terms=["RAG", "TypeScript", "检索增强生成"],
        )

        data = repo._session_to_dict(session, "00000000-0000-0000-0000-000000000000")

        self.assertEqual(data["asr_context_terms"], ["RAG", "TypeScript", "检索增强生成"])
        self.assertEqual(data["total_questions"], 1)
        self.assertEqual(data["status"], "pending")
        round_tripped = repo._dict_to_session({
            **data,
            "questions": json.loads(data["questions"]),
            "answers": json.loads(data["answers"]),
            "events": json.loads(data["events"]),
            "created_at": "",
        })
        self.assertEqual(round_tripped.asr_context_terms, ["RAG", "TypeScript", "检索增强生成"])

    def test_session_mapping_persists_max_followup_rounds(self):
        repo = SessionRepository(client=None)  # type: ignore[arg-type]
        session = create_interview_session(
            candidate_name="张三",
            role="AI/LLM 工程师",
            questions=[],
            max_followup_rounds=3,
        )

        data = repo._session_to_dict(session, "00000000-0000-0000-0000-000000000000")

        self.assertEqual(data["max_followup_rounds"], 3)
        round_tripped = repo._dict_to_session({
            **data,
            "questions": json.loads(data["questions"]),
            "answers": json.loads(data["answers"]),
            "events": json.loads(data["events"]),
            "created_at": "",
        })
        self.assertEqual(round_tripped.max_followup_rounds, 3)

    def test_list_sessions_uses_summary_count_without_questions_payload(self):
        client = _FakeClient([
            {
                "id": "session-1",
                "candidate_name": "张三",
                "role": "AI/LLM 工程师",
                "created_at": "2026-06-13T12:00:00Z",
                "current_index": 1,
                "llm_status": "ready",
                "total_questions": 6,
                "status": "active",
            }
        ])
        repo = SessionRepository(client=client)  # type: ignore[arg-type]

        rows = repo.list_sessions("00000000-0000-0000-0000-000000000000")

        self.assertEqual(rows[0]["total_questions"], 6)
        self.assertEqual(rows[0]["status"], "active")
        self.assertNotIn("questions", rows[0])
        selected_fields = {field.strip() for field in client.query.selected.split(",")}
        self.assertIn("total_questions", selected_fields)
        self.assertIn("status", selected_fields)
        self.assertNotIn("questions", selected_fields)

    def test_list_sessions_falls_back_before_migration_is_applied(self):
        client = _FakeClient([
            {
                "id": "session-1",
                "candidate_name": "张三",
                "role": "AI/LLM 工程师",
                "created_at": "2026-06-13T12:00:00Z",
                "current_index": 1,
                "llm_status": "ready",
                "questions": [{"id": "q1"}, {"id": "q2"}],
            }
        ], fail_summary=True)
        repo = SessionRepository(client=client)  # type: ignore[arg-type]

        rows = repo.list_sessions("00000000-0000-0000-0000-000000000000")

        self.assertEqual(rows[0]["total_questions"], 2)
        self.assertEqual(rows[0]["status"], "active")
        self.assertNotIn("questions", rows[0])

    def test_save_session_falls_back_before_migration_is_applied(self):
        client = _FakeClient([{"id": "session-1"}], fail_summary=True)
        repo = SessionRepository(client=client)  # type: ignore[arg-type]
        session = create_interview_session(
            candidate_name="张三",
            role="AI/LLM 工程师",
            questions=[
                InterviewQuestion(
                    id="q_001",
                    dimension="RAG",
                    prompt="请介绍 RAG 系统。",
                    follow_ups=[],
                    evidence_hints=[],
                )
            ],
        )

        result = repo._upsert_session_data(repo._session_to_dict(
            session,
            "00000000-0000-0000-0000-000000000000",
        ))

        self.assertEqual(result.data, [{"id": "session-1"}])
        self.assertIn("total_questions", client.query.upsert_payloads[0])
        self.assertIn("status", client.query.upsert_payloads[0])
        self.assertNotIn("total_questions", client.query.upsert_payloads[1])
        self.assertNotIn("status", client.query.upsert_payloads[1])

    def test_session_status_from_parts_handles_progress_edges(self):
        self.assertEqual(
            session_status_from_parts(current_index=0, total_questions=5, answer_count=0),
            "pending",
        )
        self.assertEqual(
            session_status_from_parts(current_index=0, total_questions=5, answer_count=1),
            "active",
        )
        self.assertEqual(
            session_status_from_parts(current_index=2, total_questions=5, answer_count=2),
            "active",
        )
        self.assertEqual(
            session_status_from_parts(current_index=5, total_questions=5, answer_count=5),
            "completed",
        )


if __name__ == "__main__":
    unittest.main()
