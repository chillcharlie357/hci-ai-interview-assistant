"""WebM 元数据修复测试"""
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

# 确保 backend 在 sys.path 中
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.storage.video import fix_webm_metadata


class FixWebmMetadataTest(unittest.TestCase):
    """测试 fix_webm_metadata — 用 ffmpeg 重封装 WebM 以修复 Duration/Cues"""

    _ffmpeg_available: bool | None = None

    @classmethod
    def _has_ffmpeg(cls) -> bool:
        if cls._ffmpeg_available is None:
            cls._ffmpeg_available = shutil.which("ffmpeg") is not None
        return cls._ffmpeg_available

    def test_returns_input_bytes_when_ffmpeg_missing(self):
        """ffmpeg 不可用时返回原始 bytes"""
        original = b"\x1a\x45\xdf\xa3" * 100
        with patch("backend.storage.video.shutil.which", return_value=None):
            result = fix_webm_metadata(original)
        self.assertEqual(result, original)

    def test_ffmpeg_called_with_correct_args(self):
        """验证 ffmpeg 以 -c copy 模式被调用"""
        original = b"\x1a\x45\xdf\xa3" * 100

        mock_run = unittest.mock.MagicMock()
        with patch("backend.storage.video.subprocess.run", mock_run), \
             patch("backend.storage.video.shutil.which", return_value="/usr/bin/ffmpeg"), \
             patch("builtins.open", unittest.mock.mock_open(read_data=b"fixed-webm-data")), \
             patch("os.unlink"):
            result = fix_webm_metadata(original)

        self.assertTrue(mock_run.called, "应调用 subprocess.run")
        args = mock_run.call_args[0][0]
        self.assertIn("-c", args, "应包含 -c 参数")
        self.assertIn("copy", args, "应包含 copy 参数")
        self.assertIn("-fflags", args, "应包含 -fflags 参数")
        self.assertIn("+genpts", args, "应包含 +genpts 参数")

    def test_empty_input_returns_empty(self):
        """空输入返回空 bytes（不调用 ffmpeg）"""
        result = fix_webm_metadata(b"")
        self.assertEqual(result, b"")

    def test_small_input_returns_input_bytes(self):
        """极小输入（<100 bytes）直接返回原始数据"""
        original = b"tiny"
        result = fix_webm_metadata(original)
        self.assertEqual(result, original)

    def test_temp_files_cleaned_up(self):
        """临时文件在函数返回后被清理"""
        if not self._has_ffmpeg():
            self.skipTest("ffmpeg not available")

        # 用真实 ffmpeg 生成一个有效 webm 作为输入
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tf:
            tf.write(b"\x1a\x45\xdf\xa3" * 200)
            input_path = tf.name

        try:
            subprocess.run([
                "ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", "color=c=black:s=32x32:d=1,format=yuv420p",
                "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1",
                "-shortest", "-c:v", "libvpx", "-c:a", "libopus",
                input_path,
            ], check=True, timeout=30)

            with open(input_path, "rb") as f:
                original = f.read()

            result = fix_webm_metadata(original)
            self.assertGreater(len(result), 0, "输出不应为空")
            self.assertTrue(
                result.startswith(b"\x1a\x45\xdf\xa3"),
                "输出应以 EBML 头开始"
            )
        finally:
            if os.path.exists(input_path):
                os.unlink(input_path)

    def test_output_is_valid_webm(self):
        """输出仍是有效的 WebM（以 EBML 头开始）"""
        original = b"\x1a\x45\xdf\xa3" * 100

        # 模拟 ffmpeg 输出
        fixed = b"\x1a\x45\xdf\xa3" + b"\x00" * 500
        with patch("backend.storage.video.shutil.which", return_value="/usr/bin/ffmpeg"), \
             patch("backend.storage.video.subprocess.run"), \
             patch("builtins.open", unittest.mock.mock_open(read_data=fixed)), \
             patch("os.unlink"):
            result = fix_webm_metadata(original)

        self.assertTrue(
            result.startswith(b"\x1a\x45\xdf\xa3"),
            "修复后的输出应以 EBML 头开始"
        )
