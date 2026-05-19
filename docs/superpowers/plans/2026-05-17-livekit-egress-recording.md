# LiveKit Egress 服务端录制 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 LiveKit Egress 替代客户端 MediaRecorder 录制，彻底解决断连丢失问题。

**Architecture:** 候选人的摄像头/麦克风流已经在推到 LiveKit 服务器。Egress 在服务端录制这条流，客户端断连/崩溃/刷新都不影响录制。视频分析（canvas 指标、关键帧）仍在前端，不受影响。LiveKit 未配置时保留客户端录制作为 fallback。

**Tech Stack:** LiveKit Python SDK（`livekit`）、LiveKit Egress Docker 容器、Supabase Storage

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `backend/interview/egress.py` | Egress 录制控制（启动/停止/状态查询） |
| 修改 | `backend/interview/session.py` | InterviewSession 新增 `egress_id` 字段 |
| 修改 | `backend/interview/api.py` | 新增 `/recording/start` 和 `/recording/stop` 路由 |
| 修改 | `backend/interview/livekit_token.py` | 迁移到 LiveKit SDK 的 AccessToken |
| 修改 | `backend/storage/video.py` | 新增从本地文件上传到 Supabase Storage |
| 修改 | `pyproject.toml` | 新增 `livekit` 依赖 |
| 修改 | `docker-compose.yml` | 新增 `livekit` + `egress` 服务 |
| 新建 | `egress.yaml` | Egress 配置文件 |
| 新建 | `livekit.yaml` | LiveKit 服务器配置文件 |
| 修改 | `frontend/src/apiClient.ts` | 新增 `startRecording` / `stopRecording` 函数 |
| 修改 | `frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts` | 改为 Egress 模式，保留客户端 fallback |
| 修改 | `frontend/src/pages/InterviewPage/index.tsx` | 调用新的录制 API |
| 修改 | `frontend/src/interviewFlow.ts` | InterviewSession 类型新增 `egressId` |
| 修改 | `backend/tests/test_api.py` | 新增录制端点测试 |
| 新建 | `backend/tests/test_egress.py` | Egress 模块单元测试 |

---

### Task 1: 安装 LiveKit Python SDK + 迁移 token 生成

**Files:**
- Modify: `pyproject.toml`
- Modify: `backend/interview/livekit_token.py`
- Test: `backend/tests/test_api.py`

LiveKit SDK 提供 `AccessToken` 和 `EgressClient`，替代手搓 JWT。这是后续 Egress 调用的前置依赖。

- [ ] **Step 1: 添加 `livekit` 依赖**

```bash
cd I:/code/hci-ai-interview-assistant
uv add livekit
```

- [ ] **Step 2: 用 SDK 重写 `livekit_token.py`**

```python
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
    return {"url": url, "token": token.to_jwt(), "room": room}
```

- [ ] **Step 3: 运行现有测试验证 token 生成兼容**

```bash
uv run python -m unittest backend.tests.test_api -v
```

Expected: 所有测试 PASS。`/livekit-token` 端点的返回格式 `{ url, token, room }` 不变，前端无需改动。

- [ ] **Step 4: 提交**

```bash
git add pyproject.toml uv.lock backend/interview/livekit_token.py
git commit -m "feat: migrate livekit token to SDK, add livekit dependency"
```

---

### Task 2: 新建 Egress 录制控制模块

**Files:**
- Create: `backend/interview/egress.py`
- Test: `backend/tests/test_egress.py`

封装 Egress 的启动、停止、状态查询。所有 LiveKit API 调用集中在此模块。

- [ ] **Step 1: 写 `egress.py` 的失败测试**

```python
# backend/tests/test_egress.py
import unittest
from unittest.mock import patch, MagicMock

from backend.interview.egress import start_recording, stop_recording, EgressError


class TestStartRecording(unittest.TestCase):
    @patch("backend.interview.egress.get_env")
    def test_start_recording_unconfigured(self, mock_get_env):
        """LiveKit 未配置时抛出 EgressError"""
        mock_get_env.return_value = ""
        with self.assertRaises(EgressError):
            start_recording("test-room")

    @patch("backend.interview.egress.get_env")
    @patch("backend.interview.egress.EgressClient")
    def test_start_recording_returns_egress_id(self, mock_client_cls, mock_get_env):
        """成功启动录制时返回 egress_id"""
        mock_get_env.side_effect = lambda k, d="": {
            "LIVEKIT_URL": "ws://localhost:7880",
            "LIVEKIT_API_KEY": "devkey",
            "LIVEKIT_API_SECRET": "devsecret",
        }.get(k, d)

        mock_info = MagicMock()
        mock_info.egress_id = "egress-test-123"
        mock_client = MagicMock()
        mock_client.start_room_composite_egress.return_value = mock_info
        mock_client_cls.return_value = mock_client

        result = start_recording("test-room")
        self.assertEqual(result, "egress-test-123")

    @patch("backend.interview.egress.get_env")
    @patch("backend.interview.egress.EgressClient")
    def test_start_recording_api_failure(self, mock_client_cls, mock_get_env):
        """Egress API 调用失败时抛出 EgressError"""
        mock_get_env.side_effect = lambda k, d="": {
            "LIVEKIT_URL": "ws://localhost:7880",
            "LIVEKIT_API_KEY": "devkey",
            "LIVEKIT_API_SECRET": "devsecret",
        }.get(k, d)

        mock_client = MagicMock()
        mock_client.start_room_composite_egress.side_effect = Exception("connection refused")
        mock_client_cls.return_value = mock_client

        with self.assertRaises(EgressError):
            start_recording("test-room")


class TestStopRecording(unittest.TestCase):
    @patch("backend.interview.egress.get_env")
    @patch("backend.interview.egress.EgressClient")
    def test_stop_recording_returns_file_info(self, mock_client_cls, mock_get_env):
        """成功停止录制时返回文件信息"""
        mock_get_env.side_effect = lambda k, d="": {
            "LIVEKIT_URL": "ws://localhost:7880",
            "LIVEKIT_API_KEY": "devkey",
            "LIVEKIT_API_SECRET": "devsecret",
        }.get(k, d)

        mock_file = MagicMock()
        mock_file.filename = "/out/interview-session_123.webm"
        mock_file.duration = 120.0
        mock_info = MagicMock()
        mock_info.file_results = [mock_file]
        mock_client = MagicMock()
        mock_client.stop_egress.return_value = mock_info
        mock_client_cls.return_value = mock_client

        result = stop_recording("egress-test-123")
        self.assertEqual(result["file_path"], "/out/interview-session_123.webm")
        self.assertEqual(result["duration_sec"], 120.0)

    @patch("backend.interview.egress.get_env")
    def test_stop_recording_unconfigured(self, mock_get_env):
        """LiveKit 未配置时抛出 EgressError"""
        mock_get_env.return_value = ""
        with self.assertRaises(EgressError):
            stop_recording("egress-test-123")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试验证失败**

```bash
uv run python -m unittest backend.tests.test_egress -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'backend.interview.egress'`

- [ ] **Step 3: 实现 `egress.py`**

```python
# backend/interview/egress.py
"""LiveKit Egress 服务端录制控制。"""
from __future__ import annotations

from livekit.api import EgressClient, RoomCompositeEgressRequest, EncodedFileOutput, FileEncoding

from backend.interview.config import get_env


class EgressError(Exception):
    """Egress 操作失败。"""


def _get_livekit_config() -> tuple[str, str, str]:
    url = get_env("LIVEKIT_URL")
    api_key = get_env("LIVEKIT_API_KEY")
    api_secret = get_env("LIVEKIT_API_SECRET")
    if not url or not api_key or not api_secret:
        raise EgressError("LiveKit 未配置，请设置 LIVEKIT_URL、LIVEKIT_API_KEY、LIVEKIT_API_SECRET。")
    return url, api_key, api_secret


def _make_egress_client() -> EgressClient:
    _, api_key, api_secret = _get_livekit_config()
    return EgressClient(api_key, api_secret)


def start_recording(room_name: str) -> str:
    """启动房间录制，返回 egress_id。

    使用 RoomComposite 模式录制整个房间画面。
    输出为 webm（vp8+opus），320x240 15fps 200kbps，与原客户端录制参数一致。
    """
    try:
        client = _make_egress_client()
        request = RoomCompositeEgressRequest(
            room_name=room_name,
            layout="speaker-dark",
            video=FileEncoding(
                width=320,
                height=240,
                framerate=15,
                bitrate=200_000,
            ),
            audio=True,
            file_outputs=[EncodedFileOutput(
                file_type=1,  # WEBM
                filepath=f"/out/{room_name}.webm",
            )],
        )
        info = client.start_room_composite_egress(request)
        return info.egress_id
    except EgressError:
        raise
    except Exception as exc:
        raise EgressError(f"启动录制失败: {exc}") from exc


def stop_recording(egress_id: str) -> dict[str, str | float]:
    """停止录制，返回文件信息 {file_path, duration_sec}。"""
    try:
        client = _make_egress_client()
        info = client.stop_egress(egress_id)
        file_result = info.file_results[0] if info.file_results else None
        if file_result is None:
            raise EgressError("录制停止但未返回文件信息")
        return {
            "file_path": file_result.filename,
            "duration_sec": file_result.duration or 0.0,
        }
    except EgressError:
        raise
    except Exception as exc:
        raise EgressError(f"停止录制失败: {exc}") from exc
```

- [ ] **Step 4: 运行测试验证通过**

```bash
uv run python -m unittest backend.tests.test_egress -v
```

Expected: 5 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/interview/egress.py backend/tests/test_egress.py
git commit -m "feat: add Egress recording control module with tests"
```

---

### Task 3: InterviewSession 新增 egress_id 字段

**Files:**
- Modify: `backend/interview/session.py`
- Test: `backend/tests/test_session.py`

存储当前录制的 egress_id，用于停止录制和断连恢复。

- [ ] **Step 1: 在 InterviewSession 中新增 `egress_id` 字段**

在 `session.py` 的 `InterviewSession` dataclass 中，`followup_states` 之后新增：

```python
    egress_id: str | None = None  # LiveKit Egress 录制 ID
```

- [ ] **Step 2: 运行现有 session 测试**

```bash
uv run python -m unittest backend.tests.test_session -v
```

Expected: 全部 PASS。新增字段有默认值 `None`，不影响现有代码。

- [ ] **Step 3: 提交**

```bash
git add backend/interview/session.py
git commit -m "feat: add egress_id field to InterviewSession"
```

---

### Task 4: 后端新增录制 API 端点

**Files:**
- Modify: `backend/interview/api.py`
- Test: `backend/tests/test_api.py`

新增两个端点：
- `POST /api/sessions/{id}/recording/start` — 启动 Egress 录制
- `POST /api/sessions/{id}/recording/stop` — 停止录制并更新 session

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_api.py` 末尾新增：

```python
class TestRecordingEndpoints(unittest.TestCase):
    """Egress 服务端录制 API 测试。"""

    def test_start_recording_stores_egress_id(self):
        """启动录制后 session 中应存储 egress_id"""
        store = SessionStore()
        session = create_interview_session(user_id="user-1")
        store.sessions[session.id] = session

        with patch("backend.interview.api.start_recording", return_value="egress-abc"):
            status, body = handle_api_request(
                store, "POST",
                f"/api/sessions/{session.id}/recording/start",
                payload={}, user_id="user-1",
            )
        self.assertEqual(status, 200)
        self.assertEqual(body["egress_id"], "egress-abc")
        self.assertEqual(store.sessions[session.id].egress_id, "egress-abc")

    def test_start_recording_livekit_unconfigured(self):
        """LiveKit 未配置时返回 503"""
        store = SessionStore()
        session = create_interview_session(user_id="user-1")
        store.sessions[session.id] = session

        with patch("backend.interview.api.start_recording", side_effect=EgressError("not configured")):
            status, body = handle_api_request(
                store, "POST",
                f"/api/sessions/{session.id}/recording/start",
                payload={}, user_id="user-1",
            )
        self.assertEqual(status, 503)
        self.assertIn("livekit_not_configured", body.get("error", ""))

    def test_stop_recording_updates_session(self):
        """停止录制后 session 应更新 video_path 和 video_duration_sec"""
        store = SessionStore()
        session = create_interview_session(user_id="user-1")
        session = replace(session, egress_id="egress-abc")
        store.sessions[session.id] = session

        with patch("backend.interview.api.stop_recording", return_value={
            "file_path": "/out/interview-session_123.webm",
            "duration_sec": 120.0,
        }):
            status, body = handle_api_request(
                store, "POST",
                f"/api/sessions/{session.id}/recording/stop",
                payload={}, user_id="user-1",
            )
        self.assertEqual(status, 200)
        self.assertIn("video_path", body)
        self.assertEqual(body["video_duration_sec"], 120.0)
        # egress_id 应清除
        self.assertIsNone(store.sessions[session.id].egress_id)

    def test_stop_recording_no_egress_id(self):
        """没有进行中的录制时返回 400"""
        store = SessionStore()
        session = create_interview_session(user_id="user-1")
        store.sessions[session.id] = session

        status, body = handle_api_request(
            store, "POST",
            f"/api/sessions/{session.id}/recording/stop",
            payload={}, user_id="user-1",
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "no_active_recording")

    def test_stop_recording_transfers_file_to_storage(self):
        """停止录制时应将本地文件上传到 Supabase Storage"""
        store = SessionStore()
        session = create_interview_session(user_id="user-1")
        session = replace(session, egress_id="egress-abc")
        store.sessions[session.id] = session

        with patch("backend.interview.api.stop_recording", return_value={
            "file_path": "/out/interview-session_123.webm",
            "duration_sec": 60.0,
        }), patch("backend.interview.api.transfer_egress_file") as mock_transfer:
            mock_transfer.return_value = "user-1/session_123.webm"
            status, body = handle_api_request(
                store, "POST",
                f"/api/sessions/{session.id}/recording/stop",
                payload={}, user_id="user-1",
            )
        self.assertEqual(status, 200)
        mock_transfer.assert_called_once_with(
            "/out/interview-session_123.webm",
            "user-1", session.id,
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试验证失败**

```bash
uv run python -m unittest backend.tests.test_api.TestRecordingEndpoints -v
```

Expected: FAIL — 路由未匹配（404）

- [ ] **Step 3: 在 `api.py` 中添加路由和 import**

在 `api.py` 顶部新增 import：

```python
from backend.interview.egress import start_recording, stop_recording, EgressError
```

在 `handle_api_request` 函数中，`livekit-token` 路由之后、`speech-chunks` 路由之前，新增两个路由：

```python
    # 启动 Egress 录制
    if (
        method == "POST"
        and len(path_parts) == 5
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "recording"
        and path_parts[4] == "start"
    ):
        session = store.get(path_parts[2], user_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        try:
            egress_id = start_recording(session.meeting_room)
        except EgressError as error:
            return HTTPStatus.SERVICE_UNAVAILABLE, {"error": "livekit_not_configured", "message": str(error)}
        updated = replace(session, egress_id=egress_id)
        store.sessions[session.id] = updated
        if store.repo:
            store.repo.save_session(updated, user_id)
        return HTTPStatus.OK, {"egress_id": egress_id}

    # 停止 Egress 录制
    if (
        method == "POST"
        and len(path_parts) == 5
        and path_parts[:2] == ["api", "sessions"]
        and path_parts[3] == "recording"
        and path_parts[4] == "stop"
    ):
        session = store.get(path_parts[2], user_id)
        if session is None:
            return HTTPStatus.NOT_FOUND, {"error": "session_not_found"}
        if not session.egress_id:
            return HTTPStatus.BAD_REQUEST, {"error": "no_active_recording"}
        try:
            result = stop_recording(session.egress_id)
        except EgressError as error:
            return HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "egress_stop_failed", "message": str(error)}
        # 将 Egress 本地文件上传到 Supabase Storage
        video_path = ""
        try:
            video_path = transfer_egress_file(result["file_path"], user_id, session.id)
        except Exception as error:
            log.warning("Failed to transfer egress file to storage: %s", error)
            # 文件搬运失败不影响录制结果标记
        updated = replace(
            session,
            egress_id=None,
            video_path=video_path or None,
            video_duration_sec=result.get("duration_sec", 0.0),
            video_upload_failed=not video_path,
        )
        store.sessions[session.id] = updated
        if store.repo:
            store.repo.save_session(updated, user_id)
        return HTTPStatus.OK, {
            "video_path": video_path,
            "video_duration_sec": updated.video_duration_sec,
        }
```

- [ ] **Step 4: 添加文件搬运函数**

在 `api.py` 中新增 `transfer_egress_file` 函数（在 `handle_api_request` 之前）：

```python
def transfer_egress_file(local_path: str, user_id: str, session_id: str) -> str:
    """将 Egress 输出的本地文件上传到 Supabase Storage。"""
    from backend.storage.video import upload_video
    with open(local_path, "rb") as f:
        video_bytes = f.read()
    return upload_video(user_id, session_id, video_bytes)
```

- [ ] **Step 5: 更新 `serialize_session` 输出 `egress_id`**

在 `api.py` 的 `serialize_session` 函数中，确保 `egress_id` 被序列化（应在 `meeting_room` 之后）：

```python
    "egress_id": session.egress_id,
```

- [ ] **Step 6: 运行测试验证通过**

```bash
uv run python -m unittest backend.tests.test_api.TestRecordingEndpoints -v
```

Expected: 5 个测试全部 PASS

- [ ] **Step 7: 运行全部后端测试确认无回归**

```bash
uv run python -m unittest discover -s backend/tests -v
```

Expected: 全部 PASS

- [ ] **Step 8: 提交**

```bash
git add backend/interview/api.py backend/tests/test_api.py
git commit -m "feat: add /recording/start and /recording/stop API endpoints"
```

---

### Task 5: 前端 InterviewSession 类型 + API 客户端更新

**Files:**
- Modify: `frontend/src/interviewFlow.ts`
- Modify: `frontend/src/apiClient.ts`

前端类型和 API 调用与后端对齐。

- [ ] **Step 1: 在 `interviewFlow.ts` 的 `InterviewSession` 类型中新增 `egressId`**

在 `meetingRoom` 之后新增：

```typescript
  egressId?: string | null;
```

- [ ] **Step 2: 在 `apiClient.ts` 中新增录制 API 函数**

在 `requestLiveKitToken` 之后新增：

```typescript
export async function startRecording(
  sessionId: string,
  options: ClientOptions = {}
): Promise<{ egressId: string }> {
  return await request<{ egressId: string }>(
    `/api/sessions/${sessionId}/recording/start`,
    {},
    200,
    options
  );
}

export async function stopRecording(
  sessionId: string,
  options: ClientOptions = {}
): Promise<{ videoPath: string; videoDurationSec: number }> {
  return await request<{ videoPath: string; videoDurationSec: number }>(
    `/api/sessions/${sessionId}/recording/stop`,
    {},
    200,
    options
  );
}
```

- [ ] **Step 3: 在 `apiClient.ts` 的 `mapApiSession` 中映射 `egress_id`**

找到 `mapApiSession` 函数中 `meetingRoom` 的映射行，在其后新增：

```typescript
  egressId: raw.egress_id ?? null,
```

- [ ] **Step 4: 运行前端测试**

```bash
cd frontend && pnpm test
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/interviewFlow.ts frontend/src/apiClient.ts
git commit -m "feat: add recording API client and egressId to InterviewSession type"
```

---

### Task 6: 改造 useVideoRecorder — Egress 优先 + 客户端 fallback

**Files:**
- Modify: `frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts`

核心改造：先尝试 Egress 服务端录制，失败则降级到客户端 MediaRecorder。视频分析（canvas 指标、关键帧）不受影响，仍然依赖 `recordingStartTimeRef`。

- [ ] **Step 1: 重写 `useVideoRecorder.ts`**

```typescript
import { useCallback, useRef, useState } from "react";

import { startRecording, stopRecording, uploadInterviewVideo } from "@/apiClient";

export type VideoRecorderHandle = {
  startRecording: (cameraStream: MediaStream | null, canvas: HTMLCanvasElement | null) => void;
  stopAndUpload: (sessionId: string) => Promise<{ videoPath: string; videoDurationSec: number } | null>;
  recordingStartTimeRef: React.RefObject<number | null>;
  isRecording: boolean;
  uploadError: string | null;
};

type RecordingMode = "egress" | "client" | null;

export function useVideoRecorder(): VideoRecorderHandle {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const recordingModeRef = useRef<RecordingMode>(null);
  const egressStartedRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const startRecording = useCallback((cameraStream: MediaStream | null, canvas: HTMLCanvasElement | null) => {
    if (mediaRecorderRef.current?.state === "recording" || egressStartedRef.current) {
      return;
    }

    // 优先尝试 Egress 服务端录制（异步，不阻塞面试流程）
    egressStartedRef.current = true;
    recordingModeRef.current = "egress";
    recordingStartTimeRef.current = performance.now();
    setIsRecording(true);
    // 注意：Egress startRecording 是异步的，但录制在服务端进行
    // 前端不需要等待它完成即可继续面试

    // 同时启动客户端录制作为 fallback
    // 如果 Egress 不可用，客户端录制确保仍有视频
    if (cameraStream || canvas) {
      try {
        let recordingStream: MediaStream;

        if (canvas) {
          const canvasStream = canvas.captureStream(15);
          if (cameraStream) {
            const audioTrack = cameraStream.getAudioTracks()[0];
            if (audioTrack) {
              canvasStream.addTrack(audioTrack);
            }
          }
          recordingStream = canvasStream;
        } else if (cameraStream) {
          recordingStream = cameraStream;
        } else {
          return;
        }

        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";

        const recorder = new MediaRecorder(recordingStream, {
          mimeType,
          videoBitsPerSecond: 200000,
        });

        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.start(10000);
        mediaRecorderRef.current = recorder;
      } catch {
        // 客户端录制启动失败，仅依赖 Egress
      }
    }
  }, []);

  const stopAndUpload = useCallback(async (sessionId: string): Promise<{ videoPath: string; videoDurationSec: number } | null> => {
    const mode = recordingModeRef.current;
    recordingModeRef.current = null;
    egressStartedRef.current = false;
    setIsRecording(false);
    setUploadError(null);

    // 停止客户端 MediaRecorder
    const clientBlob = await _stopClientRecorder(mediaRecorderRef, chunksRef);

    // 优先使用 Egress 服务端录制
    if (mode === "egress") {
      try {
        const result = await stopRecording(sessionId);
        if (result.videoPath) {
          return { videoPath: result.videoPath, videoDurationSec: result.videoDurationSec };
        }
      } catch {
        // Egress 停止失败，降级到客户端上传
      }
    }

    // Fallback: 客户端录制上传
    if (clientBlob && clientBlob.size > 0) {
      const startTime = recordingStartTimeRef.current;
      const durationSec = startTime ? (performance.now() - startTime) / 1000 : 0;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await uploadInterviewVideo(sessionId, clientBlob, { durationSec });
          recordingStartTimeRef.current = null;
          return { videoPath: result.videoPath, videoDurationSec: durationSec };
        } catch (error) {
          if (attempt === 0) continue;
          const msg = error instanceof Error ? error.message : "视频上传失败";
          setUploadError(msg);
        }
      }
    }

    recordingStartTimeRef.current = null;
    return null;
  }, []);

  return {
    startRecording,
    stopAndUpload,
    recordingStartTimeRef,
    isRecording,
    uploadError,
  };
}

async function _stopClientRecorder(
  mediaRecorderRef: React.RefObject<MediaRecorder | null>,
  chunksRef: React.RefObject<Blob[]>,
): Promise<Blob | null> {
  const recorder = mediaRecorderRef.current;
  if (!recorder || recorder.state === "inactive") {
    return null;
  }

  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunksRef.current, { type: "video/webm" }));
    };
  });

  recorder.stop();
  mediaRecorderRef.current = null;
  return await stopped;
}
```

- [ ] **Step 2: 在 `InterviewPage/index.tsx` 中触发 Egress 启动**

在 `handleStartCandidateAnswer` 函数中，`recorder.startRecording(...)` 之后，异步触发 Egress：

找到现有代码：
```typescript
      recorder.startRecording(video.analysisStreamRef.current, video.analysisCanvasRef.current);
```

在其后新增：

```typescript
      // 异步启动 Egress 服务端录制（不阻塞面试流程）
      startRecording(session.id).catch(() => {
        // Egress 不可用，客户端录制仍在进行
      });
```

同时在文件顶部新增 import：

```typescript
import { startRecording as startEgressRecording } from "@/apiClient";
```

并将调用改为 `startEgressRecording(session.id)`。

- [ ] **Step 3: 运行前端测试**

```bash
cd frontend && pnpm test
```

Expected: 全部 PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts frontend/src/pages/InterviewPage/index.tsx
git commit -m "feat: egress-first recording with client-side fallback"
```

---

### Task 7: Docker Compose 配置 LiveKit + Egress 服务

**Files:**
- Modify: `docker-compose.yml`
- Create: `livekit.yaml`
- Create: `egress.yaml`

添加 LiveKit Server 和 Egress 容器，实现开箱即用的本地开发环境。

- [ ] **Step 1: 创建 `livekit.yaml`**

```yaml
# livekit.yaml — LiveKit 服务器配置
port: 7880
rtc:
  port_range_start: 7882
  port_range_end: 7882
  use_external_ip: false
  node_ip: 127.0.0.1
keys:
  devkey: devsecret
```

- [ ] **Step 2: 创建 `egress.yaml`**

```yaml
# egress.yaml — Egress 录制服务配置
api_key: devkey
api_secret: devsecret
livekit_url: ws://livekit:7880
# 录制文件输出到本地卷
file_output_path: /out
```

- [ ] **Step 3: 在 `docker-compose.yml` 中新增服务**

在 `asr` 服务之后、`frontend` 服务之前新增：

```yaml
  livekit:
    image: livekit/livekit-server:v1.8
    command: --config /etc/livekit.yaml
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
    ports:
      - "${LIVEKIT_PORT:-7880}:7880"
      - "7882:7882"
      - "7882:7882/udp"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:7880 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3

  egress:
    image: livekit/egress:v1.8
    command: --config /etc/egress.yaml
    volumes:
      - ./egress.yaml:/etc/egress.yaml:ro
      - egress-output:/out
    depends_on:
      livekit:
        condition: service_healthy
    restart: unless-stopped
```

在文件末尾新增 volumes 声明：

```yaml
volumes:
  egress-output:
```

- [ ] **Step 4: 在 `docker-compose.dev.yml` 中添加 LiveKit 环境变量**

在 `backend` 服务的 `environment` 中添加（如没有 `environment` 则新增）：

```yaml
    environment:
      LIVEKIT_URL: ws://livekit:7880
      LIVEKIT_API_KEY: devkey
      LIVEKIT_API_SECRET: devsecret
```

同时在前端 `environment` 中确保不需要新增变量（LiveKit URL 通过后端 API 返回，前端不直接连接 LiveKit）。

- [ ] **Step 5: 验证配置语法**

```bash
docker compose -f docker-compose.yml config
```

Expected: 无 YAML 语法错误，显示完整配置

- [ ] **Step 6: 提交**

```bash
git add docker-compose.yml docker-compose.dev.yml livekit.yaml egress.yaml
git commit -m "feat: add LiveKit server and Egress services to docker compose"
```

---

### Task 8: 健康检查端点增加 Egress 状态

**Files:**
- Modify: `backend/interview/api.py`

在 `/api/health` 中增加 Egress 组件的可用性检测，方便运维判断录制是否可用。

- [ ] **Step 1: 在 `_handle_health` 函数的 `components` 字典中新增 `egress` 字段**

在 `livekit` 条目之后新增：

```python
            "egress": {
                "configured": bool(os.environ.get("LIVEKIT_URL")),
                "description": "服务端视频录制（需要 LiveKit + Egress）",
            },
```

- [ ] **Step 2: 运行健康检查测试**

```bash
uv run python -m unittest backend.tests.test_api.TestHealthEndpoint -v
```

Expected: PASS，且返回的 `components.egress` 字段存在

- [ ] **Step 3: 提交**

```bash
git add backend/interview/api.py
git commit -m "feat: add egress status to health endpoint"
```

---

### Task 9: 端到端集成验证

**Files:** 无新文件

在 Docker 环境中启动所有服务，手动验证完整录制流程。

- [ ] **Step 1: 启动开发环境**

```bash
./compose.sh up
```

- [ ] **Step 2: 创建 Mock 面试会话**

通过前端 `/recruiter/setup` 创建 Mock 面试，获取 session ID。

- [ ] **Step 3: 进入面试间，观察 LiveKit 连接和录制启动**

1. 进入 `/interview/{sessionId}`
2. 确认 LiveKit 连接成功（CandidateVideo 显示摄像头画面）
3. 点击"开始回答"触发录制
4. 检查后端日志确认 `start_recording` 返回 egress_id
5. 检查 `GET /api/sessions/{id}` 响应中 `egress_id` 非空

- [ ] **Step 4: 模拟断连恢复**

1. 刷新浏览器页面
2. 重新进入面试间
3. 确认 LiveKit 自动重连
4. 确认录制未中断（Egress 在服务端继续运行）

- [ ] **Step 5: 完成面试，验证录制停止和文件生成**

1. 回答所有问题
2. 检查后端日志确认 `stop_recording` 返回文件信息
3. 检查 `GET /api/sessions/{id}` 响应中 `video_path` 非空
4. 在报告页确认视频可播放

- [ ] **Step 6: 测试 LiveKit 未配置时的 fallback**

1. 停止 LiveKit 容器：`docker compose stop livekit egress`
2. 创建新面试并完成
3. 确认客户端录制 fallback 正常工作
4. 视频通过 `uploadInterviewVideo` 上传成功

- [ ] **Step 7: 提交最终状态**

如有任何修复，提交：

```bash
git add -A
git commit -m "fix: integration fixes from e2e verification"
```

---

## 自查清单

### Spec 覆盖

| 需求 | 对应 Task |
|------|-----------|
| LiveKit SDK 替代手搓 JWT | Task 1 |
| Egress 录制控制模块 | Task 2 |
| egress_id 持久化到 session | Task 3 |
| 录制 API 端点 | Task 4 |
| 前端类型和 API 对齐 | Task 5 |
| Egress 优先 + 客户端 fallback | Task 6 |
| Docker 本地开发环境 | Task 7 |
| 健康检查 | Task 8 |
| 端到端验证 | Task 9 |

### 占位符扫描

无 TBD/TODO/占位符。所有步骤包含完整代码。

### 类型一致性

- `egress_id` / `egressId`: 后端 snake_case，前端 camelCase，通过 `mapApiSession` 映射
- `start_recording()` 返回 `str`（egress_id），`stop_recording()` 返回 `dict[str, str | float]`
- 前端 `startRecording()` 返回 `Promise<{ egressId: string }>`，`stopRecording()` 返回 `Promise<{ videoPath: string; videoDurationSec: number }>`
