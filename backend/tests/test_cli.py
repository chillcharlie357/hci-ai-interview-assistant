import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class CliTest(unittest.TestCase):
    def test_runs_demo_from_json_input_and_prints_report(self):
        payload = {
            "candidate_name": "张三",
            "resume": "候选人负责 AI 面试平台，包含问题生成和面试纪要。",
            "job_description": "岗位是 AI 产品全栈工程师，需要 Python、TypeScript 和 LLM 应用经验。",
            "interview_goal": "评估专业能力、项目经验、技术实现能力、应变能力。",
            "answers": [
                {
                    "text": "我主要负责问题生成和纪要模块，保证结论可以回到原始回答。",
                    "duration_sec": 80,
                }
            ],
        }

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
            input_path = Path(handle.name)

        try:
            result = subprocess.run(
                [sys.executable, "-m", "backend.interview.cli", str(input_path)],
                check=True,
                capture_output=True,
                text=True,
            )
        finally:
            input_path.unlink(missing_ok=True)

        self.assertIn("# 智能面试纪要", result.stdout)
        self.assertIn("张三", result.stdout)
        self.assertIn("问题生成和纪要模块", result.stdout)


if __name__ == "__main__":
    unittest.main()
