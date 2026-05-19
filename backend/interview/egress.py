"""LiveKit Egress 服务端录制控制。

使用 Twirp JSON API 直接与 Egress 通信，包含 ws_url 字段（旧版 Python SDK 不支持）。
"""
from __future__ import annotations

import asyncio
import json
import logging

import aiohttp
from livekit.api import AccessToken, VideoGrants

from backend.interview.config import get_env

log = logging.getLogger(__name__)


class EgressError(Exception):
    """Egress 操作失败。"""


def _get_livekit_config() -> tuple[str, str, str]:
    """获取 LiveKit 配置，未配置时抛出 EgressError。"""
    url = get_env("LIVEKIT_URL")
    api_key = get_env("LIVEKIT_API_KEY")
    api_secret = get_env("LIVEKIT_API_SECRET")
    if not url or not api_key or not api_secret:
        raise EgressError("LiveKit 未配置，请设置 LIVEKIT_URL、LIVEKIT_API_KEY、LIVEKIT_API_SECRET。")
    return url, api_key, api_secret


def _http_url(ws_url: str, path: str) -> str:
    """将 ws://livekit:7880 替换为 http://livekit:7880/twirp/..."""
    http = ws_url.replace("ws://", "http://").rstrip("/")
    return f"{http}{path}"


def _make_auth_header(api_key: str, api_secret: str) -> dict[str, str]:
    """生成 LiveKit Twirp API 的 Authorization header。"""
    token = (
        AccessToken(api_key, api_secret)
        .with_grants(VideoGrants(room_record=True))
        .to_jwt()
    )
    return {"Authorization": f"Bearer {token}"}


async def _start_recording_async(room_name: str) -> str:
    """启动 RoomComposite 录制（Twirp JSON），返回 egress_id。"""
    url, api_key, api_secret = _get_livekit_config()
    start_url = _http_url(url, "/twirp/livekit.Egress/StartRoomCompositeEgress")

    payload = {
        "room_name": room_name,
        "layout": "speaker-dark",
        "custom_base_url": _http_url(url, ""),
        "ws_url": url,
        "advanced": {
            "width": 320,
            "height": 240,
            "framerate": 15,
            "video_bitrate": 200000,
        },
        "file_outputs": [
            {
                "file_type": "MP4",
                "filepath": f"/out/{room_name}.mp4",
            }
        ],
    }

    headers = {
        "Content-Type": "application/json",
        **_make_auth_header(api_key, api_secret),
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            start_url, json=payload, headers=headers,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            body = await resp.text()
            if resp.status != 200:
                raise EgressError(f"启动录制失败: HTTP {resp.status} {body}")
            data = json.loads(body)
            egress_id = data.get("egress_id", "")
            log.info("Egress 启动: room=%s egress_id=%s", room_name, egress_id)
            return egress_id


async def _stop_recording_async(egress_id: str) -> dict[str, str | float]:
    """停止录制（Twirp JSON），返回文件信息。"""
    url, api_key, api_secret = _get_livekit_config()
    stop_url = _http_url(url, "/twirp/livekit.Egress/StopEgress")

    headers = {
        "Content-Type": "application/json",
        **_make_auth_header(api_key, api_secret),
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            stop_url, json={"egress_id": egress_id}, headers=headers,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            body = await resp.text()
            if resp.status != 200:
                raise EgressError(f"停止录制失败: HTTP {resp.status} {body}")
            info = json.loads(body)
            file_results = info.get("file_results", [])
            if not file_results:
                raise EgressError("录制停止但未返回文件信息")
            file_result = file_results[0]
            log.info(
                "Egress 停止: egress_id=%s file=%s duration=%.1f",
                egress_id, file_result.get("filename", ""), file_result.get("duration", 0.0),
            )
            return {
                "file_path": file_result.get("filename", ""),
                "duration_sec": file_result.get("duration", 0.0),
            }


def _run_async(coro):
    """在同步上下文中运行 async 协程，兼容无事件循环的场景。"""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()

    return asyncio.run(coro)


def start_recording(room_name: str) -> str:
    """启动房间录制，返回 egress_id。

    使用 RoomComposite 模式录制整个房间画面。
    输出为 MP4，320x240 15fps 200kbps。
    """
    try:
        return _run_async(_start_recording_async(room_name))
    except EgressError:
        raise
    except Exception as exc:
        raise EgressError(f"启动录制失败: {exc}") from exc


def stop_recording(egress_id: str) -> dict[str, str | float]:
    """停止录制，返回文件信息 {file_path, duration_sec}。"""
    try:
        return _run_async(_stop_recording_async(egress_id))
    except EgressError:
        raise
    except Exception as exc:
        raise EgressError(f"停止录制失败: {exc}") from exc
