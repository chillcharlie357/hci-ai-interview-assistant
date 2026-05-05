"""用户认证模块"""

from backend.auth.models import AuthContext
from backend.auth.middleware import AuthMiddleware
from backend.auth.service import register, login, logout, verify_token, refresh_session
from backend.auth.exceptions import (
    AuthError,
    InvalidCredentialsError,
    EmailAlreadyRegisteredError,
    WeakPasswordError,
    TokenExpiredError,
    TokenInvalidError,
)

__all__ = [
    "AuthContext",
    "AuthMiddleware",
    "register",
    "login",
    "logout",
    "verify_token",
    "refresh_session",
    "AuthError",
    "InvalidCredentialsError",
    "EmailAlreadyRegisteredError",
    "WeakPasswordError",
    "TokenExpiredError",
    "TokenInvalidError",
]
