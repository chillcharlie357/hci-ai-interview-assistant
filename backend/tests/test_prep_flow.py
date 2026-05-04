import base64
import json
import os
import unittest
from unittest.mock import patch

from backend.interview.api import SessionStore, handle_api_request
from backend.interview.llm_client import LlmResult


class FakeCompletedProcess:
    def __init__(self, stdout="# 简历\n候选人做过 AI 面试平台", stderr="", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


class PrepFlowTest(unittest.TestCase):
    def setUp(self):
        self.store = SessionStore()

    @patch("backend.interview.document_extractor.subprocess.run")
    def test_uploads_resume_and_returns_prep_session(self, run_mock):
        run_mock.return_value = FakeCompletedProcess()

        response = self.request(
            "POST",
            "/api/prep-sessions/resume",
            {
                "candidate_name": "张三",
                "file_name": "resume.pdf",
                "content_type": "application/pdf",
                "data_base64": base64.b64encode(b"%PDF sample").decode("ascii"),
            },
            expected_status=201,
        )

        self.assertIn("prep_session_id", response)
        self.assertIn("AI 面试平台", response["resume_markdown_preview"])
        self.assertEqual(response["llm_status"], "fallback")
        # 验证调用的是 mineru 命令
        self.assertIn("flash-extract", run_mock.call_args.args[0])

    def test_rejects_unsupported_resume_format(self):
        response = self.request(
            "POST",
            "/api/prep-sessions/resume",
            {
                "candidate_name": "张三",
                "file_name": "resume.exe",
                "content_type": "application/octet-stream",
                "data_base64": base64.b64encode(b"bad").decode("ascii"),
            },
            expected_status=400,
        )

        self.assertEqual(response["error"], "unsupported_resume_format")

    @patch("backend.interview.document_extractor.subprocess.run")
    def test_followup_submits_job_info_and_becomes_ready(self, run_mock):
        run_mock.return_value = FakeCompletedProcess()
        prep = self.create_prep()

        updated = self.request(
            "POST",
            f"/api/prep-sessions/{prep['prep_session_id']}/followups",
            {"answer": "岗位：AI 产品全栈工程师\n岗位描述：负责 AI 面试平台工程化。\n面试目标：评估 Python、TypeScript、LLM 应用。"},
        )

        self.assertTrue(updated["ready"])
        self.assertEqual(updated["ready_summary"]["role"], "AI 产品全栈工程师")
        self.assertEqual(updated["llm_status"], "fallback")

    @patch("backend.interview.document_extractor.subprocess.run")
    @patch("backend.interview.api.LlmClient.from_env")
    def test_creates_interview_session_with_report_visibility(self, from_env_mock, run_mock):
        run_mock.return_value = FakeCompletedProcess()
        from_env_mock.return_value.complete_json.return_value = LlmResult(status="fallback", data=None)
        prep = self.create_prep()
        self.request(
            "POST",
            f"/api/prep-sessions/{prep['prep_session_id']}/followups",
            {"answer": "岗位是 AI 产品全栈工程师，考察 Python、TypeScript 和 LLM 应用。"},
        )

        created = self.request(
            "POST",
            f"/api/prep-sessions/{prep['prep_session_id']}/interview-session",
            {
                "report_visibility": "shared_with_candidate",
                "use_llm_questions": False,
                "enable_video_observation": True,
            },
            expected_status=201,
        )

        self.assertEqual(created["report_visibility"], "shared_with_candidate")
        self.assertEqual(created["meeting_room"], f"interview-{created['id']}")
        self.assertTrue(created["enable_video_observation"])
        self.assertGreaterEqual(len(created["questions"]), 6)

    @patch("backend.interview.document_extractor.subprocess.run")
    def test_extracts_role_from_answer(self, run_mock):
        run_mock.return_value = FakeCompletedProcess()
        prep = self.create_prep()

        updated = self.request(
            "POST",
            f"/api/prep-sessions/{prep['prep_session_id']}/followups",
            {"answer": "招聘端和候选人端都需要顺畅体验。职位是 AI 产品工程师，需要 TypeScript 和 LLM 应用。"},
        )

        self.assertEqual(updated["ready_summary"]["role"], "AI 产品工程师")

    @patch.dict(
        os.environ,
        {
            "INTERVIEW_DISABLE_DOTENV": "1",
            "LIVEKIT_URL": "wss://livekit.example.test",
            "LIVEKIT_API_KEY": "lk-key",
            "LIVEKIT_API_SECRET": "lk-secret",
        },
        clear=True,
    )
    @patch("backend.interview.document_extractor.subprocess.run")
    def test_generates_livekit_token_when_configured(self, run_mock):
        run_mock.return_value = FakeCompletedProcess()
        session = self.create_interview_session()

        response = self.request(
            "POST",
            f"/api/sessions/{session['id']}/livekit-token",
            {"participant_name": "张三", "participant_role": "candidate"},
        )

        self.assertEqual(response["url"], "wss://livekit.example.test")
        self.assertEqual(response["room"], session["meeting_room"])
        self.assertGreater(len(response["token"]), 40)

    @patch("backend.interview.document_extractor.subprocess.run")
    def test_candidate_report_visibility_is_enforced(self, run_mock):
        run_mock.return_value = FakeCompletedProcess()
        session = self.create_interview_session(report_visibility="recruiter_only")
        self.request(
            "POST",
            f"/api/sessions/{session['id']}/answers",
            {"text": "我负责问题生成。", "duration_sec": 20},
        )

        hidden = self.request(
            "GET",
            f"/api/sessions/{session['id']}/report?viewer=candidate",
            expected_status=403,
        )
        visible = self.request(
            "GET",
            f"/api/sessions/{session['id']}/report?viewer=recruiter",
            expected_status=200,
        )

        self.assertEqual(hidden["error"], "report_not_shared")
        self.assertIn("# 智能面试纪要", visible["report"])

    def create_prep(self):
        return self.request(
            "POST",
            "/api/prep-sessions/resume",
            {
                "candidate_name": "张三",
                "file_name": "resume.pdf",
                "content_type": "application/pdf",
                "data_base64": base64.b64encode(b"%PDF sample").decode("ascii"),
            },
            expected_status=201,
        )

    def create_interview_session(self, report_visibility="recruiter_only"):
        prep = self.create_prep()
        self.request(
            "POST",
            f"/api/prep-sessions/{prep['prep_session_id']}/followups",
            {"answer": "岗位是 AI 产品全栈工程师，考察 Python 和 LLM 应用。"},
        )
        return self.request(
            "POST",
            f"/api/prep-sessions/{prep['prep_session_id']}/interview-session",
            {"report_visibility": report_visibility},
            expected_status=201,
        )

    def request(self, method, path, payload=None, expected_status=200):
        status, body = handle_api_request(self.store, method, path, payload or {})
        self.assertEqual(status, expected_status, json.dumps(body, ensure_ascii=False))
        return body


if __name__ == "__main__":
    unittest.main()
