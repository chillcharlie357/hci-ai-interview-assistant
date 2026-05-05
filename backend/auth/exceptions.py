"""认证相关异常"""


class AuthError(Exception):
    """认证错误基类"""

    def __init__(self, message: str, code: str = "auth_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class InvalidCredentialsError(AuthError):
    """无效的登录凭据"""

    def __init__(self, message: str = "邮箱或密码错误"):
        super().__init__(message, code="invalid_credentials")


class EmailAlreadyRegisteredError(AuthError):
    """邮箱已被注册"""

    def __init__(self, message: str = "该邮箱已被注册"):
        super().__init__(message, code="email_already_registered")


class WeakPasswordError(AuthError):
    """密码强度不足"""

    def __init__(self, message: str = "密码至少需要 6 个字符"):
        super().__init__(message, code="weak_password")


class TokenExpiredError(AuthError):
    """令牌已过期"""

    def __init__(self, message: str = "登录已过期，请重新登录"):
        super().__init__(message, code="token_expired")


class TokenInvalidError(AuthError):
    """无效的令牌"""

    def __init__(self, message: str = "无效的认证令牌"):
        super().__init__(message, code="token_invalid")
