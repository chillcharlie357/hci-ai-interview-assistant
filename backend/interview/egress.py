"""LiveKit Egress 服务端录制控制。"""
from __future__ import annotations

import asyncio
import logging

from livekit.api import LiveKitAPI
from livekit.protocol import egress as egress_proto

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


async def _start_recording_async(room_name: str) -> str:
    """启动 RoomComposite 录制（async 实现），返回 egress_id。"""
    url, api_key, api_secret = _get_livekit_config()
    async with LiveKitAPI(url, api_key, api_secret) as api:
        request = egress_proto.RoomCompositeEgressRequest(
            room_name=room_name,
            layout="speaker-dark",
            advanced=egress_proto.EncodingOptions(
                width=320,
                height=240,
                framerate=15,
                video_bitrate=200_000,
            ),
            file_outputs=[egress_proto.EncodedFileOutput(
                file_type=egress_proto.FileType.FILE_WEBM,
                filepath=f"/out/{room_name}.webm",
            )],
        )
        info = await api.egress.start_room_composite_egress(request)
        log.info("Egress 启动: room=%s egress_id=%s", room_name, info.egress_id)
        return info.egress_id


async def _stop_recording_async(egress_id: str) -> dict[str, str | float]:
    """停止录制（async 实现），返回文件信息。"""
    url, api_key, api_secret = _get_livekit_config()
    async with LiveKitAPI(url, api_key, api_secret) as api:
        request = egress_proto.StopEgressRequest(egress_id=egress_id)
        info = await api.egress.stop_egress(request)
        file_result = info.file_results[0] if info.file_results else None
        if file_result is None:
            raise EgressError("录制停止但未返回文件信息")
        log.info(
            "Egress 停止: egress_id=%s file=%s duration=%.1f",
            egress_id, file_result.filename, file_result.duration or 0.0,
        )
        return {
            "file_path": file_result.filename,
            "duration_sec": file_result.duration or 0.0,
        }


def _run_async(coro):
    """在同步上下文中运行 async 协程，兼容无事件循环的场景。"""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None and loop.is_running():
        # 已有运行中的事件循环（例如 Jupyter），用新线程执行
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()

    # 没有运行中的事件循环，直接用 asyncio.run
    return asyncio.run(coro)


def start_recording(room_name: str) -> str:
    """启动房间录制，返回 egress_id。

    使用 RoomComposite 模式录制整个房间画面。
    输出为 webm（vp8+opus），320x240 15fps 200kbps，与原客户端录制参数一致。
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
