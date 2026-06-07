"""Supabase Storage 视频操作"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile

from backend.auth.supabase_client import get_service_client

log = logging.getLogger("backend.storage.video")

VIDEO_BUCKET = "interview-videos"

MIN_WEBM_SIZE = 100


def fix_webm_metadata(video_bytes: bytes) -> bytes:
    """用 ffmpeg -c copy 重建 WebM 的 Duration/Cues 元数据（不重新编码）。

    MediaRecorder 生成的流式 WebM 缺少完整 Duration 和 Cues 索引，
    导致浏览器边下边解析，进度条总时长逐段增加。本函数用 ffmpeg 重写
    容器元数据解决此问题，对 100MB 视频约耗时 1-2 秒。
    """
    if not video_bytes or len(video_bytes) < MIN_WEBM_SIZE:
        return video_bytes

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        log.warning("ffmpeg not found, returning original bytes (duration may display incorrectly)")
        return video_bytes

    fin_path: str | None = None
    fout_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as fin, \
             tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as fout:
            fin.write(video_bytes)
            fin.flush()
            fin_path = fin.name
            fout_path = fout.name

        subprocess.run(
            [
                ffmpeg_bin, "-y", "-v", "warning",
                "-fflags", "+genpts",
                "-i", fin_path,
                "-c", "copy",
                "-f", "webm",
                fout_path,
            ],
            check=True,
            timeout=120,
        )

        with open(fout_path, "rb") as f:
            fixed = f.read()
        log.info("fix_webm_metadata: fixed, size %d -> %d bytes",
                 len(video_bytes), len(fixed))
        return fixed
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
        log.warning("fix_webm_metadata failed (ffmpeg error), returning original bytes: %s", e)
        return video_bytes
    finally:
        for p in (fin_path, fout_path):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass


def upload_video(user_id: str, session_id: str, video_bytes: bytes) -> str:
    """上传面试视频到 Supabase Storage，返回存储路径"""
    client = get_service_client()
    if client is None:
        raise RuntimeError("Supabase service client not configured")

    fixed_bytes = fix_webm_metadata(video_bytes)
    log.info("upload_video: size=%d bytes, session=%s", len(fixed_bytes), session_id)

    path = f"{user_id}/{session_id}.webm"
    client.storage.from_(VIDEO_BUCKET).upload(
        path, fixed_bytes,
        {"content-type": "video/webm", "upsert": "true"}
    )
    return path


def get_video_signed_url(user_id: str, session_id: str, expires_in: int = 3600) -> str:
    """生成面试视频的签名 URL"""
    client = get_service_client()
    if client is None:
        raise RuntimeError("Supabase service client not configured")

    path = f"{user_id}/{session_id}.webm"
    response = client.storage.from_(VIDEO_BUCKET).create_signed_url(path, expires_in)
    return str(response.get("signedURL", "")) if isinstance(response, dict) else str(response)
