from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from backend.interview.config import get_env


class LiveKitConfigError(Exception):
    pass


def create_livekit_token(room: str, participant_name: str, participant_role: str) -> dict[str, str]:
    url = get_env("LIVEKIT_URL")
    api_key = get_env("LIVEKIT_API_KEY")
    api_secret = get_env("LIVEKIT_API_SECRET")
    if not url or not api_key or not api_secret:
        raise LiveKitConfigError("LiveKit 未配置，请设置 LIVEKIT_URL、LIVEKIT_API_KEY、LIVEKIT_API_SECRET。")

    now = int(time.time())
    identity = f"{participant_role}-{participant_name}-{now}"
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": api_key,
        "sub": identity,
        "nbf": now,
        "exp": now + 60 * 60 * 2,
        "name": participant_name,
        "metadata": json.dumps({"role": participant_role}, ensure_ascii=False),
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        },
    }
    signing_input = f"{_b64_json(header)}.{_b64_json(payload)}"
    signature = hmac.new(api_secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    token = f"{signing_input}.{_b64(signature)}"
    return {"url": url, "token": token, "room": room}


def _b64_json(value: dict[str, object]) -> str:
    return _b64(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
