"""单元测试：追问决策器 ``backend.interview.followup_engine``。

覆盖点：
- 配置开关 ``INTERVIEW_FOLLOWUP_ENABLED`` 关闭时立即 finished
- 达到 ``INTERVIEW_FOLLOWUP_MAX_ROUNDS`` 上限后 finished
- 空答案不追问
- LLM 未配置时 finished
- LLM 返回 ``need_followup=True`` 时返回未结束 + 追问文本
- LLM 返回 ``need_followup=False`` 时 finished
- LLM 返回过长追问时被截断
- LLM 调用 fallback（status != ok）时 finished
"""
from __future__ import annotations

import unittest
from typing import cast
from unittest.mock import patch

from backend.interview.followup_engine import (
    decide_followup,
    get_followup_max_rounds,
    is_followup_enabled,
)
from backend.interview.llm_client import LlmClient, LlmConfig, LlmResult
from backend.interview.session import FollowupState, FollowupTurn


class _FakeLlm:
    """轻量 LLM 替身，仅用于测试 decide_followup（鸭子类型）。"""

    config: LlmConfig
    _result: LlmResult
    calls: list[tuple[str, str]]

    def __init__(self, configured: bool, result: LlmResult | None = None):
        self.config = LlmConfig(api_key="k" if configured else "", model="m" if configured else "")
        self._result = result or LlmResult(status="ok", data=None)
        self.calls = []

    def complete_json(self, system_prompt: str, user_prompt: str) -> LlmResult:
        self.calls.append((system_prompt, user_prompt))
        return self._result


def _as_client(fake: _FakeLlm) -> LlmClient:
    """把 _FakeLlm 当作 LlmClient 传入；运行期是鸭子类型，仅为静态检查。"""
    return cast(LlmClient, cast(object, fake))


class FollowupConfigTest(unittest.TestCase):
    def test_max_rounds_default_is_two(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(get_followup_max_rounds(), 2)

    def test_max_rounds_reads_env(self):
        with patch.dict("os.environ", {"INTERVIEW_FOLLOWUP_MAX_ROUNDS": "3"}):
            self.assertEqual(get_followup_max_rounds(), 3)

    def test_max_rounds_invalid_falls_back_to_two(self):
        with patch.dict("os.environ", {"INTERVIEW_FOLLOWUP_MAX_ROUNDS": "abc"}):
            self.assertEqual(get_followup_max_rounds(), 2)

    def test_max_rounds_negative_clamped_to_zero(self):
        with patch.dict("os.environ", {"INTERVIEW_FOLLOWUP_MAX_ROUNDS": "-1"}):
            self.assertEqual(get_followup_max_rounds(), 0)

    def test_enabled_default_true(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertTrue(is_followup_enabled())

    def test_enabled_false_when_set_to_false(self):
        with patch.dict("os.environ", {"INTERVIEW_FOLLOWUP_ENABLED": "false"}):
            self.assertFalse(is_followup_enabled())

    def test_enabled_false_when_set_to_zero(self):
        with patch.dict("os.environ", {"INTERVIEW_FOLLOWUP_ENABLED": "0"}):
            self.assertFalse(is_followup_enabled())


_DEFAULT_PROMPT = "请介绍你做过的 AI 项目。"
_DEFAULT_DIM = "项目经验"
_DEFAULT_ANSWER = "我做过一个 AI 面试平台，负责问题生成与纪要模块。"


class DecideFollowupTest(unittest.TestCase):
    def setUp(self):
        # 默认：追问开关开启、上限 2、不读 .env，避免外部干扰
        env_patcher = patch.dict(
            "os.environ",
            {
                "INTERVIEW_DISABLE_DOTENV": "1",
                "INTERVIEW_FOLLOWUP_ENABLED": "true",
                "INTERVIEW_FOLLOWUP_MAX_ROUNDS": "2",
            },
            clear=True,
        )
        env_patcher.start()
        self.addCleanup(env_patcher.stop)

    # --- 配置类降级 -------------------------------------------------

    def test_returns_finished_when_disabled(self):
        with patch.dict("os.environ", {"INTERVIEW_FOLLOWUP_ENABLED": "false"}):
            decision = decide_followup(
                question_prompt=_DEFAULT_PROMPT,
                question_dimension=_DEFAULT_DIM,
                prev_state=None,
                latest_answer=_DEFAULT_ANSWER,
                llm_client=_as_client(_FakeLlm(configured=True)),
            )
        self.assertTrue(decision.finished)
        self.assertEqual(decision.reason, "followup_disabled")

    def test_returns_finished_when_max_rounds_reached(self):
        prev = FollowupState(
            question_id="q_001",
            turns=[],
            asked_count=2,  # 已达上限
            finished=False,
            pending_question=None,
        )
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=prev,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(_FakeLlm(configured=True)),
        )
        self.assertTrue(decision.finished)
        self.assertEqual(decision.reason, "max_rounds_reached")

    def test_returns_finished_for_empty_answer(self):
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=None,
            latest_answer="   ",
            llm_client=_as_client(_FakeLlm(configured=True)),
        )
        self.assertTrue(decision.finished)
        self.assertEqual(decision.reason, "empty_answer")

    def test_returns_finished_when_llm_not_configured(self):
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=None,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(_FakeLlm(configured=False)),
        )
        self.assertTrue(decision.finished)
        self.assertEqual(decision.llm_status, "fallback")
        self.assertEqual(decision.reason, "llm_not_configured")

    def test_returns_finished_when_llm_status_not_ok(self):
        fake = _FakeLlm(configured=True, result=LlmResult(status="fallback", data=None))
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=None,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(fake),
        )
        self.assertTrue(decision.finished)
        self.assertEqual(decision.llm_status, "fallback")
        self.assertEqual(decision.reason, "llm_fallback")

    # --- LLM 决策正反两侧 ----------------------------------------------

    def test_continues_when_llm_requests_followup(self):
        fake = _FakeLlm(
            configured=True,
            result=LlmResult(
                status="ok",
                data={
                    "need_followup": True,
                    "followup_question": "你在项目中具体负责哪一块的设计？",
                    "reason": "lacks personal contribution",
                },
            ),
        )
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=None,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(fake),
        )
        self.assertFalse(decision.finished)
        self.assertEqual(decision.followup_question, "你在项目中具体负责哪一块的设计？")
        self.assertEqual(decision.llm_status, "ok")
        self.assertEqual(len(fake.calls), 1)

    def test_finishes_when_llm_says_need_followup_false(self):
        fake = _FakeLlm(
            configured=True,
            result=LlmResult(status="ok", data={"need_followup": False, "followup_question": "", "reason": "concrete"}),
        )
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=None,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(fake),
        )
        self.assertTrue(decision.finished)
        self.assertEqual(decision.followup_question, "")
        self.assertEqual(decision.llm_status, "ok")

    def test_finishes_when_need_true_but_question_empty(self):
        fake = _FakeLlm(
            configured=True,
            result=LlmResult(status="ok", data={"need_followup": True, "followup_question": "", "reason": "x"}),
        )
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=None,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(fake),
        )
        self.assertTrue(decision.finished)

    def test_truncates_overlong_followup_question(self):
        # 70 个汉字，超过 60 字上限
        long_q = "请" * 70
        fake = _FakeLlm(
            configured=True,
            result=LlmResult(
                status="ok",
                data={"need_followup": True, "followup_question": long_q, "reason": "ok"},
            ),
        )
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=None,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(fake),
        )
        self.assertFalse(decision.finished)
        self.assertLessEqual(len(decision.followup_question), 61)
        self.assertTrue(decision.followup_question.endswith("…"))

    def test_explicit_max_rounds_param_overrides_env(self):
        # 显式传 max_rounds=0，应当立即 finished
        prev = FollowupState(question_id="q_001", turns=[], asked_count=0)
        decision = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=prev,
            latest_answer=_DEFAULT_ANSWER,
            llm_client=_as_client(_FakeLlm(configured=True)),
            max_rounds=0,
        )
        self.assertTrue(decision.finished)
        self.assertEqual(decision.reason, "max_rounds_reached")

    def test_passes_conversation_window_to_llm(self):
        prev = FollowupState(
            question_id="q_001",
            turns=[
                FollowupTurn(role="interviewer", text="请介绍你做过的 AI 项目。", timestamp="t0"),
                FollowupTurn(role="candidate", text="做过一个面试平台。", timestamp="t1"),
                FollowupTurn(role="interviewer", text="你具体负责哪一块？", timestamp="t2"),
            ],
            asked_count=1,
        )
        fake = _FakeLlm(
            configured=True,
            result=LlmResult(status="ok", data={"need_followup": False, "followup_question": "", "reason": "ok"}),
        )
        _ = decide_followup(
            question_prompt=_DEFAULT_PROMPT,
            question_dimension=_DEFAULT_DIM,
            prev_state=prev,
            latest_answer="我负责问题生成模块。",
            llm_client=_as_client(fake),
        )
        self.assertEqual(len(fake.calls), 1)
        _, user_prompt = fake.calls[0]
        # 历史对话 + 最新回答都进入了 prompt
        self.assertIn("做过一个面试平台", user_prompt)
        self.assertIn("我负责问题生成模块", user_prompt)
        # asked_so_far 上下文也要带上
        self.assertIn("asked_followups_so_far", user_prompt)


if __name__ == "__main__":
    unittest.main()
