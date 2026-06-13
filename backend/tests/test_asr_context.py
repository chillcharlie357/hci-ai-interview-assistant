import unittest

from backend.interview.asr_context import extract_asr_context_terms, format_corpus_text
from backend.interview.question_engine import InterviewQuestion


class AsrContextTest(unittest.TestCase):
    def test_extracts_interview_terms_from_resume_job_and_questions(self):
        questions = [
            InterviewQuestion(
                id="q_001",
                dimension="RAG 理解与实践",
                prompt="请描述如何实现一个 RAG 系统，并说明 embedding、rerank 和向量数据库的选择。",
                follow_ups=[],
                evidence_hints=[],
            )
        ]

        terms = extract_asr_context_terms(
            resume_markdown="候选人负责 LiveKit 实时面试、Qwen-ASR、TypeScript 前端和 Python 后端。",
            job_description="岗位需要 LLM 应用、RAG、Supabase、WebRTC 和 Docker 部署经验。",
            interview_goal="重点考察检索增强生成和工程落地。",
            role="AI/LLM 工程师",
            questions=questions,
        )

        for expected in ["RAG", "LLM", "LiveKit", "Qwen-ASR", "TypeScript", "Supabase", "WebRTC", "Docker", "向量数据库", "检索增强生成"]:
            self.assertIn(expected, terms)

        self.assertLessEqual(len(terms), 80)

    def test_formats_corpus_text_with_deduplicated_terms(self):
        corpus_text = format_corpus_text(["RAG", "RAG", "TypeScript", "检索增强生成"])

        self.assertEqual(corpus_text, "RAG\nTypeScript\n检索增强生成")


if __name__ == "__main__":
    unittest.main()
