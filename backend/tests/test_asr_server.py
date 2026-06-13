import asyncio
import json
import os
import socket
import unittest
from unittest.mock import patch

from aiohttp import ClientSession, WSMsgType

from backend.asr.qwen_realtime import create_server


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class QwenRealtimeServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.port = _free_port()
        self.server = await create_server(host="127.0.0.1", port=self.port)

    async def asyncTearDown(self) -> None:
        self.server.close()
        await self.server.wait_closed()

    async def test_health_endpoints_accept_get_and_head(self) -> None:
        async with ClientSession() as session:
            async with session.get(f"http://127.0.0.1:{self.port}/health") as response:
                self.assertEqual(response.status, 200)
                payload = await response.json()
                self.assertEqual(payload["status"], "ok")
                self.assertEqual(payload["service"], "asr")

            async with session.head(f"http://127.0.0.1:{self.port}/health") as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(await response.read(), b"")

    async def test_websocket_protocol_still_returns_config_error(self) -> None:
        old_api_key = os.environ.pop("DASHSCOPE_API_KEY", None)
        try:
            async with ClientSession() as session:
                async with session.ws_connect(f"ws://127.0.0.1:{self.port}/") as ws:
                    message = await ws.receive(timeout=2)
                    self.assertEqual(message.type, WSMsgType.TEXT)
                    payload = json.loads(message.data)
                    self.assertEqual(payload["type"], "error")
                    self.assertIn("DASHSCOPE_API_KEY", payload["message"])
        finally:
            if old_api_key is not None:
                os.environ["DASHSCOPE_API_KEY"] = old_api_key

    async def test_websocket_context_terms_are_forwarded_as_corpus_text(self) -> None:
        captured: dict[str, str] = {}

        class FakeBridge:
            def __init__(self, *, loop, api_key, corpus_text="", **_kwargs):
                self._events = asyncio.Queue()
                captured["api_key"] = api_key
                captured["corpus_text"] = corpus_text

            async def events(self):
                return self._events

            async def start(self):
                await self._events.put({"type": "ready"})

            def append_audio(self, _pcm_bytes):
                return None

            async def finish(self):
                return None

            async def close(self):
                return None

        with patch.dict(os.environ, {"DASHSCOPE_API_KEY": "test-key"}, clear=False), \
                patch("backend.asr.qwen_realtime._DashscopeBridge", FakeBridge):
            async with ClientSession() as session:
                async with session.ws_connect(
                    f"ws://127.0.0.1:{self.port}/?term=RAG&term=TypeScript&term=检索增强生成"
                ) as ws:
                    message = await ws.receive(timeout=2)
                    self.assertEqual(message.type, WSMsgType.TEXT)
                    self.assertEqual(json.loads(message.data)["type"], "ready")
                    await ws.send_json({"type": "end"})

        self.assertEqual(captured["api_key"], "test-key")
        self.assertEqual(captured["corpus_text"], "RAG\nTypeScript\n检索增强生成")
