"""Supabase 客户端封装"""

from __future__ import annotations

from supabase import create_client, Client

from backend.interview.config import get_supabase_config


_client: Client | None = None


def get_supabase_client() -> Client | None:
    """获取全局 Supabase 客户端实例（匿名访问）"""
    global _client
    if _client is not None:
        return _client

    config = get_supabase_config()
    url = config.get("url", "")
    anon_key = config.get("anon_key", "")

    if not url or not anon_key:
        return None

    _client = create_client(url, anon_key)
    return _client


def get_authenticated_client(access_token: str) -> Client | None:
    """获取带用户认证的 Supabase 客户端（用于 RLS 策略）"""
    config = get_supabase_config()
    url = config.get("url", "")
    anon_key = config.get("anon_key", "")

    if not url or not anon_key:
        return None

    # 创建客户端并设置用户的 JWT token
    client = create_client(url, anon_key)
    client.auth.set_session(access_token, "")
    return client


def reset_client() -> None:
    """重置客户端（用于测试）"""
    global _client
    _client = None
