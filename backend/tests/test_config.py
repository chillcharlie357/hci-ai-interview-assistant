import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.interview.config import get_csv_env, load_dotenv


class ConfigTest(unittest.TestCase):
    def test_loads_dotenv_without_overriding_existing_environment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "OPENAI_API_KEY=file-key",
                        "OPENAI_MODEL='file-model'",
                        "OPENAI_BASE_URL=\"https://example.test/v1\"",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.dict(os.environ, {"OPENAI_API_KEY": "existing-key"}, clear=True):
                load_dotenv(env_path)

                self.assertEqual(os.environ["OPENAI_API_KEY"], "existing-key")
                self.assertEqual(os.environ["OPENAI_MODEL"], "file-model")
                self.assertEqual(os.environ["OPENAI_BASE_URL"], "https://example.test/v1")

    def test_reads_csv_config_values(self):
        with patch.dict(os.environ, {"INTERVIEW_DISABLE_DOTENV": "1", "INTERVIEW_FILLER_WORDS": "嗯, 啊, like"}, clear=True):
            self.assertEqual(get_csv_env("INTERVIEW_FILLER_WORDS", ["fallback"]), ["嗯", "啊", "like"])


if __name__ == "__main__":
    unittest.main()
