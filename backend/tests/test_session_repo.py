import json
import unittest

from backend.database.session_repo import SessionRepository
from backend.interview.question_engine import InterviewQuestion
from backend.interview.session import create_interview_session


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


if __name__ == "__main__":
    unittest.main()
