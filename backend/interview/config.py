from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOTENV_PATH = PROJECT_ROOT / ".env"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_FILLER_WORDS: list[str] = []


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
