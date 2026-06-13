import unittest
from unittest.mock import patch

from backend.interview.answer_analysis import analyze_answer_text, clean_filler_words
from backend.interview.llm_client import LlmResult


class FakeLlmClient:
    def __init__(self, result):
        self.result = result
        self.system_prompt = ""
        self.user_prompt = ""

    def complete_json(self, system_prompt, user_prompt, **kwargs):
        self.system_prompt = system_prompt
        self.user_prompt = user_prompt
        self.kwargs = kwargs
        return self.result


class AnswerAnalysisTest(unittest.TestCase):
    def test_uses_llm_result_for_filler_word_count_when_available(self):
        client = FakeLlmClient(LlmResult(status="ok", data={"filler_word_count": 4, "observations": ["有明显停顿"]}))

        result = analyze_answer_text("嗯，我负责问题生成。", llm_client=client)

        self.assertEqual(result.filler_word_count, 4)
        self.assertEqual(result.llm_status, "ok")
        self.assertIn("filler_word_count", client.system_prompt)
        self.assertIn("我负责问题生成", client.user_prompt)
        self.assertEqual(client.kwargs["timeout_sec"], 2.0)

    def test_falls_back_to_configured_rule_when_llm_is_unavailable(self):
        client = FakeLlmClient(LlmResult(status="fallback", data=None))

        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1", "INTERVIEW_FILLER_WORDS": "嗯,啊"}, clear=True):
            result = analyze_answer_text("嗯，我负责问题生成，啊，也做纪要。", llm_client=client)

        self.assertEqual(result.filler_word_count, 2)
        self.assertEqual(result.llm_status, "fallback")

    def test_fallback_counts_case_insensitive_english_fillers_with_word_boundaries(self):
        client = FakeLlmClient(LlmResult(status="fallback", data=None))

        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1", "INTERVIEW_FILLER_WORDS": "um,uh"}, clear=True):
            result = analyze_answer_text("Um, I used Supabase. The resume parser is stable, uh.", llm_client=client)

        self.assertEqual(result.filler_word_count, 2)

    def test_clean_filler_words_removes_disfluencies_without_breaking_terms(self):
        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1", "INTERVIEW_FILLER_WORDS": "嗯,啊,那个,就是,um,uh"}, clear=True):
            cleaned = clean_filler_words("嗯，啊，我主要负责 RAG，那个，使用 Supabase；um, TypeScript 也做过。")

        self.assertEqual(cleaned, "我主要负责 RAG，使用 Supabase；TypeScript 也做过。")


if __name__ == "__main__":
    unittest.main()
