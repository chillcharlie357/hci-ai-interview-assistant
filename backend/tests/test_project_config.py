import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ProjectConfigTest(unittest.TestCase):
    def test_pyproject_declares_uv_managed_python_project(self):
        pyproject_path = ROOT / "pyproject.toml"

        self.assertTrue(pyproject_path.exists())
        config = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))

        self.assertEqual(config["project"]["name"], "hci-ai-interview-assistant")
        self.assertGreaterEqual(config["project"]["requires-python"], ">=3.12")
        self.assertEqual(config["tool"]["uv"]["package"], False)

    def test_shell_scripts_run_backend_through_uv(self):
        test_script = (ROOT / "scripts" / "test.sh").read_text(encoding="utf-8")

        self.assertIn("uv run python -m unittest discover -s backend/tests", test_script)


if __name__ == "__main__":
    unittest.main()
