"""Supabase 客户端封装"""

from __future__ import annotations

from supabase import create_client, Client

from backend.interview.config import get_supabase_config


_client: Client | None = None
_service_client: Client | None = None


def get_supabase_client() -> Client | None:
    """获取全局 Supabase 客户端实例（匿名访问，用于 auth 操作）"""
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


def get_service_client() -> Client | None:
    """获取 service role client（绕过 RLS，后端自己做 user_id 过滤）"""
    global _service_client
    if _service_client is not None:
        return _service_client

    config = get_supabase_config()
    url = config.get("url", "")
    service_key = config.get("service_role_key", "")

    if not url or not service_key:
        return None

    _service_client = create_client(url, service_key)
    return _service_client


def reset_client() -> None:
    """重置客户端（用于测试）"""
    global _client, _service_client
    _client = None
    _service_client = None
