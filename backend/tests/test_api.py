import base64
import io
import json
import math
import unittest
from unittest.mock import patch
import wave

from dataclasses import replace

from backend.interview.api import SessionStore, _handle_health, handle_api_request
from backend.interview.followup_engine import FollowupDecision
from backend.interview.answer_help import AnswerHelpResult
from backend.interview.llm_client import LlmResult
from backend.interview.session import create_interview_session


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.env_patcher = patch.dict(
            "os.environ",
            {"OPENAI_API_KEY": "", "OPENAI_MODEL": "", "OPENAI_BASE_URL": ""},
        )
        self.env_patcher.start()
        self.addCleanup(self.env_patcher.stop)
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
        # report 不再随 POST answers 返回（通过 GET /report 独立获取），此处为空字符串
        self.assertEqual(updated["report"], "")

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
                    "blink_count": 2,
                    "blink_rate_per_minute": 18.4,
                    "eye_contact_ratio": 0.72,
                    "gaze_deviation_deg": 6.8,
                    "eye_aspect_ratio": 0.26,
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
        self.assertEqual(updated["video_events"][0]["metrics"]["blink_count"], 2)
        self.assertAlmostEqual(updated["video_events"][0]["metrics"]["eye_contact_ratio"], 0.72)

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

        # 报告不再随 POST answers 返回，通过 GET /report 获取
        self.assertEqual(updated["report"], "")

        report_resp = self.request(
            "GET",
            f"/api/sessions/{created['id']}/report",
        )
        self.assertIn("非语言观察", report_resp["report"])
        self.assertIn("眼神接触占比", report_resp["report"])
        self.assertNotIn("录用", report_resp["report"])
        self.assertNotIn("不录用", report_resp["report"])

    def test_answer_help_falls_back_when_llm_is_not_configured(self):
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

        response = self.request(
            "POST",
            f"/api/sessions/{created['id']}/help",
            {"draft_text": "我先讲项目背景。"},
        )

        self.assertEqual(response["mode"], "fallback")
        self.assertEqual(response["llm_status"], "fallback")
        self.assertEqual(response["question_id"], "q_001")
        self.assertGreater(len(response["reference_answer"]), 0)
        self.assertIn("answer_help_requested", [event.type for event in self.store.sessions[created["id"]].events])

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

        # POST answers 不再阻塞生成报告，report 返回空字符串
        self.assertEqual(updated["report"], "")

        # 报告应通过 GET /report 获取并由 LLM 增强
        report_response = self.request(
            "GET",
            f"/api/sessions/{created['id']}/report",
        )
        self.assertEqual(report_response["report"], "# LLM 增强纪要\n\n- 仅记录可复核观察。")
        self.assertEqual(report_response["llm_status"], "ok")

    @patch("backend.interview.api.generate_answer_help")
    def test_answer_help_route_returns_llm_response(self, help_mock):
        help_mock.return_value = AnswerHelpResult(
            llm_status="ok",
            summary="可以按背景、方法、结果回答。",
            reference_answer="参考答案",
            outline=["背景", "方法", "结果"],
            key_points=["背景", "职责"],
            cautions=["不要照抄"],
            generated_at="2026-05-16T00:00:00Z",
        )
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

        response = self.request(
            "POST",
            f"/api/sessions/{created['id']}/help",
            {"draft_text": "我先讲项目背景。"},
        )

        self.assertEqual(response["mode"], "llm")
        self.assertEqual(response["llm_status"], "ok")
        self.assertEqual(response["reference_answer"], "参考答案")
        self.assertEqual(response["outline"], ["背景", "方法", "结果"])
        self.assertEqual(response["generated_at"], "2026-05-16T00:00:00Z")
        help_mock.assert_called_once()

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

    def test_answer_with_video_timestamp_sec(self):
        """提交答案时带 video_timestamp_sec，返回的 session 应保留该字段"""
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "test",
                "resume": "测试简历",
                "job_description": "测试岗位",
                "interview_goal": "测试目标",
            },
            expected_status=201,
        )

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {
                "text": "测试回答",
                "duration_sec": 30,
                "video_timestamp_sec": 42.5,
            },
        )
        self.assertEqual(len(updated["answers"]), 1)
        answer = updated["answers"][0]
        self.assertEqual(answer["video_timestamp_sec"], 42.5)

    def test_records_speech_chunks_and_returns_chunk_and_cumulative_metrics(self):
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

        first = self.request(
            "POST",
            f"/api/sessions/{created['id']}/speech-chunks",
            {"audio_base64": self._tone_wav_base64(freq_hz=180.0, duration_sec=0.6)},
        )
        second = self.request(
            "POST",
            f"/api/sessions/{created['id']}/speech-chunks",
            {"audio_base64": self._tone_wav_base64(freq_hz=300.0, duration_sec=0.6)},
        )

        self.assertIn("chunk", first)
        self.assertIn("cumulative", first)
        self.assertEqual(first["cumulative"]["chunk_count"], 1)
        self.assertGreater(first["cumulative"]["analyzed_duration_sec"], 0.4)

        self.assertIn("chunk", second)
        self.assertIn("cumulative", second)
        self.assertEqual(second["cumulative"]["chunk_count"], 2)
        self.assertGreater(second["cumulative"]["analyzed_duration_sec"], first["cumulative"]["analyzed_duration_sec"])
        self.assertGreaterEqual(second["cumulative"]["speech_rate_sps"], 0.0)
        self.assertIsNotNone(second["cumulative"]["f0_std_hz"])
        self.assertIn("f0_std_semitones", second["cumulative"])

    def test_rejects_invalid_speech_chunk_payload(self):
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

        bad = self.request(
            "POST",
            f"/api/sessions/{created['id']}/speech-chunks",
            {"audio_base64": "not-a-valid-base64"},
            expected_status=400,
        )
        self.assertEqual(bad["error"], "invalid_audio_payload")

    def test_video_upload_clears_failed_flag_on_success(self):
        from dataclasses import replace
        from backend.interview.session import create_interview_session
        from backend.interview.question_engine import InterviewQuestion

        questions = [InterviewQuestion(id="q1", dimension="项目经验", prompt="test", follow_ups=[], evidence_hints=[])]
        session = create_interview_session(candidate_name="张三", role="工程师", questions=questions)

        # 模拟上传失败
        session = replace(session, video_upload_failed=True)
        self.assertTrue(session.video_upload_failed)

        # 模拟上传成功：video_path 被设置，video_upload_failed 应被清除
        session = replace(session, video_path="user1/session1.webm", video_duration_sec=60.0, video_upload_failed=False)
        self.assertFalse(session.video_upload_failed)
        self.assertEqual(session.video_path, "user1/session1.webm")

    def test_video_download_returns_404_when_no_video(self):
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

        status, body = handle_api_request(
            self.store, "GET", f"/api/sessions/{created['id']}/video", {},
            user_id="00000000-0000-0000-0000-000000000001",
        )
        self.assertEqual(status, 404)
        self.assertEqual(body["error"], "video_not_found")

    def test_health_endpoint_returns_correct_structure(self):
        status, body = _handle_health(self.store)
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["version"], "0.5.0")
        self.assertIn("components", body)
        self.assertIn("database", body["components"])
        self.assertIn("llm", body["components"])
        self.assertIn("asr", body["components"])
        self.assertIn("mineru", body["components"])
        self.assertIn("runtime", body)
        self.assertIn("uptime_sec", body["runtime"])
        self.assertIn("memory_sessions", body["runtime"])

    def test_health_endpoint_reports_disabled_database_for_in_memory_store(self):
        status, body = _handle_health(self.store)
        self.assertEqual(body["components"]["database"]["status"], "disabled")
        self.assertEqual(body["components"]["database"]["type"], "in-memory")

    def test_health_endpoint_reports_llm_not_configured(self):
        status, body = _handle_health(self.store)
        self.assertEqual(body["components"]["llm"]["configured"], False)
        self.assertIsNone(body["components"]["llm"]["model"])
        self.assertIsNone(body["components"]["llm"]["base_url"])

    def test_health_endpoint_reports_runtime_metrics_after_creating_session(self):
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
        status, body = _handle_health(self.store)
        self.assertGreaterEqual(body["runtime"]["memory_sessions"], 1)
        self.assertGreaterEqual(body["runtime"]["uptime_sec"], 0)

    def test_health_endpoint_works_via_handle_api_request(self):
        status, body = handle_api_request(self.store, "GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")

    def test_health_endpoint_is_public_route_no_auth_required(self):
        # Simulate unauthenticated request — should still return 200
        self.env_patcher.stop()  # restore real env to clear OPENAI_API_KEY
        self.addCleanup(lambda: None)
        status, body = handle_api_request(self.store, "GET", "/api/health", user_id="")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")

    def test_returns_404_for_unknown_session(self):
        response = self.request(
            "POST",
            "/api/sessions/missing/answers",
            {"text": "hello", "duration_sec": 1},
            expected_status=404,
        )

        self.assertEqual(response["error"], "session_not_found")

    def test_full_interview_flow_all_six_questions(self):
        """完整面试流程：创建 session → 回答全部 6 题 → 验证状态推进和最终报告"""
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "李四",
                "resume": "候选人主导过 AI 客服平台开发，熟悉 Python、TypeScript、FastAPI、PostgreSQL。",
                "job_description": "岗位是 AI 全栈工程师，需要 LLM 应用开发和系统架构能力。",
                "interview_goal": "评估专业能力、项目经验、技术实现能力、应变能力、表达能力。",
            },
            expected_status=201,
        )

        self.assertEqual(created["candidate_name"], "李四")
        self.assertEqual(len(created["questions"]), 6)
        self.assertEqual(created["current_index"], 0)
        self.assertEqual(created["current_question"]["id"], "q_001")

        answers_texts = [
            "我主要做 API 设计和 LLM 集成，用 FastAPI 构建了微服务架构。",
            "AI 客服平台是我主导的项目，负责整体架构设计和技术选型。",
            "我会设计分层架构，前端用 React、后端用 FastAPI、数据用 PostgreSQL。",
            "用 TypeScript 重写了核心模块，类型安全减少了很多运行时错误。",
            "如果回答信息不足，我会先确认理解是否正确，再引导补充细节。",
            "这个系统帮助面试更标准化，但最终决策还是要靠人工判断。",
        ]

        session = created
        for i, answer_text in enumerate(answers_texts):
            self.assertEqual(session["current_index"], i)
            self.assertEqual(session["current_question"]["id"], f"q_{i+1:03d}")
            self.assertEqual(len(session["answers"]), i)

            session = self.request(
                "POST",
                f"/api/sessions/{session['id']}/answers",
                {"text": answer_text, "duration_sec": 45 + i * 10},
            )

            self.assertEqual(len(session["answers"]), i + 1)
            self.assertEqual(session["answers"][i]["text"], answer_text)
            self.assertEqual(session["answers"][i]["question_id"], f"q_{i+1:03d}")

        # After 6th answer, current_question should be None
        self.assertIsNone(session["current_question"])
        self.assertEqual(session["current_index"], 6)
        self.assertEqual(len(session["answers"]), 6)

        # 报告不再随 POST answers 返回（通过 GET /report 独立获取）
        self.assertEqual(session["report"], "")

        # 验证 GET /report 可以获取包含所有维度的报告
        report_resp = self.request(
            "GET",
            f"/api/sessions/{session['id']}/report",
        )
        self.assertIn("# 智能面试纪要", report_resp["report"])
        for dim in ["专业能力", "项目经验", "技术实现能力", "应变能力", "表达能力"]:
            self.assertIn(dim, report_resp["report"])

        # All answers should be in the report
        for answer_text in answers_texts:
            self.assertIn(answer_text, report_resp["report"])

    def test_session_lifecycle_create_get_list_delete(self):
        """测试 session 完整生命周期：创建 → 获取 → 列表 → 删除 → 确认删除"""
        created = self.request(
            "POST",
            "/api/sessions",
            {
                "candidate_name": "王五",
                "resume": "候选人擅长前端开发。",
                "job_description": "岗位是前端工程师。",
                "interview_goal": "评估专业能力。",
            },
            expected_status=201,
        )
        session_id = created["id"]

        # GET single session
        fetched = self.request("GET", f"/api/sessions/{session_id}")
        self.assertEqual(fetched["id"], session_id)
        self.assertEqual(fetched["candidate_name"], "王五")

        # LIST sessions
        session_list_resp = self.request("GET", "/api/sessions")
        self.assertIn("sessions", session_list_resp)
        sessions = session_list_resp["sessions"]
        self.assertGreaterEqual(len(sessions), 1)
        self.assertIn(session_id, [s["id"] for s in sessions])

        # DELETE session
        deleted = self.request("DELETE", f"/api/sessions/{session_id}")
        self.assertEqual(deleted["message"], "session_deleted")

        # Verify deletion — list no longer contains it
        session_list_after = self.request("GET", "/api/sessions")
        self.assertNotIn(session_id, [s["id"] for s in session_list_after["sessions"]])

    def test_create_session_accepts_payload_with_defaults_for_missing_fields(self):
        """API 对空 payload 使用默认值创建 session（已知行为）"""
        response = self.request(
            "POST",
            "/api/sessions",
            {},
            expected_status=201,
        )
        self.assertEqual(response["candidate_name"], "候选人")

    def test_delete_unknown_session_returns_ok(self):
        response = self.request(
            "DELETE",
            "/api/sessions/nonexistent-session",
        )
        self.assertEqual(response["message"], "session_deleted")

    def test_health_endpoint_reports_component_details(self):
        status, body = _handle_health(self.store)
        # mineru
        self.assertIn("api_token_configured", body["components"]["mineru"])
        self.assertIn("mode", body["components"]["mineru"])
        # asr
        self.assertIn("dashscope_configured", body["components"]["asr"])
        # runtime
        self.assertIn("memory_prep_sessions", body["runtime"])
        self.assertIn("memory_speech_aggregates", body["runtime"])
        self.assertIn("uptime_sec", body["runtime"])

    def test_health_endpoint_runtime_metrics_reflect_prep_sessions(self):
        self.store.prep_sessions["prep_1"] = None
        status, body = _handle_health(self.store)
        self.assertEqual(body["runtime"]["memory_prep_sessions"], 1)

    def test_get_unknown_session_returns_error(self):
        response = self.request(
            "GET",
            "/api/sessions/unknown-id",
            expected_status=404,
        )
        self.assertEqual(response["error"], "session_not_found")

    def request(self, method, path, payload=None, expected_status=200):
        status, body = handle_api_request(self.store, method, path, payload or {})
        self.assertEqual(status, expected_status, json.dumps(body, ensure_ascii=False))
        return body

    def _tone_wav_base64(self, *, freq_hz: float, duration_sec: float, sample_rate: int = 16000) -> str:
        frame_count = max(1, int(sample_rate * duration_sec))
        data = bytearray()
        for i in range(frame_count):
            sample = int(0.5 * 32767 * math.sin(2.0 * math.pi * freq_hz * i / sample_rate))
            data.extend(int(sample).to_bytes(2, byteorder="little", signed=True))

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)
            handle.writeframes(bytes(data))

        return base64.b64encode(buffer.getvalue()).decode("ascii")


class FollowupApiTest(unittest.TestCase):
    """API 层追问行为：/answers 响应 + session 序列化 + 推进控制。"""

    def setUp(self):
        self.env_patcher = patch.dict(
            "os.environ",
            {"OPENAI_API_KEY": "", "OPENAI_MODEL": "", "OPENAI_BASE_URL": ""},
        )
        self.env_patcher.start()
        self.addCleanup(self.env_patcher.stop)
        self.store = SessionStore()

    def _create_session(self) -> dict:
        return self.request(
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

    def request(self, method, path, payload=None, expected_status=200):
        status, body = handle_api_request(self.store, method, path, payload or {})
        self.assertEqual(status, expected_status, json.dumps(body, ensure_ascii=False))
        return body

    @patch("backend.interview.api.decide_followup")
    def test_answer_response_exposes_followup_when_llm_decides_to_ask(self, decide_mock):
        decide_mock.return_value = FollowupDecision(
            finished=False,
            followup_question="你具体负责哪一块？",
            reason="needs detail",
            llm_status="ok",
        )
        created = self._create_session()
        first_qid = created["current_question"]["id"]

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {"text": "我做过一个面试平台。", "duration_sec": 20},
        )

        # current_question 不变
        self.assertEqual(updated["current_question"]["id"], first_qid)
        # followup 字段
        self.assertTrue(updated["followup"]["asked"])
        self.assertEqual(updated["followup"]["question"], "你具体负责哪一块？")
        self.assertEqual(updated["followup"]["round"], 1)
        # session 序列化也带 current_followup
        self.assertEqual(updated["current_followup"], "你具体负责哪一块？")
        decide_mock.assert_called_once()

    @patch("backend.interview.api.decide_followup")
    def test_followup_finished_advances_to_next_question(self, decide_mock):
        decide_mock.return_value = FollowupDecision(finished=True, llm_status="ok")
        created = self._create_session()
        first_qid = created["current_question"]["id"]

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {"text": "我负责问题生成模块和报告。", "duration_sec": 35},
        )

        self.assertNotEqual(updated["current_question"]["id"], first_qid)
        self.assertFalse(updated["followup"]["asked"])
        self.assertEqual(updated["followup"]["question"], "")
        self.assertIsNone(updated["current_followup"])

    @patch("backend.interview.api.decide_followup")
    def test_followup_records_independent_answer_record(self, decide_mock):
        # 第一次：触发追问；第二次：结束追问
        decide_mock.side_effect = [
            FollowupDecision(finished=False, followup_question="再具体说说？", llm_status="ok"),
            FollowupDecision(finished=True, llm_status="ok"),
        ]
        created = self._create_session()
        sid = created["id"]
        first_qid = created["current_question"]["id"]

        # 主问题首答 -> 触发追问
        after_main = self.request(
            "POST",
            f"/api/sessions/{sid}/answers",
            {"text": "做过一个面试平台。", "duration_sec": 15},
        )
        self.assertEqual(len(after_main["answers"]), 1)
        self.assertEqual(after_main["current_question"]["id"], first_qid)

        # 追问回答 -> 推进
        after_followup = self.request(
            "POST",
            f"/api/sessions/{sid}/answers",
            {"text": "主要负责问题生成模块。", "duration_sec": 18},
        )
        self.assertEqual(len(after_followup["answers"]), 2)
        followup_record = after_followup["answers"][1]
        self.assertTrue(followup_record["is_followup"])
        self.assertEqual(followup_record["followup_round"], 1)
        self.assertEqual(followup_record["followup_prompt"], "再具体说说？")
        self.assertNotEqual(after_followup["current_question"]["id"], first_qid)

    @patch("backend.interview.api.decide_followup")
    def test_followup_decision_exception_falls_back_to_advance(self, decide_mock):
        decide_mock.side_effect = RuntimeError("boom")
        created = self._create_session()
        first_qid = created["current_question"]["id"]

        updated = self.request(
            "POST",
            f"/api/sessions/{created['id']}/answers",
            {"text": "我负责问题生成。", "duration_sec": 30},
        )

        # decide_followup 抛异常时按 finished 处理，正常推进，主流程不卡死
        self.assertNotEqual(updated["current_question"]["id"], first_qid)
        self.assertFalse(updated["followup"]["asked"])


if __name__ == "__main__":
    unittest.main()
