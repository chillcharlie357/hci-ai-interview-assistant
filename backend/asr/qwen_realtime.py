"""Qwen3-ASR-Flash-Realtime WebSocket 中转服务。

架构：
  浏览器 (mic → 16kHz mono PCM16 chunk)
      ⇅ WebSocket (本模块)
  DashScope OmniRealtimeConversation (qwen3-asr-flash-realtime)

为什么要中转：
  1. DashScope API Key 只留在后端，不暴露到浏览器；
  2. 断线、错误可以在服务端统一处理并降级；
  3. 与现有 HTTP API (backend.interview.api) 解耦，用独立端口 (默认 8765)。
     该端口同时响应 HTTP 健康检查，便于 Render 等平台探测服务存活。

客户端协议（最小够用，方便前端直接消费）：
  Server → Client (JSON)
    {"type": "ready"}                    # DashScope session 建立
    {"type": "interim", "text": "..."}   # 增量文本（含未最终化的尾部）
    {"type": "final",   "text": "..."}   # 一段 VAD 完整片段的最终文本
    {"type": "speech_started"}           # 服务端 VAD 检测到说话开始
    {"type": "speech_stopped"}           # 服务端 VAD 检测到说话停止
    {"type": "error", "message": "..."}
    {"type": "closed"}                   # 服务端主动关闭

  Client → Server
    二进制帧 (bytes)     : 原始 16kHz mono PCM16 音频，推荐 100ms 一帧
    文本帧 {"type":"end"} : 结束本次会话，服务端完成收尾后关闭连接

注意：
  - DashScope SDK (`dashscope.audio.qwen_omni.omni_realtime`) 内部使用
    独立线程驱动 WebSocket，回调是线程上下文；我们用 asyncio.Queue +
    `loop.call_soon_threadsafe` 把事件交回事件循环，避免 asyncio 对象跨线程。
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any

try:
    from aiohttp import WSMsgType, web
except ImportError as exc:  # pragma: no cover - 启动时明确报错
    raise RuntimeError(
        "缺少依赖 `aiohttp`。请先运行 `uv sync` 或 `pip install aiohttp`。"
    ) from exc

try:
    import websockets
except ImportError as exc:  # pragma: no cover - 启动时明确报错
    raise RuntimeError(
        "缺少依赖 `websockets`。请先运行 `uv sync` 或 `pip install websockets`。"
    ) from exc

# websockets >=14 移除了 `websockets.server.WebSocketServerProtocol`，
# 这里只在类型注解里用到连接对象，统一用 Any 兼容老/新版本。
WebSocketConnection = Any  # type: ignore[misc,assignment]


log = logging.getLogger("backend.asr.qwen_realtime")


# ---------------------------------------------------------------------------
# DashScope 适配层
# ---------------------------------------------------------------------------

DEFAULT_MODEL = "qwen3-asr-flash-realtime"
# 北京地域；如需新加坡地域可改为 wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime
DEFAULT_DASHSCOPE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"


class _DashscopeBridge:
    """把 DashScope 的回调式 API 包装成 asyncio 友好的接口。"""

    def __init__(
        self,
        *,
        loop: asyncio.AbstractEventLoop,
        api_key: str,
        model: str = DEFAULT_MODEL,
        url: str = DEFAULT_DASHSCOPE_URL,
        language: str = "zh",
        sample_rate: int = 16000,
    ) -> None:
        import dashscope  # noqa: WPS433  # 延迟导入，避免启动即要求安装
        from dashscope.audio.qwen_omni import (  # noqa: WPS433
            MultiModality,
            OmniRealtimeCallback,
            OmniRealtimeConversation,
        )
        from dashscope.audio.qwen_omni.omni_realtime import (  # noqa: WPS433
            TranscriptionParams,
        )

        dashscope.api_key = api_key

        self._loop = loop
        self._events: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._closed = False

        callback = _BridgeCallback(bridge=self)

        self._conversation = OmniRealtimeConversation(
            model=model,
            url=url,
            callback=callback,
        )
        self._MultiModality = MultiModality
        self._TranscriptionParams = TranscriptionParams
        self._language = language
        self._sample_rate = sample_rate
        # 保留类引用仅用于类型提示
        self._OmniRealtimeCallback = OmniRealtimeCallback  # noqa: SLF001

    # 在 DashScope 工作线程里被调用
    def _enqueue_threadsafe(self, event: dict[str, Any]) -> None:
        if self._closed:
            return
        self._loop.call_soon_threadsafe(self._events.put_nowait, event)

    async def events(self) -> asyncio.Queue[dict[str, Any]]:
        return self._events

    async def start(self) -> None:
        # connect/update_session 都是同步阻塞调用，放到线程池
        await asyncio.to_thread(self._conversation.connect)
        await asyncio.to_thread(
            self._conversation.update_session,
            output_modalities=[self._MultiModality.TEXT],
            enable_input_audio_transcription=True,
            transcription_params=self._TranscriptionParams(
                language=self._language,
                sample_rate=self._sample_rate,
                input_audio_format="pcm",
            ),
        )

    def append_audio(self, pcm_bytes: bytes) -> None:
        if self._closed or not pcm_bytes:
            return
        audio_b64 = base64.b64encode(pcm_bytes).decode("ascii")
        # append_audio 内部会丢到 SDK 的发送线程，调用本身很轻，可以直接同步调用
        self._conversation.append_audio(audio_b64)

    async def finish(self) -> None:
        if self._closed:
            return
        try:
            await asyncio.to_thread(self._conversation.end_session)
        except Exception as error:  # noqa: BLE001
            log.warning("dashscope end_session failed: %s", error)

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            await asyncio.to_thread(self._conversation.close)
        except Exception as error:  # noqa: BLE001
            log.warning("dashscope close failed: %s", error)


class _BridgeCallback:
    """DashScope Callback 的轻量实现，直接把事件转成 dict 入队。"""

    def __init__(self, *, bridge: _DashscopeBridge) -> None:
        # 运行期才会用到 OmniRealtimeCallback 作为基类，这里通过动态继承避免 import 时依赖
        self._bridge = bridge

    # DashScope 只依赖鸭子类型：这些方法会被 SDK 回调

    def on_open(self) -> None:  # noqa: D401
        log.debug("dashscope connection opened")

    def on_close(self, code: Any, msg: Any) -> None:  # noqa: D401
        log.debug("dashscope connection closed code=%s msg=%s", code, msg)
        self._bridge._enqueue_threadsafe({"type": "closed"})

    def on_event(self, response: dict[str, Any]) -> None:  # noqa: D401
        event_type = str(response.get("type", ""))
        if event_type == "session.created":
            self._bridge._enqueue_threadsafe({"type": "ready"})
            return
        if event_type == "input_audio_buffer.speech_started":
            self._bridge._enqueue_threadsafe({"type": "speech_started"})
            return
        if event_type == "input_audio_buffer.speech_stopped":
            self._bridge._enqueue_threadsafe({"type": "speech_stopped"})
            return
        if event_type == "conversation.item.input_audio_transcription.text":
            # 增量：text 是已稳定部分，stash 是尾部未稳定部分
            text = str(response.get("text", "")) + str(response.get("stash", ""))
            if text:
                self._bridge._enqueue_threadsafe({"type": "interim", "text": text})
            return
        if event_type == "conversation.item.input_audio_transcription.completed":
            transcript = str(response.get("transcript", "")).strip()
            if transcript:
                self._bridge._enqueue_threadsafe({"type": "final", "text": transcript})
            return
        if event_type.endswith(".error") or "error" in event_type:
            message = str(
                response.get("error", {}).get("message")
                or response.get("message")
                or event_type
            )
            self._bridge._enqueue_threadsafe({"type": "error", "message": message})


# ---------------------------------------------------------------------------
# WebSocket 服务端
# ---------------------------------------------------------------------------

async def _forward_events_to_client(
    websocket: WebSocketConnection,
    bridge: _DashscopeBridge,
    stop_event: asyncio.Event,
) -> None:
    queue = await bridge.events()
    while not stop_event.is_set():
        try:
            event = await asyncio.wait_for(queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue
        try:
            await websocket.send(json.dumps(event, ensure_ascii=False))
        except Exception:  # noqa: BLE001
            break
        if event.get("type") == "closed":
            break


class _AiohttpWebSocketAdapter:
    """Expose aiohttp WebSocketResponse with the small API _handle_client uses."""

    def __init__(self, websocket: web.WebSocketResponse) -> None:
        self._websocket = websocket

    async def send(self, data: str | bytes) -> None:
        if isinstance(data, bytes):
            await self._websocket.send_bytes(data)
            return
        await self._websocket.send_str(data)

    async def close(self) -> None:
        await self._websocket.close()

    def __aiter__(self) -> "_AiohttpWebSocketAdapter":
        return self

    async def __anext__(self) -> str | bytes:
        while True:
            message = await self._websocket.receive()
            if message.type == WSMsgType.TEXT:
                return str(message.data)
            if message.type == WSMsgType.BINARY:
                return bytes(message.data)
            if message.type in {WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.CLOSED}:
                raise StopAsyncIteration
            if message.type == WSMsgType.ERROR:
                error = self._websocket.exception()
                raise ConnectionError("ASR WebSocket closed with an error") from error


async def _handle_client(websocket: WebSocketConnection) -> None:
    api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        await websocket.send(json.dumps({
            "type": "error",
            "message": "服务端未配置 DASHSCOPE_API_KEY，无法使用 Qwen ASR。",
        }))
        await websocket.close()
        return

    loop = asyncio.get_running_loop()
    try:
        bridge = _DashscopeBridge(loop=loop, api_key=api_key)
    except Exception as error:  # noqa: BLE001
        log.exception("create dashscope bridge failed")
        await websocket.send(json.dumps({
            "type": "error",
            "message": f"初始化 Qwen ASR 失败：{error}",
        }))
        await websocket.close()
        return

    stop_event = asyncio.Event()
    forwarder_task = asyncio.create_task(
        _forward_events_to_client(websocket, bridge, stop_event)
    )

    try:
        await bridge.start()
    except Exception as error:  # noqa: BLE001
        log.exception("dashscope start failed")
        await websocket.send(json.dumps({
            "type": "error",
            "message": f"连接 Qwen ASR 失败：{error}",
        }))
        stop_event.set()
        forwarder_task.cancel()
        await bridge.close()
        return

    log.info("asr client connected")
    try:
        async for message in websocket:
            if isinstance(message, (bytes, bytearray)):
                # 前端推来的裸 PCM16 mono 16kHz
                bridge.append_audio(bytes(message))
                continue
            # 文本帧：仅处理结束信号
            try:
                payload = json.loads(message)
            except (ValueError, TypeError):
                continue
            if isinstance(payload, dict) and payload.get("type") == "end":
                break
    except (websockets.ConnectionClosed, ConnectionError):
        log.info("asr client disconnected")
    finally:
        await bridge.finish()
        # 给 DashScope 一点时间把最后的 transcription.completed 推上来
        await asyncio.sleep(0.5)
        stop_event.set()
        forwarder_task.cancel()
        await bridge.close()
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


def _health_payload() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "asr",
        "dashscope_configured": bool(os.environ.get("DASHSCOPE_API_KEY", "").strip()),
    }


async def _handle_health(_request: web.Request) -> web.Response:
    return web.json_response(_health_payload())


async def _handle_root(request: web.Request) -> web.StreamResponse:
    if request.headers.get("Upgrade", "").lower() != "websocket":
        return await _handle_health(request)

    # 音频帧默认 <= 16 KB，放宽一点给 1MB，够保险。
    websocket = web.WebSocketResponse(max_msg_size=1 << 20, heartbeat=20)
    await websocket.prepare(request)
    await _handle_client(_AiohttpWebSocketAdapter(websocket))
    return websocket


class _AiohttpAsrServer:
    """Compatibility wrapper with close()/wait_closed() like websockets server."""

    def __init__(self, runner: web.AppRunner) -> None:
        self._runner = runner
        self._cleanup_task: asyncio.Task[None] | None = None

    def close(self) -> None:
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._runner.cleanup())

    async def wait_closed(self) -> None:
        if self._cleanup_task is None:
            await self._runner.cleanup()
            return
        await self._cleanup_task


async def create_server(host: str = "127.0.0.1", port: int = 8765) -> Any:
    """创建并启动 HTTP + WebSocket 服务器。返回 server 对象用于 shutdown。"""
    app = web.Application()
    app.router.add_get("/", _handle_root, allow_head=True)
    app.router.add_get("/health", _handle_health, allow_head=True)
    app.router.add_get("/api/health", _handle_health, allow_head=True)

    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    return _AiohttpAsrServer(runner)


async def serve_forever(host: str = "127.0.0.1", port: int = 8765) -> None:
    server = await create_server(host=host, port=port)
    log.info("Qwen ASR server listening on http://%s:%s/ and ws://%s:%s/", host, port, host, port)
    try:
        await asyncio.Future()  # run forever
    finally:
        server.close()
        await server.wait_closed()


def main() -> None:  # pragma: no cover - CLI 入口
    import argparse

    parser = argparse.ArgumentParser(description="Qwen3-ASR realtime WebSocket proxy.")
    parser.add_argument("--host", default=os.environ.get("ASR_WS_HOST", "127.0.0.1"))
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("ASR_WS_PORT", "8765")),
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=os.environ.get("ASR_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        asyncio.run(serve_forever(host=args.host, port=args.port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":  # pragma: no cover
    main()
