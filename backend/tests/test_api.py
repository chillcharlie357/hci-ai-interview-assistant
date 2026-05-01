import json
import unittest

from backend.interview.api import SessionStore, handle_api_request


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.store = SessionStore()

    def test_creates_session_and_records_answer(self):
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "张三",
                "resume": "候选人负责 AI 面试平台，包含问题生成和面试纪要。",
                "job_description": "岗位是 AI 产品全栈工程师，需要 Python、TypeScript 和 LLM 应用经验。",
                "interview_goal": "评估专业能力、项目经验、技术实现能力、应变能力。",
            },
            expected_status=201,
        )

        self.assertEqual(created["candidate_name"], "张三")
        self.assertEqual(created["role"], "AI 产品全栈工程师")
        self.assertGreaterEqual(len(created["questions"]), 6)
        self.assertEqual(created["current_question"]["id"], "q_001")

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {
                "text": "我主要负责问题生成和纪要模块，保证结论可以追溯到原始回答。",
                "duration_sec": 80,
            },
        )

        self.assertEqual(len(updated["answers"]), 1)
        self.assertEqual(updated["answers"][0]["question_id"], "q_001")
        self.assertEqual(updated["current_question"]["id"], "q_002")
        self.assertIn("# 智能面试纪要", updated["report"])

    def test_returns_404_for_unknown_session(self):
        response = self.request(
            "POST",
            "/api/sessions/missing/answers",
            {"text": "hello", "duration_sec": 1},
            expected_status=404,
        )

        self.assertEqual(response["error"], "session_not_found")

    def request(self, method, path, payload=None, expected_status=200):
        status, body = handle_api_request(self.store, method, path, payload or {})
        self.assertEqual(status, expected_status, json.dumps(body, ensure_ascii=False))
        return body


if __name__ == "__main__":
    unittest.main()
