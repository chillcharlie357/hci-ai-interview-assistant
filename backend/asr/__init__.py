"""ASR 相关模块：目前提供基于 DashScope Qwen3-ASR 的实时转写中转服务。"""

__all__ = ["serve_forever", "create_server"]


def __getattr__(name: str):
    if name not in __all__:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from . import qwen_realtime

    return getattr(qwen_realtime, name)
