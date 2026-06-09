import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.interview import config
from backend.interview.config import get_csv_env, load_dotenv, load_runtime_dotenv_files


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

    def test_loads_render_secret_dotenv_without_overriding_local_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            local_env_path = Path(temp_dir) / ".env"
            render_env_path = Path(temp_dir) / ".env.prod"
            local_env_path.write_text("OPENAI_MODEL=local-model\n", encoding="utf-8")
            render_env_path.write_text(
                "\n".join(
                    [
                        "OPENAI_MODEL=render-model",
                        "SUPABASE_URL=https://example.supabase.co",
                    ]
                ),
                encoding="utf-8",
            )

            with (
                patch.dict(os.environ, {}, clear=True),
                patch.object(config, "DEFAULT_DOTENV_PATH", local_env_path),
                patch.object(config, "DEFAULT_RENDER_SECRET_DOTENV_PATH", render_env_path),
            ):
                load_runtime_dotenv_files()

                self.assertEqual(os.environ["OPENAI_MODEL"], "local-model")
                self.assertEqual(os.environ["SUPABASE_URL"], "https://example.supabase.co")


if __name__ == "__main__":
    unittest.main()
