"""认证相关数据模型"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AuthContext:
    """认证上下文，包含已验证用户的信息"""

    user_id: str
    email: str
    full_name: str | None = None
