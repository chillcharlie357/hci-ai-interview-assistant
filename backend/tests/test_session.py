import unittest
from unittest.mock import patch

from backend.interview.followup_engine import FollowupDecision
from backend.interview.question_engine import InterviewQuestion
from backend.interview.session import (
    InterviewSession,
    build_avatar_prompt,
    create_interview_session,
    generate_markdown_report,
    record_answer,
)


def _current_question_id(session: InterviewSession) -> str | None:
    question = session.current_question
    return question.id if question else None


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
        self.assertEqual(_current_question_id(session), "q_001")
        self.assertIn("数字人面试官已准备", session.events[0].message)
        self.assertIn("请介绍你做过的 AI 面试项目", build_avatar_prompt(session))

    def test_records_answer_metrics_and_advances_question(self):
        session = create_interview_session(
            candidate_name="张三",
            role="AI 产品全栈工程师",
            questions=QUESTIONS,
        )

        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1", "INTERVIEW_FILLER_WORDS": "嗯,啊"}, clear=True):
            updated = record_answer(
                session,
                text="嗯，我主要负责问题生成和纪要模块，啊，也处理过追问策略。",
                duration_sec=76,
            )

        self.assertEqual(len(updated.answers), 1)
        self.assertEqual(updated.answers[0].question_id, "q_001")
        self.assertEqual(updated.answers[0].filler_word_count, 2)
        self.assertEqual(updated.answers[0].duration_sec, 76)
        self.assertEqual(_current_question_id(updated), "q_002")
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


class FollowupBehaviorTest(unittest.TestCase):
    """追问推进逻辑：current_index 是否前进、AnswerRecord 字段、报告聚合。"""

    def _new_session(self):
        return create_interview_session(
            candidate_name="张三",
            role="AI 产品全栈工程师",
            questions=QUESTIONS,
        )

    def test_followup_decision_keeps_current_question(self):
        session = self._new_session()
        decision = FollowupDecision(
            finished=False,
            followup_question="你在项目里具体负责哪一块？",
            reason="needs detail",
            llm_status="ok",
        )
        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1"}, clear=True):
            updated = record_answer(
                session,
                text="我做过一个面试平台。",
                duration_sec=20,
                followup_decision=decision,
            )

        self.assertEqual(_current_question_id(updated), "q_001")  # 不推进
        self.assertEqual(len(updated.answers), 1)
        first = updated.answers[0]
        self.assertFalse(first.is_followup)  # 主问题首答
        self.assertEqual(first.followup_round, 0)
        self.assertEqual(updated.current_followup, "你在项目里具体负责哪一块？")
        self.assertTrue(any(e.type == "followup_asked" for e in updated.events))

    def test_followup_round_two_then_finish_advances(self):
        """第一次追问保持原题，第二次回答 + finished 决策应当推进到下一题。"""
        session = self._new_session()
        first_decision = FollowupDecision(finished=False, followup_question="可以再具体说说吗？", llm_status="ok")
        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1"}, clear=True):
            after_main = record_answer(
                session,
                text="我做过一个面试平台。",
                duration_sec=15,
                followup_decision=first_decision,
            )
            # 候选人回答追问后，LLM 决定不再追问 -> finished=True
            done_decision = FollowupDecision(finished=True, reason="enough", llm_status="ok")
            after_followup = record_answer(
                after_main,
                text="主要做问题生成模块和打分逻辑。",
                duration_sec=18,
                followup_decision=done_decision,
            )

        self.assertEqual(_current_question_id(after_followup), "q_002")  # 推进
        self.assertEqual(len(after_followup.answers), 2)
        followup_answer = after_followup.answers[1]
        self.assertTrue(followup_answer.is_followup)
        self.assertEqual(followup_answer.followup_round, 1)
        self.assertEqual(followup_answer.followup_prompt, "可以再具体说说吗？")
        # current_followup 应当回归 None（finished）
        # 注意：current_question 已是 q_002，q_002 还没有 followup_state
        self.assertIsNone(after_followup.current_followup)

    def test_finished_decision_advances_immediately(self):
        session = self._new_session()
        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1"}, clear=True):
            updated = record_answer(
                session,
                text="我负责问题生成模块。",
                duration_sec=30,
                followup_decision=FollowupDecision(finished=True, llm_status="fallback"),
            )

        self.assertEqual(_current_question_id(updated), "q_002")
        self.assertEqual(len(updated.answers), 1)
        self.assertFalse(updated.answers[0].is_followup)

    def test_no_decision_falls_back_to_advance(self):
        """followup_decision=None 时（LLM 抛异常等），与原行为一致：直接推进。"""
        session = self._new_session()
        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1"}, clear=True):
            updated = record_answer(session, text="我负责问题生成。", duration_sec=20)
        self.assertEqual(_current_question_id(updated), "q_002")

    def test_report_includes_followup_trace(self):
        session = self._new_session()
        with patch.dict("os.environ", {"INTERVIEW_DISABLE_DOTENV": "1"}, clear=True):
            session = record_answer(
                session,
                text="我做过一个面试平台。",
                duration_sec=15,
                followup_decision=FollowupDecision(
                    finished=False, followup_question="你具体负责哪一块？", llm_status="ok"
                ),
            )
            session = record_answer(
                session,
                text="主要负责问题生成和报告。",
                duration_sec=20,
                followup_decision=FollowupDecision(finished=True, llm_status="ok"),
            )

        report = generate_markdown_report(session)
        self.assertIn("追问 1：你具体负责哪一块？", report)
        self.assertIn("主要负责问题生成和报告", report)
        # 触发追问回合应当出现在概览
        self.assertIn("触发追问回合：1", report)


if __name__ == "__main__":
    unittest.main()
