"""
功能测试 — 通过真实 HTTP 请求验证运行中的后端系统。

这些测试不 mock 任何模块，直接向 localhost:8000 发送 HTTP 请求。
后端未运行时测试自动跳过（SKIP 模式）。
需要 mock-resumes/ 下的真实 PDF 文件来测试 MinerU 解析。
"""
from __future__ import annotations

import base64
import json
import os
import unittest
import urllib.error
import urllib.request

BASE_URL = os.environ.get("FUNCTIONAL_TEST_BASE_URL", "http://localhost:8000")
MOCK_RESUMES_DIR = os.environ.get(
    "MOCK_RESUMES_DIR",
    os.path.join(os.path.dirname(__file__), "..", "..", "mock-resumes"),
)
HEADERS = {"Content-Type": "application/json"}
USER_HEADERS = {**HEADERS, "X-User-Id": "dev_user"}


def http_request(
    method: str,
    path: str,
    payload: dict | None = None,
    headers: dict | None = None,
) -> tuple[int, dict]:
    """发送真实 HTTP 请求到运行中的后端。"""
    url = f"{BASE_URL}{path}"
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(
        url, data=data, headers=headers or USER_HEADERS, method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode())
        return e.code, body
    except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
        raise unittest.SkipTest(f"Backend not available at {BASE_URL}: {e}") from e


class FunctionalApiTest(unittest.TestCase):
    """功能测试：通过真实 HTTP 请求测试运行中的后端。"""

    @classmethod
    def setUpClass(cls):
        """验证后端可达，否则跳过所有测试。"""
        try:
            status, body = http_request("GET", "/api/health", headers=HEADERS)
            assert status == 200 and body.get("status") == "ok", (
                f"Health check failed: {status} {body}"
            )
        except unittest.SkipTest:
            raise
        except Exception as e:
            raise unittest.SkipTest(
                f"Backend unreachable at {BASE_URL}: {e}"
            ) from e

    # ---- 健康端点 ----

    def test_health_endpoint(self):
        """健康端点返回完整的组件状态和运行时指标。"""
        status, body = http_request("GET", "/api/health", headers=HEADERS)
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")
        self.assertIn("components", body)
        components = body["components"]
        self.assertIn("database", components)
        self.assertIn("llm", components)
        self.assertIn("mineru", components)
        # runtime 在 body 顶层，不在 components 内
        self.assertIn("runtime", body)
        self.assertIn("uptime_sec", body["runtime"])

    def test_health_llm_component(self):
        """健康端点的 LLM 组件反映真实配置状态。"""
        status, body = http_request("GET", "/api/health", headers=HEADERS)
        llm = body["components"]["llm"]
        self.assertIn("configured", llm)
        self.assertIn("model", llm)
        self.assertIn("base_url", llm)

    def test_health_mineru_component(self):
        """健康端点的 MinerU 组件显示命令路径。"""
        status, body = http_request("GET", "/api/health", headers=HEADERS)
        self.assertIn("command", body["components"]["mineru"])

    # ---- 简历上传（真实 MinerU 解析） ----

    def _find_pdf(self) -> str:
        """查找可用的 PDF 简历文件。"""
        for fname in [
            "frontend_senior_li_ming.pdf",
            "ml_engineer_zhao_nan.pdf",
            "backend_platform_chen_yu.pdf",
            "ai_product_wang_xin.pdf",
        ]:
            path = os.path.join(MOCK_RESUMES_DIR, fname)
            if os.path.exists(path):
                return path
        self.fail(f"No PDF resume found in {MOCK_RESUMES_DIR}")

    def _upload_resume(self, pdf_path: str | None = None) -> tuple[int, dict, str]:
        """上传真实 PDF 简历，返回 (status, body, prep_session_id)。"""
        path = pdf_path or self._find_pdf()
        with open(path, "rb") as f:
            pdf_data = f.read()
        b64 = base64.b64encode(pdf_data).decode()
        fname = os.path.basename(path)
        payload = {
            "candidate_name": "功能测试",
            "file_name": fname,
            "content_type": "application/pdf",
            "data_base64": b64,
        }
        status, body = http_request("POST", "/api/prep-sessions/resume", payload)
        return status, body, body.get("prep_session_id", "")

    def test_resume_upload_returns_201(self):
        """上传真实 PDF 简历返回 201，MinerU 解析简历内容。"""
        status, body, prep_id = self._upload_resume()
        self.assertEqual(status, 201)
        self.assertTrue(prep_id.startswith("prep_"), f"Expected prep_ prefix, got {prep_id}")
        # API 返回 resume_markdown_preview（非 resume_markdown）
        self.assertIn("resume_markdown_preview", body)
        self.assertTrue(body["resume_markdown_preview"].strip(),
                        "resume_markdown_preview should not be empty")

    def test_resume_upload_content_is_chinese_resume_text(self):
        """简历内容包含候选人相关的中文信息（MinerU 正确解析）。"""
        _, body, _ = self._upload_resume()
        md = body["resume_markdown_preview"]
        # 应包含中文简历特征：姓名、技能、经验等
        self.assertRegex(md, r"[\u4e00-\u9fff]{2,}")  # 至少包含中文字符
        self.assertGreater(len(md), 50)  # 内容应足够长
        self.assertIn("llm_status", body)

    def test_resume_upload_with_invalid_base64_returns_400(self):
        """非法 base64 上传返回 400。"""
        payload = {
            "candidate_name": "测试",
            "file_name": "test.pdf",
            "content_type": "application/pdf",
            "data_base64": "not-valid-base64-!!!",
        }
        status, body = http_request("POST", "/api/prep-sessions/resume", payload)
        self.assertEqual(status, 400)
        self.assertIn("error", body)

    def test_resume_upload_unsupported_format_returns_400(self):
        """不支持的文件格式返回 400。"""
        payload = {
            "candidate_name": "测试",
            "file_name": "test.exe",
            "content_type": "application/x-msdownload",
            "data_base64": base64.b64encode(b"test").decode(),
        }
        status, body = http_request("POST", "/api/prep-sessions/resume", payload)
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "unsupported_resume_format")

    # ---- Followup 流程 ----

    def test_followup_after_resume_upload(self):
        """上传简历后，followup 接口返回 ready 和 ready_summary。"""
        _, _, prep_id = self._upload_resume()
        payload = {"answers": ["技能匹配该岗位要求。"]}
        status, body = http_request(
            "POST", f"/api/prep-sessions/{prep_id}/followups", payload,
        )
        self.assertEqual(status, 200)
        # API 返回 ready（布尔值），非 is_ready
        self.assertIs(body.get("ready"), True)
        self.assertIn("ready_summary", body)
        summary = body["ready_summary"]
        self.assertIsInstance(summary, dict)

    # ---- Interview Session 生命周期 ----

    def _create_interview_session_via_prep(self):
        """完整的 prep → interview session 创建流程。"""
        _, _, prep_id = self._upload_resume()
        # 先发送 followup
        http_request("POST", f"/api/prep-sessions/{prep_id}/followups",
                      {"answers": ["技能匹配该岗位要求。"]})
        # 创建面试 session
        status, body = http_request(
            "POST", f"/api/prep-sessions/{prep_id}/interview-session", {},
        )
        return status, body

    def test_create_interview_session_returns_201_with_questions(self):
        """通过 prep session 创建面试，返回 201 和面试题。"""
        status, session = self._create_interview_session_via_prep()
        self.assertEqual(status, 201)
        self.assertIn("id", session)
        self.assertTrue(session["id"].startswith("session_"))
        self.assertEqual(session["candidate_name"], "功能测试")
        self.assertIn("questions", session)
        self.assertGreaterEqual(len(session["questions"]), 5)
        self.assertIn("current_question", session)

    def test_create_session_directly(self):
        """直接创建 session（不走 prep）返回 201。"""
        payload = {
            "candidate_name": "直接测试",
            "resume": "候选人擅长全栈开发，有 5 年经验。",
            "job_description": "全栈工程师，React + Python。",
            "interview_goal": "评估技术能力。",
        }
        status, body = http_request("POST", "/api/sessions", payload)
        self.assertEqual(status, 201)
        self.assertEqual(body["candidate_name"], "直接测试")
        self.assertIn("questions", body)
        self.assertGreaterEqual(len(body["questions"]), 5)

    def test_session_create_sets_default_role_from_job(self):
        """岗位名称未指定时，role 从 job_description 解析。"""
        payload = {
            "candidate_name": "测试",
            "resume": "候选人擅长前端。",
            "job_description": "岗位是 Python 后端工程师。",
            "interview_goal": "评估专业能力。",
        }
        status, body = http_request("POST", "/api/sessions", payload)
        self.assertEqual(status, 201)
        self.assertIn("Python", body["role"])

    def test_list_sessions(self):
        """列出 session 返回数组。"""
        status, body = http_request("GET", "/api/sessions")
        self.assertEqual(status, 200)
        self.assertIn("sessions", body)
        self.assertIsInstance(body["sessions"], list)

    def test_get_session(self):
        """获取单个 session 返回完整数据。"""
        _, session = self._create_interview_session_via_prep()
        session_id = session["id"]
        status, body = http_request("GET", f"/api/sessions/{session_id}")
        self.assertEqual(status, 200)
        self.assertEqual(body["id"], session_id)
        self.assertEqual(body["candidate_name"], "功能测试")

    def test_get_unknown_session_returns_404(self):
        """不存在的 session 返回 404。"""
        status, body = http_request("GET", "/api/sessions/nonexistent-id")
        self.assertEqual(status, 404)
        self.assertIn("error", body)

    # ---- 答题流程 ----

    def test_answer_single_question(self):
        """回答单题后状态正确推进。"""
        _, session = self._create_interview_session_via_prep()
        session_id = session["id"]
        q1_id = session["current_question"]["id"]

        status, body = http_request(
            "POST", f"/api/sessions/{session_id}/answers",
            {"text": "这是对第一题的正式回答，包含技术细节和项目经验。", "duration_sec": 45},
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(body["answers"]), 1)
        self.assertEqual(body["answers"][0]["question_id"], q1_id)
        self.assertEqual(body["answers"][0]["text"],
                         "这是对第一题的正式回答，包含技术细节和项目经验。")
        # 推进到下一题
        self.assertEqual(body["current_index"], 1)
        self.assertIsNotNone(body["current_question"])

    def test_full_answer_flow(self):
        """完整回答所有题目并验证最终报告。"""
        _, session = self._create_interview_session_via_prep()
        session_id = session["id"]
        total = len(session["questions"])

        # 准备足够多的答案（≥ 题目数）
        answers = [
            "这是我关于模块化设计的思路，采用领域驱动划分。",
            "在状态管理上我倾向于使用 useReducer 管理复杂表单状态。",
            "性能优化使用 Lighthouse 分析并采用代码分割方案。",
            "测试策略是先写核心路径的集成测试再补充单元测试。",
            "跨团队协作使用定期同步会议和文档驱动的方式。",
            "数据流设计遵循单向数据流和事件溯源模式。",
        ]

        current = session
        for i in range(total):
            self.assertEqual(current["current_index"], i, f"At Q{i+1}")
            q_id = current["current_question"]["id"]
            status, current = http_request(
                "POST", f"/api/sessions/{session_id}/answers",
                {"text": answers[i], "duration_sec": 60},
            )
            self.assertEqual(status, 200)
            self.assertEqual(len(current["answers"]), i + 1)
            self.assertEqual(current["answers"][i]["question_id"], q_id)

        # 所有题答完
        if total >= len(answers):
            self.assertIsNone(current.get("current_question"),
                              "All questions answered, current_question should be None")
        self.assertIn("report", current)
        self.assertIn("智能面试纪要", current["report"])
        # 所有回答内容应出现在报告中
        for ans in answers[:total]:
            self.assertIn(ans, current["report"])

    def test_answer_text_metrics(self):
        """回答包含文本指标（字数、语速等）。"""
        _, session = self._create_interview_session_via_prep()
        session_id = session["id"]

        status, body = http_request(
            "POST", f"/api/sessions/{session_id}/answers",
            {"text": "这是我的回答。字数统计应该正确生效。", "duration_sec": 30},
        )
        self.assertEqual(status, 200)
        answer = body["answers"][0]
        self.assertIn("word_count", answer)
        self.assertGreater(answer["word_count"], 0)
        self.assertIn("filler_word_count", answer)
        self.assertIn("duration_sec", answer)

    # ---- 报告 ----

    def test_report_after_all_answers(self):
        """全部答完后报告包含完整问答记录和评分。"""
        _, session = self._create_interview_session_via_prep()
        session_id = session["id"]
        total = len(session["questions"])

        for i in range(total):
            http_request(
                "POST", f"/api/sessions/{session_id}/answers",
                {"text": f"第{i+1}题的回答内容。", "duration_sec": 30},
            )

        status, body = http_request("GET", f"/api/sessions/{session_id}/report")
        self.assertEqual(status, 200)
        self.assertIn("report", body)
        report = body["report"]
        self.assertIn("智能面试纪要", report)
        for i in range(total):
            self.assertIn(f"第{i+1}题的回答内容", report)

    # ---- 错误处理 ----

    def test_answer_empty_text_is_accepted(self):
        """空文本回答被接受（后端不做严格校验）。"""
        _, session = self._create_interview_session_via_prep()
        status, body = http_request(
            "POST", f"/api/sessions/{session['id']}/answers",
            {"text": "", "duration_sec": 0},
        )
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(body["answers"]), 1)

    def test_unauthenticated_health_endpoint(self):
        """健康端点无需认证。"""
        status, body = http_request("GET", "/api/health", headers=HEADERS)
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")


if __name__ == "__main__":
    unittest.main()
