import json
import unittest
from unittest.mock import patch

from backend.interview.api import SessionStore, handle_api_request
from backend.interview.llm_client import LlmResult


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

    def test_create_session_exposes_llm_fallback_status(self):
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "张三",
                "resume": "候选人负责 AI 面试平台。",
                "job_description": "岗位是 AI 产品全栈工程师。",
                "interview_goal": "评估项目经验。",
                "use_llm_questions": True,
            },
            expected_status=201,
        )

        self.assertEqual(created["llm_status"], "fallback")

    def test_records_video_event_and_keyframe_summary(self):
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "张三",
                "resume": "候选人负责 AI 面试平台。",
                "job_description": "岗位是 AI 产品全栈工程师。",
                "interview_goal": "评估项目经验。",
            },
            expected_status=201,
        )

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/video-events",
            {
                "timestamp": 12.5,
                "event_type": "low_light",
                "confidence": 0.82,
                "metrics": {
                    "face_present": True,
                    "brightness": 0.18,
                    "blur": 0.74,
                    "motion": 0.22,
                    "gaze_proxy": 0.61,
                    "head_pose_proxy": 0.31,
                    "blink_proxy": 0.1,
                    "nod_proxy": 0.0,
                    "hand_activity": 0.44,
                    "body_activity": 0.2,
                },
                "keyframe": {
                    "data_url": "data:image/jpeg;base64,abc",
                    "reason": "low_light",
                },
            },
        )

        self.assertEqual(len(updated["video_events"]), 1)
        self.assertEqual(len(updated["keyframes"]), 1)
        self.assertEqual(updated["video_summary"]["event_count"], 1)
        self.assertIn("low_light", updated["video_summary"]["event_types"])

    def test_report_includes_video_observations_without_hiring_language(self):
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "张三",
                "resume": "候选人负责 AI 面试平台。",
                "job_description": "岗位是 AI 产品全栈工程师。",
                "interview_goal": "评估项目经验。",
            },
            expected_status=201,
        )
        self.request(
            "POST",
            f"/api/sessions/{created['id']}/video-events",
            {
                "timestamp": 12.5,
                "event_type": "high_motion",
                "confidence": 0.8,
                "metrics": {"face_present": True, "brightness": 0.5, "blur": 0.3, "motion": 0.8},
            },
        )
        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {"text": "我负责问题生成。", "duration_sec": 30},
        )

        self.assertIn("非语言观察", updated["report"])
        self.assertNotIn("录用", updated["report"])
        self.assertNotIn("不录用", updated["report"])

    @patch("backend.interview.api.LlmClient.from_env")
    def test_answer_report_can_be_enhanced_by_openai_compatible_llm(self, from_env_mock):
        class FakeLlmClient:
            def complete_json(self, system_prompt, user_prompt):
                self.system_prompt = system_prompt
                self.user_prompt = user_prompt
                return LlmResult(status="ok", data={"report_markdown": "# LLM 增强纪要\n\n- 仅记录可复核观察。"})

        fake_client = FakeLlmClient()
        from_env_mock.return_value = fake_client
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "张三",
                "resume": "候选人负责 AI 面试平台。",
                "job_description": "岗位是 AI 产品全栈工程师。",
                "interview_goal": "评估项目经验。",
            },
            expected_status=201,
        )

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {"text": "我负责问题生成。", "duration_sec": 30},
        )

        self.assertEqual(updated["report"], "# LLM 增强纪要\n\n- 仅记录可复核观察。")
        self.assertEqual(updated["llm_status"], "ok")
        self.assertIn("report_markdown", fake_client.system_prompt)
        self.assertIn("我负责问题生成", fake_client.user_prompt)

    @patch("backend.interview.api.analyze_answer_text")
    def test_answer_metrics_use_llm_analysis_before_rule_fallback(self, analyze_mock):
        class Analysis:
            filler_word_count = 5
            llm_status = "ok"
            observations = ["LLM 判断存在 5 个填充表达"]

        analyze_mock.return_value = Analysis()
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "张三",
                "resume": "候选人负责 AI 面试平台。",
                "job_description": "岗位是 AI 产品全栈工程师。",
                "interview_goal": "评估项目经验。",
            },
            expected_status=201,
        )

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {"text": "我负责问题生成。", "duration_sec": 30},
        )

        self.assertEqual(updated["answers"][0]["filler_word_count"], 5)
        self.assertEqual(updated["llm_status"], "ok")
        analyze_mock.assert_called_once_with("我负责问题生成。")

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
