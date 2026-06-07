"""认证服务 - 处理登录、注册、token 验证"""

from __future__ import annotations

import time
from threading import Lock
from typing import Any

from supabase import AuthApiError, AuthInvalidCredentialsError, AuthWeakPasswordError

from backend.auth.models import AuthContext
from backend.auth.supabase_client import get_supabase_client
from backend.auth.exceptions import (
    AuthError,
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    TokenExpiredError,
    TokenInvalidError,
    WeakPasswordError,
)

_AUTH_CACHE: dict[str, tuple[float, AuthContext]] = {}
_AUTH_CACHE_LOCK = Lock()
_AUTH_CACHE_TTL = 300  # 5 分钟


def _cached_verify(token: str) -> AuthContext | None:
    """带缓存的 token 验证，避免每个请求都调 Supabase"""
    now = time.time()
    with _AUTH_CACHE_LOCK:
        entry = _AUTH_CACHE.get(token)
        if entry is not None and now - entry[0] < _AUTH_CACHE_TTL:
            return entry[1]

    client = get_supabase_client()
    if client is None:
        return None

    for attempt in range(2):
        try:
            user_response = client.auth.get_user(token)
            if user_response.user is None:
                return None

            user = user_response.user
            user_metadata = user.user_metadata or {}
            ctx = AuthContext(
                user_id=user.id,
                email=user.email or "",
                full_name=user_metadata.get("full_name"),
            )
            with _AUTH_CACHE_LOCK:
                _AUTH_CACHE[token] = (now, ctx)
            return ctx
        except Exception:
            if attempt == 0:
                continue
            return None
    return None


def register(email: str, password: str, full_name: str = "") -> dict[str, Any]:
    """
    注册新用户

    Args:
        email: 邮箱地址
        password: 密码
        full_name: 用户姓名

    Returns:
        包含 access_token, refresh_token, user 的字典

    Raises:
        EmailAlreadyRegisteredError: 邮箱已注册
        WeakPasswordError: 密码太弱
        AuthError: 其他认证错误
    """
    client = get_supabase_client()
    if client is None:
        raise AuthError("认证服务未配置", code="auth_not_configured")

    try:
        result = client.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {
                    "full_name": full_name,
                }
            }
        })
    except AuthWeakPasswordError:
        raise WeakPasswordError()
    except AuthApiError as e:
        error_msg = str(e).lower()
        if "already registered" in error_msg or "user already" in error_msg:
            raise EmailAlreadyRegisteredError()
        raise AuthError(str(e), code="registration_failed")

    if result.user is None:
        raise AuthError("注册失败，请稍后重试", code="registration_failed")

    session = result.session
    if session is None:
        # Supabase 可能需要邮箱验证
        return {
            "access_token": "",
            "refresh_token": "",
            "user": _format_user(result.user),
            "needs_email_confirmation": True,
        }

    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "user": _format_user(result.user),
        "needs_email_confirmation": False,
    }


def login(email: str, password: str) -> dict[str, Any]:
    """
    用户登录

    Args:
        email: 邮箱地址
        password: 密码

    Returns:
        包含 access_token, refresh_token, user 的字典

    Raises:
        InvalidCredentialsError: 凭据无效
        AuthError: 其他认证错误
    """
    client = get_supabase_client()
    if client is None:
        raise AuthError("认证服务未配置", code="auth_not_configured")

    try:
        result = client.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
    except AuthInvalidCredentialsError:
        raise InvalidCredentialsError()
    except AuthApiError as e:
        raise AuthError(str(e), code="login_failed")

    if result.session is None:
        raise InvalidCredentialsError()

    return {
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "user": _format_user(result.user),
    }


def verify_token(access_token: str) -> AuthContext | None:
    return _cached_verify(access_token)


def refresh_session(refresh_token: str) -> dict[str, Any] | None:
    """
    刷新 session

    Args:
        refresh_token: refresh token

    Returns:
        新的 token 信息，失败返回 None
    """
    client = get_supabase_client()
    if client is None:
        return None

    try:
        result = client.auth.refresh_session(refresh_token)
        if result.session is None:
            return None

        return {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "user": _format_user(result.user),
        }
    except Exception:
        return None


def logout(access_token: str) -> bool:
    """
    用户退出登录

    Args:
        access_token: 用户的 access token

    Returns:
        是否成功退出
    """
    client = get_supabase_client()
    if client is None:
        return True  # 未配置时直接返回成功

    try:
        client.auth.sign_out(access_token)
        return True
    except Exception:
        return False


def _format_user(user: Any) -> dict[str, Any]:
    """格式化用户信息为字典"""
    metadata = user.user_metadata or {}
    return {
        "id": user.id,
        "email": user.email or "",
        "full_name": metadata.get("full_name", ""),
        "avatar_url": metadata.get("avatar_url", ""),
    }
