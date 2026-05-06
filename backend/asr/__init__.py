"""ASR 相关模块：目前提供基于 DashScope Qwen3-ASR 的实时转写中转服务。"""

from .qwen_realtime import serve_forever, create_server

__all__ = ["serve_forever", "create_server"]
