"""真实 Supabase Storage 集成测试 — 无需完整面试流程即可验证上传/下载

运行方式:
    uv run python -m backend.tests.test_video_storage_integration

环境要求:
    - .env 中配置了 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
    - Supabase Storage 中存在 interview-videos bucket
"""

import os
import sys
import unittest

# 确保 backend 在 sys.path 中
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.storage.video import upload_video, get_video_signed_url, VIDEO_BUCKET
from backend.auth.supabase_client import get_service_client, reset_client

TEST_USER_ID = "integration-test-user"
TEST_SESSION_ID = "test-session-00000000-0000-0000-0000-000000000000"

# 最小的有效 WebM 字节（EBML header + 空 Segment）
MINIMAL_WEBM = (
    b"\x1a\x45\xdf\xa3\x01\x00\x00\x00\x00\x00\x00"  # EBML
    b"\x1f\x43\xb6\x75\x01\x00\x00\x00\x00\x00\x00"  # EBML version
    b"\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08\x42\x82\x84\x77\x65\x62\x6d"
    b"\x42\x87\x81\x04\x42\x85\x81\x02\x18\x53\x80\x67\x01\x00\x00\x00\x00\x00\x00\x00\x15\x49\xa9\x66"
)


def _delete_test_file(path: str) -> None:
    client = get_service_client()
    if client:
        client.storage.from_(VIDEO_BUCKET).remove([path])


class VideoStorageIntegrationTest(unittest.TestCase):
    """真实 Supabase Storage 集成测试"""

    @classmethod
    def setUpClass(cls):
        """检查 Supabase 是否可用"""
        reset_client()
        client = get_service_client()
        if client is None:
            raise unittest.SkipTest(
                "Supabase 未配置（缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）"
            )
        # 验证 bucket 是否存在
        try:
            buckets = client.storage.list_buckets()
            bucket_names = [b.name for b in buckets]
            if VIDEO_BUCKET not in bucket_names:
                raise unittest.SkipTest(
                    f"Bucket '{VIDEO_BUCKET}' 不存在，请先在 Supabase Dashboard 创建"
                )
        except Exception as e:
            raise unittest.SkipTest(f"无法连接 Supabase Storage: {e}")

    @classmethod
    def tearDownClass(cls):
        reset_client()

    def tearDown(self):
        _delete_test_file(f"{TEST_USER_ID}/{TEST_SESSION_ID}.webm")

    def test_upload_and_signed_url(self):
        """上传一段假 webm → 获取签名 URL → URL 非空"""
        path = upload_video(TEST_USER_ID, TEST_SESSION_ID, MINIMAL_WEBM)
        self.assertEqual(path, f"{TEST_USER_ID}/{TEST_SESSION_ID}.webm")

        url = get_video_signed_url(TEST_USER_ID, TEST_SESSION_ID, expires_in=60)
        self.assertTrue(url.startswith("https://"), f"签名 URL 应以 https 开头: {url}")
        print(f"\n  ✅ 上传成功: {path}")
        print(f"  ✅ 签名 URL: {url[:80]}...")

    def test_upload_with_larger_payload(self):
        """上传 ~1MB 数据模拟真实录制"""
        payload = MINIMAL_WEBM + b"\x00" * 1_000_000
        path = upload_video(TEST_USER_ID, TEST_SESSION_ID, payload)
        self.assertEqual(path, f"{TEST_USER_ID}/{TEST_SESSION_ID}.webm")
        print(f"\n  ✅ 1MB 上传成功")


if __name__ == "__main__":
    unittest.main()
