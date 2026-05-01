import unittest

from backend.interview.question_engine import extract_signals, generate_interview_questions


class QuestionEngineTest(unittest.TestCase):
    def test_extracts_role_skills_projects_and_goals(self):
        signals = extract_signals(
            resume="候选人负责 AI 面试平台，使用 Python、TypeScript 和 LLM 实现问题生成与纪要。",
            job_description="岗位是 AI 产品全栈工程师，需要 Python、TypeScript、LLM 应用经验。",
            interview_goal="评估专业能力、项目经验、技术实现能力、应变能力。",
        )

        self.assertEqual(signals.role, "AI 产品全栈工程师")
        self.assertEqual(signals.skills[:3], ["Python", "TypeScript", "LLM"])
        self.assertTrue(any("AI 面试平台" in project for project in signals.projects))
        self.assertIn("专业能力", signals.goals)
        self.assertIn("应变能力", signals.goals)

    def test_generates_structured_questions_with_followups_and_evidence_hints(self):
        result = generate_interview_questions(
            resume="候选人负责 AI 面试平台，包含问题生成、数字人提问、回答记录和纪要生成。",
            job_description="岗位是 AI 产品全栈工程师，需要 Python、TypeScript、LLM 应用和产品工程化经验。",
            interview_goal="评估专业能力、项目经验、技术实现能力、应变能力。",
        )

        self.assertEqual(result.role, "AI 产品全栈工程师")
        self.assertGreaterEqual(len(result.questions), 6)

        dimensions = {question.dimension for question in result.questions}
        self.assertIn("专业能力", dimensions)
        self.assertIn("项目经验", dimensions)
        self.assertIn("技术实现能力", dimensions)
        self.assertIn("应变能力", dimensions)

        for question in result.questions:
            self.assertTrue(question.id.startswith("q_"))
            self.assertGreater(len(question.prompt), 10)
            self.assertGreaterEqual(len(question.follow_ups), 1)
            self.assertGreaterEqual(len(question.evidence_hints), 1)


if __name__ == "__main__":
    unittest.main()
