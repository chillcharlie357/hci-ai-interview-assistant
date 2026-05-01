import unittest

from backend.interview.question_engine import InterviewQuestion
from backend.interview.session import (
    build_avatar_prompt,
    create_interview_session,
    generate_markdown_report,
    record_answer,
)


QUESTIONS = [
    InterviewQuestion(
        id="q_001",
        dimension="项目经验",
        prompt="请介绍你做过的 AI 面试项目。",
        follow_ups=["你在项目里负责哪一块？"],
        evidence_hints=["关注个人贡献。"],
    ),
    InterviewQuestion(
        id="q_002",
        dimension="技术实现能力",
        prompt="你会如何设计面试问题生成模块？",
        follow_ups=["如何处理简历和 JD 信息不足？"],
        evidence_hints=["关注方案完整性。"],
    ),
]


class InterviewSessionTest(unittest.TestCase):
    def test_creates_session_with_current_question_and_avatar_prompt(self):
        session = create_interview_session(
            candidate_name="张三",
            role="AI 产品全栈工程师",
            questions=QUESTIONS,
        )

        self.assertEqual(session.candidate_name, "张三")
        self.assertEqual(session.current_question.id, "q_001")
        self.assertIn("数字人面试官已准备", session.events[0].message)
        self.assertIn("请介绍你做过的 AI 面试项目", build_avatar_prompt(session))

    def test_records_answer_metrics_and_advances_question(self):
        session = create_interview_session(
            candidate_name="张三",
            role="AI 产品全栈工程师",
            questions=QUESTIONS,
        )

        updated = record_answer(
            session,
            text="嗯，我主要负责问题生成和纪要模块，啊，也处理过追问策略。",
            duration_sec=76,
        )

        self.assertEqual(len(updated.answers), 1)
        self.assertEqual(updated.answers[0].question_id, "q_001")
        self.assertEqual(updated.answers[0].filler_word_count, 2)
        self.assertEqual(updated.answers[0].duration_sec, 76)
        self.assertEqual(updated.current_question.id, "q_002")
        self.assertTrue(any(event.type == "answer_recorded" for event in updated.events))

    def test_generates_markdown_report_with_evidence_and_review_items(self):
        session = create_interview_session(
            candidate_name="张三",
            role="AI 产品全栈工程师",
            questions=QUESTIONS,
        )
        session = record_answer(
            session,
            text="我主要负责问题生成、数字人提问和面试纪要，重点保证每条结论可以追溯到回答。",
            duration_sec=90,
        )

        report = generate_markdown_report(session)

        self.assertIn("# 智能面试纪要", report)
        self.assertIn("张三", report)
        self.assertIn("项目经验", report)
        self.assertIn("每条结论可以追溯到回答", report)
        self.assertIn("你在项目里负责哪一块？", report)
        self.assertIn("待人工确认", report)


if __name__ == "__main__":
    unittest.main()
