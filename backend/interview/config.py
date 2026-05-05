from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOTENV_PATH = PROJECT_ROOT / ".env"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_FILLER_WORDS: list[str] = []

# Supabase 默认配置
DEFAULT_SUPABASE_URL = ""
DEFAULT_SUPABASE_ANON_KEY = ""
DEFAULT_SUPABASE_JWT_SECRET = ""
DEFAULT_DATABASE_URL = ""


def load_dotenv(path: str | Path = DEFAULT_DOTENV_PATH, *, override: bool = False) -> None:
    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = _strip_quotes(raw_value.strip())
        if not key:
            continue
        if override or key not in os.environ:
            os.environ[key] = value


def get_env(name: str, default: str = "") -> str:
    if not os.environ.get("INTERVIEW_DISABLE_DOTENV"):
        load_dotenv()
    return os.environ.get(name, default)


def get_csv_env(name: str, default: list[str]) -> list[str]:
    raw_value = get_env(name)
    if not raw_value:
        return default
    values = [value.strip() for value in raw_value.split(",")]
    return [value for value in values if value] or default


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def get_supabase_config() -> dict[str, str]:
    """获取 Supabase 配置"""
    return {
        "url": get_env("SUPABASE_URL", DEFAULT_SUPABASE_URL),
        "anon_key": get_env("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY),
        "jwt_secret": get_env("SUPABASE_JWT_SECRET", DEFAULT_SUPABASE_JWT_SECRET),
    }


def get_database_url() -> str:
    """获取数据库连接 URL"""
    return get_env("DATABASE_URL", DEFAULT_DATABASE_URL)


def is_auth_required() -> bool:
    """检查是否需要认证（开发模式可关闭）"""
    return get_env("REQUIRE_AUTH", "false").lower() == "true"
