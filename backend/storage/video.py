"""Supabase Storage 视频操作"""

from __future__ import annotations

from backend.auth.supabase_client import get_service_client

VIDEO_BUCKET = "interview-videos"


def upload_video(user_id: str, session_id: str, video_bytes: bytes) -> str:
    """上传面试视频到 Supabase Storage，返回存储路径"""
    client = get_service_client()
    if client is None:
        raise RuntimeError("Supabase service client not configured")

    path = f"{user_id}/{session_id}.webm"
    client.storage.from_(VIDEO_BUCKET).upload(path, video_bytes, {"content-type": "video/webm", "upsert": "true"})
    return path


def get_video_signed_url(user_id: str, session_id: str, expires_in: int = 3600) -> str:
    """生成面试视频的签名 URL"""
    client = get_service_client()
    if client is None:
        raise RuntimeError("Supabase service client not configured")

    path = f"{user_id}/{session_id}.webm"
    response = client.storage.from_(VIDEO_BUCKET).create_signed_url(path, expires_in)
    return str(response.get("signedURL", "")) if isinstance(response, dict) else str(response)
