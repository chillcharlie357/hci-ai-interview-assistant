from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib.request import Request, urlopen

from backend.interview.config import DEFAULT_OPENAI_BASE_URL, get_env


@dataclass(frozen=True)
class LlmConfig:
    api_key: str
    model: str
    base_url: str = DEFAULT_OPENAI_BASE_URL

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)


@dataclass(frozen=True)
class LlmResult:
    status: str
    data: dict[str, Any] | None


class LlmClient:
    def __init__(self, config: LlmConfig):
        self.config = config

    @classmethod
    def from_env(cls) -> "LlmClient":
        return cls(
            LlmConfig(
                api_key=get_env("OPENAI_API_KEY"),
                model=get_env("OPENAI_MODEL"),
                base_url=get_env("OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL).rstrip("/"),
            )
        )

    def complete_json(self, system_prompt: str, user_prompt: str) -> LlmResult:
        if not self.config.configured:
            return LlmResult(status="fallback", data=None)

        payload = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        request = Request(
            f"{self.config.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            return LlmResult(status="ok", data=json.loads(content))
        except Exception:
            return LlmResult(status="fallback", data=None)
