# backend/interview/livekit_token.py
from __future__ import annotations

from livekit.api import AccessToken, VideoGrants

from backend.interview.config import get_env


class LiveKitConfigError(Exception):
    pass


def _get_livekit_config() -> tuple[str, str, str]:
    url = get_env("LIVEKIT_URL")
    api_key = get_env("LIVEKIT_API_KEY")
    api_secret = get_env("LIVEKIT_API_SECRET")
    if not url or not api_key or not api_secret:
        raise LiveKitConfigError("LiveKit 未配置，请设置 LIVEKIT_URL、LIVEKIT_API_KEY、LIVEKIT_API_SECRET。")
    return url, api_key, api_secret


def create_livekit_token(room: str, participant_name: str, participant_role: str) -> dict[str, str]:
    url, api_key, api_secret = _get_livekit_config()
    public_url = get_env("LIVEKIT_PUBLIC_URL") or url

    token = (
        AccessToken(api_key, api_secret)
        .with_identity(f"{participant_role}-{participant_name}")
        .with_name(participant_name)
        .with_metadata(f'{{"role":"{participant_role}"}}')
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
    )
    return {"url": public_url, "token": token.to_jwt(), "room": room}
