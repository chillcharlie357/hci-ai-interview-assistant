import json
import os
import unittest
from unittest.mock import patch

from backend.interview.llm_client import LlmClient, LlmConfig, LlmResult


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class LlmClientTest(unittest.TestCase):
    def test_returns_fallback_when_not_configured(self):
        result = LlmClient(LlmConfig(api_key="", model="")).complete_json("system", "user")

        self.assertEqual(result.status, "fallback")
        self.assertIsNone(result.data)

    @patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "test-model"}, clear=True)
    @patch("backend.interview.llm_client.urlopen")
    def test_calls_openai_compatible_chat_completions(self, urlopen_mock):
        urlopen_mock.return_value = FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": "{\"questions\":[{\"dimension\":\"项目经验\",\"prompt\":\"讲项目\",\"follow_ups\":[\"追问\"],\"evidence_hints\":[\"观察\"]}]}"
                        }
                    }
                ]
            }
        )

        result = LlmClient.from_env().complete_json("system", "user")

        self.assertEqual(result.status, "ok")
        self.assertEqual(result.data["questions"][0]["dimension"], "项目经验")
        request = urlopen_mock.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.openai.com/v1/chat/completions")
        self.assertEqual(request.headers["Authorization"], "Bearer test-key")

    @patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "test-model"}, clear=True)
    @patch("backend.interview.llm_client.urlopen")
    def test_invalid_model_response_falls_back(self, urlopen_mock):
        urlopen_mock.return_value = FakeResponse({"choices": [{"message": {"content": "not json"}}]})

        result = LlmClient.from_env().complete_json("system", "user")

        self.assertIsInstance(result, LlmResult)
        self.assertEqual(result.status, "fallback")
        self.assertIsNone(result.data)


if __name__ == "__main__":
    unittest.main()
