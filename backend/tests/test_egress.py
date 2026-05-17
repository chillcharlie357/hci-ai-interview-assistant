"""Tests for backend.interview.egress – LiveKit Egress 录制控制。"""
import unittest
from unittest.mock import AsyncMock, patch

from backend.interview.egress import EgressError, start_recording, stop_recording


class StartRecordingTest(unittest.TestCase):
    """start_recording 测试组。"""

    @patch("backend.interview.egress.get_env", return_value="")
    def test_start_recording_unconfigured(self, mock_env):
        """LiveKit 环境变量未设置时，应抛出 EgressError。"""
        with self.assertRaises(EgressError) as ctx:
            start_recording("test-room")
        self.assertIn("LiveKit", str(ctx.exception))

    @patch("backend.interview.egress._start_recording_async", new_callable=AsyncMock)
    @patch("backend.interview.egress._get_livekit_config")
    def test_start_recording_returns_egress_id(self, mock_config, mock_async):
        """正常启动录制，应返回 egress_id 字符串。"""
        mock_config.return_value = ("ws://localhost:7880", "key", "secret")
        mock_async.return_value = "egress-abc-123"

        result = start_recording("test-room")
        self.assertEqual(result, "egress-abc-123")
        mock_async.assert_awaited_once_with("test-room")

    @patch("backend.interview.egress._start_recording_async", new_callable=AsyncMock)
    @patch("backend.interview.egress._get_livekit_config")
    def test_start_recording_api_failure(self, mock_config, mock_async):
        """LiveKit API 调用异常时，应抛出 EgressError。"""
        mock_config.return_value = ("ws://localhost:7880", "key", "secret")
        mock_async.side_effect = RuntimeError("connection refused")

        with self.assertRaises(EgressError) as ctx:
            start_recording("test-room")
        self.assertIn("启动录制失败", str(ctx.exception))


class StopRecordingTest(unittest.TestCase):
    """stop_recording 测试组。"""

    @patch("backend.interview.egress.get_env", return_value="")
    def test_stop_recording_unconfigured(self, mock_env):
        """LiveKit 环境变量未设置时，应抛出 EgressError。"""
        with self.assertRaises(EgressError) as ctx:
            stop_recording("egress-xyz")
        self.assertIn("LiveKit", str(ctx.exception))

    @patch("backend.interview.egress._stop_recording_async", new_callable=AsyncMock)
    @patch("backend.interview.egress._get_livekit_config")
    def test_stop_recording_returns_file_info(self, mock_config, mock_async):
        """正常停止录制，应返回包含 file_path 和 duration_sec 的字典。"""
        mock_config.return_value = ("ws://localhost:7880", "key", "secret")
        mock_async.return_value = {
            "file_path": "/out/test-room.webm",
            "duration_sec": 120.5,
        }

        result = stop_recording("egress-abc-123")
        self.assertEqual(result["file_path"], "/out/test-room.webm")
        self.assertEqual(result["duration_sec"], 120.5)
        mock_async.assert_awaited_once_with("egress-abc-123")

    @patch("backend.interview.egress._stop_recording_async", new_callable=AsyncMock)
    @patch("backend.interview.egress._get_livekit_config")
    def test_stop_recording_api_failure(self, mock_config, mock_async):
        """LiveKit API 调用异常时，应抛出 EgressError。"""
        mock_config.return_value = ("ws://localhost:7880", "key", "secret")
        mock_async.side_effect = RuntimeError("connection refused")

        with self.assertRaises(EgressError) as ctx:
            stop_recording("egress-abc-123")
        self.assertIn("停止录制失败", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
