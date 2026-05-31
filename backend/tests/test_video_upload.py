"""视频上传端点测试"""
import io
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

from backend.interview.api import (
    SessionStore,
    _handle_video_upload_bytes,
    _handle_video_download,
    MAX_VIDEO_SIZE,
)
from backend.interview.session import create_interview_session


class VideoUploadTest(unittest.TestCase):
    def setUp(self):
        self.store = SessionStore()
        self.session = create_interview_session(
            candidate_name="test",
            user_id="test-user-id",
        )
        self.store.sessions[self.session.id] = self.session

    def test_video_upload_success(self):
        """POST raw binary webm → 200 + video_path"""
        video = b"\x1a\x45\xdf\xa3" * 100  # 模拟 webm 数据

        with patch(
            "backend.interview.api.storage_upload_video"
        ) as mock_upload:
            mock_upload.return_value = "test-user-id/session.webm"
            status, body = _handle_video_upload_bytes(
                self.store,
                self.session.id,
                "test-user-id",
                len(video),
                video,
                query_string="duration_sec=30.5",
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["video_path"], "test-user-id/session.webm")
        self.assertAlmostEqual(body["video_duration_sec"], 30.5)
        mock_upload.assert_called_once_with(
            "test-user-id", self.session.id, video
        )

    def test_video_upload_with_query_duration(self):
        """前端传入 duration_sec 查询参数应被使用"""
        video = b"\x1a\x45\xdf\xa3" * 100

        with patch(
            "backend.interview.api.storage_upload_video"
        ) as mock_upload:
            mock_upload.return_value = "u/webm"
            status, body = _handle_video_upload_bytes(
                self.store,
                self.session.id,
                "test-user-id",
                len(video),
                video,
                query_string="duration_sec=642",
            )

        self.assertEqual(status, 200)
        self.assertAlmostEqual(body["video_duration_sec"], 642.0)

    def test_video_upload_missing_session_returns_404(self):
        """session 不存在返回 404"""
        status, body = _handle_video_upload_bytes(
            self.store,
            "nonexistent",
            "test-user-id",
            10,
            b"fake-data-1",
        )
        self.assertEqual(status, 404)
        self.assertEqual(body["error"], "session_not_found")

    def test_video_upload_empty_body_returns_400(self):
        """空 body 返回 400"""
        status, body = _handle_video_upload_bytes(
            self.store,
            self.session.id,
            "test-user-id",
            0,
            b"",
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "empty_body")

    def test_video_upload_too_large_returns_413(self):
        """超过 200MB 返回 413"""
        status, body = _handle_video_upload_bytes(
            self.store,
            self.session.id,
            "test-user-id",
            MAX_VIDEO_SIZE + 1,
            b"",
        )
        self.assertEqual(status, 413)
        self.assertEqual(body["error"], "video_too_large")

    def test_video_upload_storage_failure_returns_500(self):
        """Supabase Storage 上传失败返回 500 + 标记 session"""
        video = b"some-webm-data"

        with patch(
            "backend.interview.api.storage_upload_video"
        ) as mock_upload:
            mock_upload.side_effect = RuntimeError("bucket not found")
            status, body = _handle_video_upload_bytes(
                self.store,
                self.session.id,
                "test-user-id",
                len(video),
                video,
            )

        self.assertEqual(status, 500)
        self.assertEqual(body["error"], "storage_upload_failed")
        # session 应标记为上传失败
        updated = self.store.sessions[self.session.id]
        self.assertTrue(updated.video_upload_failed)


class VideoUploadRoutingTest(unittest.TestCase):
    """测试 do_POST 对视频上传的正确路由（跳过 JSON 解析）"""

    def test_do_POST_skips_read_json_for_video_upload(self):
        """do_POST 对视频上传路径不调用 _read_json"""
        from backend.interview import api as api_mod

        # 用 __new__ 创建 handler 实例，绕过 __init__（避免 socket）
        server = api_mod.create_server("127.0.0.1", 0)
        handler_cls = server.RequestHandlerClass
        server.server_close()

        handler = handler_cls.__new__(handler_cls)
        video = b"fake-webm-video-data"
        handler.headers = {"Content-Length": str(len(video))}
        handler.path = "/api/sessions/test-session/video?duration_sec=30"
        handler.rfile = io.BytesIO(video)
        handler.wfile = io.BytesIO()
        handler.command = "POST"
        handler.requestline = f"{handler.command} {handler.path} HTTP/1.1"

        # 拦截关键方法
        called_read_json = False

        def fake_read_json():
            nonlocal called_read_json
            called_read_json = True
            return {}

        handler._read_json = fake_read_json
        handler._is_public_auth_route = MagicMock(return_value=True)
        handler._authenticate = MagicMock(return_value=None)
        handler._send_json = MagicMock()
        handler._is_video_upload_route = MagicMock(return_value=True)
        handler._handle_video_upload_raw = MagicMock(
            return_value=(200, {"video_path": "p", "video_duration_sec": 30})
        )

        handler.do_POST()

        self.assertFalse(
            called_read_json,
            "视频上传路由不应调用 _read_json（raw binary 非 JSON）",
        )
        handler._handle_video_upload_raw.assert_called_once()
        handler._send_json.assert_called_once()


class VideoDownloadTest(unittest.TestCase):
    def setUp(self):
        self.store = SessionStore()
        self.session = create_interview_session(
            candidate_name="test",
            user_id="550e8400-e29b-41d4-a716-446655440000",
        )
        self.store.sessions[self.session.id] = self.session

    def test_download_returns_404_when_no_video(self):
        """没有视频时 GET /video 返回 404"""
        status, body = _handle_video_download(
            self.store, self.session.id, "550e8400-e29b-41d4-a716-446655440000"
        )
        self.assertEqual(status, 404)
        self.assertEqual(body["error"], "video_not_found")

    def test_download_returns_signed_url(self):
        """有视频时 GET /video 返回签名 URL"""
        from dataclasses import replace

        session = replace(self.session, video_path="u/s.webm")
        self.store.sessions[self.session.id] = session

        with patch(
            "backend.interview.api.get_video_signed_url"
        ) as mock_url:
            mock_url.return_value = "https://supabase.co/storage/v1/..."
            status, body = _handle_video_download(
                self.store, self.session.id, "550e8400-e29b-41d4-a716-446655440000"
            )

        self.assertEqual(status, 200)
        self.assertIn("video_url", body)
        self.assertTrue(body["video_url"].startswith("https://"))
