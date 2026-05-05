"""认证中间件"""

from __future__ import annotations

from backend.auth.models import AuthContext
from backend.auth.service import verify_token
from backend.interview.config import is_auth_required


class AuthMiddleware:
    """
    认证中间件

    用于验证 HTTP 请求中的 JWT 令牌，提取用户上下文
    """

    def __init__(self, require_auth: bool | None = None):
        self.require_auth = (
            require_auth if require_auth is not None else is_auth_required()
        )

    def extract_token(self, headers: dict[str, str]) -> str | None:
        """从请求头中提取 Bearer 令牌"""
        auth_header = headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        # 尝试小写形式
        auth_header = headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        return None

    def authenticate(self, headers: dict[str, str]) -> AuthContext | None:
        """
        验证请求并返回用户上下文

        Returns:
            认证上下文，验证失败返回 None
        """
        # 开发模式：直接返回匿名用户上下文，跳过所有认证
        if not self.require_auth:
            return self._dev_context()

        token = self.extract_token(headers)
        if not token:
            return None

        return verify_token(token)

    def _dev_context(self) -> AuthContext:
        """创建开发模式的匿名用户上下文"""
        return AuthContext(
            user_id="dev_user",
            email="dev@example.com",
            full_name="开发用户",
        )


def create_auth_middleware() -> AuthMiddleware:
    """创建认证中间件实例（工厂函数）"""
    return AuthMiddleware()
