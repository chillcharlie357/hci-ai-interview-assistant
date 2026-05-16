import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class MockResumeToolsTest(unittest.TestCase):
    def test_generates_docx_and_mock_mineru_extracts_markdown(self):
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "generate_mock_resumes.py")],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        resume_path = ROOT / "mock-resumes" / "frontend_senior_li_ming.pdf"
        self.assertTrue(resume_path.exists())

        extracted = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "mock_mineru_open_api.py"), "flash-extract", str(resume_path)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertIn("# Mock Resume", extracted.stdout)
        self.assertIn("frontend_senior_li_ming.pdf", extracted.stdout)


if __name__ == "__main__":
    unittest.main()
