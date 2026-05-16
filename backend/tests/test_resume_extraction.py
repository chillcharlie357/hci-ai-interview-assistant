import unittest
from unittest.mock import MagicMock
from backend.interview.llm_client import LlmClient, LlmConfig, LlmResult
from backend.interview.prep_session import extract_resume_info, _extract_name_regex, _detect_template_keywords


class TestExtractNameRegex(unittest.TestCase):
    def test_from_h1(self):
        md = "# 张三\n\n## 项目经验\n..."
        self.assertEqual(_extract_name_regex(md), "张三")

    def test_skip_section_header(self):
        md = "# 项目经验\n..."
        self.assertEqual(_extract_name_regex(md), "")

    def test_from_bold(self):
        md = "**李四**\n\n联系方式..."
        self.assertEqual(_extract_name_regex(md), "李四")

    def test_empty_on_no_match(self):
        md = "## 简历\n无明确姓名"
        self.assertEqual(_extract_name_regex(md), "")


class TestDetectTemplateKeywords(unittest.TestCase):
    def test_detect_frontend(self):
        md = "熟练使用 React、TypeScript、CSS，有 Web 前端开发经验"
        result = _detect_template_keywords(md)
        self.assertEqual(result["matching_template"], "frontend")
        self.assertIn("React", result["detected_skills"])

    def test_no_match_returns_none(self):
        md = "无技术关键词的文本"
        result = _detect_template_keywords(md)
        self.assertIsNone(result["matching_template"])


class TestExtractResumeInfoWithLLM(unittest.TestCase):
    def test_llm_returns_structured_data(self):
        mock_client = MagicMock()
        mock_client.config.configured = True
        mock_client.complete_json.return_value = LlmResult(
            status="ok",
            data={"candidateName": "张三", "matchingTemplate": "backend", "detectedSkills": ["Python", "Docker"]},
        )
        result = extract_resume_info("# 张三\n\nPython 开发", mock_client)
        self.assertEqual(result["extracted_candidate_name"], "张三")
        self.assertEqual(result["matching_template"], "backend")
        self.assertEqual(result["detected_skills"], ["Python", "Docker"])

    def test_llm_unconfigured_falls_back(self):
        mock_client = MagicMock()
        mock_client.config.configured = False
        result = extract_resume_info("# 张三\n\nPython", mock_client)
        self.assertEqual(result["extracted_candidate_name"], "张三")
