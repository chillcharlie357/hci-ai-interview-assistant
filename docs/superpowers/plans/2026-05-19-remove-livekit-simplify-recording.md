# 移除 LiveKit，简化视频录制 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 LiveKit 全家桶（livekit-server/redis/egress 容器及相关代码），用纯客户端 MediaRecorder + IndexedDB 断点续录 + Supabase Storage 替代。

**Architecture:** 录制流程从双路径（Egress 服务端 + MediaRecorder 客户端）简化为单路径：getUserMedia → Canvas.captureStream → MediaRecorder → IndexedDB 持久化 → 面试结束合并上传 Supabase Storage。候选人自拍从 LiveKitRoom 改为本地 `<video>` 元素。

**Tech Stack:** TypeScript/React (前端), Python 3.12 (后端), Supabase Storage, IndexedDB API, MediaRecorder API

---

### Task 1: 删除后端 LiveKit/Egress 源文件

**Files:**
- Delete: `backend/interview/egress.py`
- Delete: `backend/interview/livekit_token.py`
- Delete: `backend/tests/test_egress.py`

- [ ] **Step 1: 删除文件**

```bash
cd "I:\code\hci-ai-interview-assistant"
rm backend/interview/egress.py
rm backend/interview/livekit_token.py
rm backend/tests/test_egress.py
```

- [ ] **Step 2: 删除对应的 __pycache__**

```bash
rm -rf backend/interview/__pycache__/egress*
rm -rf backend/interview/__pycache__/livekit_token*
rm -rf backend/tests/__pycache__/test_egress*
```

- [ ] **Step 3: Commit**

```bash
git add backend/interview/egress.py backend/interview/livekit_token.py backend/tests/test_egress.py
git commit -m "refactor: remove LiveKit egress and token modules"
```

---

### Task 2: 清理 session.py — 移除 egress_id 和 meeting_room

**Files:**
- Modify: `backend/interview/session.py`

- [ ] **Step 1: 从 InterviewSession dataclass 移除 meeting_room 和 egress_id**

在 `backend/interview/session.py` 中，找到 `InterviewSession` dataclass（约第 100-120 行），删除 `meeting_room` 和 `egress_id` 字段：

```python
# 删除这两行:
    meeting_room: str = ""
    egress_id: str | None = None  # LiveKit Egress 录制 ID
```

- [ ] **Step 2: 从 create_interview_session 移除 meeting_room 赋值**

在 `create_interview_session` 函数中（约第 160 行），删除：

```python
# 删除:
        meeting_room=f"interview-{session_id}",
```

- [ ] **Step 3: 验证 Python 语法**

```bash
uv run python -c "from backend.interview.session import InterviewSession, create_interview_session; s = create_interview_session(candidate_name='test'); print(f'OK: {s.id}')"
```

Expected: `OK: session_...`

- [ ] **Step 4: Commit**

```bash
git add backend/interview/session.py
git commit -m "refactor: remove meeting_room and egress_id from InterviewSession"
```

---

### Task 3: 清理 session_repo.py — 移除 meeting_room 和 egress_id 序列化

**Files:**
- Modify: `backend/database/session_repo.py`

- [ ] **Step 1: 从 to_dict 方法中移除 meeting_room 和 egress_id**

在 `backend/database/session_repo.py` 第 227 行和第 233 行，删除：

```python
# 删除:
            'meeting_room': data.get('meeting_room', ''),
# 删除:
            'egress_id': data.get('egress_id'),
```

- [ ] **Step 2: 验证**

```bash
uv run python -c "from backend.database.session_repo import SessionRepo; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/database/session_repo.py
git commit -m "refactor: remove meeting_room and egress_id from session_repo serialization"
```

---

### Task 4: 清理 api.py — 移除 LiveKit/Egress 相关代码

**Files:**
- Modify: `backend/interview/api.py`

- [ ] **Step 1: 移除 import**

删除第 31 行和第 33 行：

```python
# 删除:
from backend.interview.egress import start_recording, stop_recording, EgressError
from backend.interview.livekit_token import LiveKitConfigError, create_livekit_token
```

- [ ] **Step 2: 删除 transfer_egress_file 函数**

删除第 463-468 行：

```python
# 删除整个函数:
def transfer_egress_file(local_path: str, user_id: str, session_id: str) -> str:
    """将 Egress 输出的本地文件上传到 Supabase Storage。"""
    ...
```

- [ ] **Step 3: 删除 livekit-token 路由**

删除第 595-612 行（`POST /api/sessions/{id}/livekit-token` 路由）。

- [ ] **Step 4: 删除 Egress start/stop 路由**

删除第 614-671 行（`POST /api/sessions/{id}/recording/start` 和 `POST /api/sessions/{id}/recording/stop` 路由）。

- [ ] **Step 5: 删除健康检查中的 livekit 和 egress 组件**

在第 892-899 行，删除：

```python
# 删除:
            "livekit": {
                "url": bool(os.environ.get("LIVEKIT_URL")),
                "accepted": all(os.environ.get(k) for k in ("LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")),
            },
            "egress": {
                "configured": bool(os.environ.get("LIVEKIT_URL")),
                "description": "服务端视频录制（需要 LiveKit + Egress）",
            },
```

- [ ] **Step 6: 验证语法和健康检查**

```bash
uv run python -c "from backend.interview.api import handle_api_request; print('OK')"
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/interview/api.py
git commit -m "refactor: remove LiveKit/Egress routes and health check from API"
```

---

### Task 5: 清理 Docker Compose 和配置文件

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Delete: `livekit.yaml`
- Delete: `egress.yaml`

- [ ] **Step 1: 从 docker-compose.yml 删除 livekit/redis/egress 服务和 egress-output 卷**

删除 `docker-compose.yml` 中第 42-79 行的 livekit/redis/egress 服务定义，以及第 105-106 行的 `volumes:` 中的 `egress-output`。

```yaml
# 删除整个 livekit 服务块（第 42-56 行）
# 删除整个 redis 服务块（第 58-65 行）
# 删除整个 egress 服务块（第 67-79 行）
# 如果 volumes 只剩 egress-output 则删除整个 volumes 块
```

具体操作：删除第 42 行（`  livekit:`）到第 79 行（`    restart: unless-stopped`），以及 volumes 中的 `egress-output:` 行。

- [ ] **Step 2: 从 docker-compose.dev.yml 删除 LiveKit 环境变量**

删除第 12-15 行：

```yaml
# 删除:
      LIVEKIT_URL: ws://livekit:7880
      LIVEKIT_PUBLIC_URL: ws://127.0.0.1:${LIVEKIT_PORT:-7880}
      LIVEKIT_API_KEY: devkey
      LIVEKIT_API_SECRET: devsecret
```

- [ ] **Step 3: 删除 livekit.yaml 和 egress.yaml**

```bash
rm livekit.yaml
rm egress.yaml
```

- [ ] **Step 4: 验证 Docker Compose 配置**

```bash
docker compose -f docker-compose.yml config --quiet 2>&1 || echo "check output above"
```

Expected: 无错误输出（只有 warnings 可忽略）。

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml livekit.yaml egress.yaml
git commit -m "refactor: remove LiveKit/Egress/Redis services from Docker Compose"
```

---

### Task 6: 清理 Python 依赖

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: 从 pyproject.toml 移除 livekit 和 aiohttp 依赖**

```bash
uv remove livekit aiohttp
```

- [ ] **Step 2: 同步锁文件**

```bash
uv lock
```

- [ ] **Step 3: 验证后端仍可导入**

```bash
uv run python -c "from backend.interview.api import handle_api_request; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: 运行 Python 测试**

```bash
uv run python -m unittest discover -s backend/tests
```

Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "refactor: remove livekit and aiohttp Python dependencies"
```

---

### Task 7: 创建 IndexedDB 持久化层 videoStorage.ts

**Files:**
- Create: `frontend/src/pages/InterviewPage/hooks/videoStorage.ts`

- [ ] **Step 1: 创建 videoStorage.ts**

```typescript
// frontend/src/pages/InterviewPage/hooks/videoStorage.ts

const DB_NAME = "interview-video";
const DB_VERSION = 1;
const STORE_NAME = "recording-chunks";

interface RecordingData {
  chunks: Array<{ seq: number; blob: Blob }>;
  accumulatedDuration: number;
  mimeType: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveChunk(
  sessionId: string,
  seq: number,
  blob: Blob
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<RecordingData | undefined>((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result);
  });

  const data: RecordingData = existing ?? {
    chunks: [],
    accumulatedDuration: 0,
    mimeType: blob.type || "video/webm",
  };
  data.chunks.push({ seq, blob });

  return new Promise((resolve, reject) => {
    const req = store.put(data, sessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getRecordingData(
  sessionId: string
): Promise<RecordingData | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function updateAccumulatedDuration(
  sessionId: string,
  durationSec: number
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const existing = await new Promise<RecordingData | undefined>((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result);
  });
  if (existing) {
    existing.accumulatedDuration = durationSec;
    return new Promise((resolve, reject) => {
      const req = store.put(existing, sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export async function mergeAndClear(
  sessionId: string
): Promise<{ blob: Blob; mimeType: string } | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const data = await new Promise<RecordingData | undefined>((resolve) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result);
  });

  if (!data || data.chunks.length === 0) return null;

  const sorted = [...data.chunks].sort((a, b) => a.seq - b.seq);
  const blob = new Blob(
    sorted.map((c) => c.blob),
    { type: data.mimeType || "video/webm" }
  );

  // 合并成功后清除 IndexedDB
  return new Promise((resolve, reject) => {
    const delReq = store.delete(sessionId);
    delReq.onsuccess = () => resolve({ blob, mimeType: data.mimeType });
    delReq.onerror = () => reject(delReq.error);
  });
}

export async function deleteRecordingData(
  sessionId: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const req = store.delete(sessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit src/pages/InterviewPage/hooks/videoStorage.ts
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/InterviewPage/hooks/videoStorage.ts
git commit -m "feat: add IndexedDB persistence layer for video recording chunks"
```

---

### Task 8: 重写 useVideoRecorder.ts

**Files:**
- Modify: `frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts`

- [ ] **Step 1: 用简化版本替换 useVideoRecorder.ts**

```typescript
import { useCallback, useRef, useState } from "react";

import { uploadInterviewVideo } from "@/apiClient";
import {
  saveChunk,
  getRecordingData,
  updateAccumulatedDuration,
  mergeAndClear,
} from "./videoStorage";

export type VideoRecorderHandle = {
  startRecording: (
    sessionId: string,
    cameraStream: MediaStream | null,
    canvas: HTMLCanvasElement | null
  ) => Promise<void>;
  stopAndUpload: (
    sessionId: string
  ) => Promise<{ videoPath: string; videoDurationSec: number } | null>;
  recordingStartTimeRef: React.RefObject<number | null>;
  accumulatedDurationRef: React.RefObject<number>;
  isRecording: boolean;
  uploadError: string | null;
};

export function useVideoRecorder(): VideoRecorderHandle {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksSeqRef = useRef(0);
  const recordingStartTimeRef = useRef<number | null>(null);
  const accumulatedDurationRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const startRecording = useCallback(
    async (
      sessionId: string,
      cameraStream: MediaStream | null,
      canvas: HTMLCanvasElement | null
    ) => {
      if (mediaRecorderRef.current?.state === "recording") return;

      // 恢复已有的录制数据
      const existing = await getRecordingData(sessionId);
      if (existing) {
        accumulatedDurationRef.current = existing.accumulatedDuration;
        chunksSeqRef.current = existing.chunks.length;
      } else {
        accumulatedDurationRef.current = 0;
        chunksSeqRef.current = 0;
      }

      recordingStartTimeRef.current = performance.now();
      setIsRecording(true);

      if (!cameraStream && !canvas) return;

      try {
        let recordingStream: MediaStream;

        if (canvas) {
          recordingStream = canvas.captureStream(15);
          if (cameraStream) {
            const audioTrack = cameraStream.getAudioTracks()[0];
            if (audioTrack) recordingStream.addTrack(audioTrack);
          }
        } else {
          recordingStream = cameraStream!;
        }

        const mimeType = MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp8,opus"
        )
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";

        const recorder = new MediaRecorder(recordingStream, {
          mimeType,
          videoBitsPerSecond: 200000,
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            const seq = chunksSeqRef.current++;
            void saveChunk(sessionId, seq, event.data);
          }
        };

        recorder.start(10000);
        mediaRecorderRef.current = recorder;
      } catch {
        // 录制失败，静默降级
      }
    },
    []
  );

  const stopAndUpload = useCallback(
    async (
      sessionId: string
    ): Promise<{ videoPath: string; videoDurationSec: number } | null> => {
      setIsRecording(false);
      setUploadError(null);

      // 停止 MediaRecorder，等待最后一个 ondataavailable
      await stopMediaRecorder(mediaRecorderRef);

      // 更新累计时长
      const startTime = recordingStartTimeRef.current;
      if (startTime) {
        const segmentDuration = (performance.now() - startTime) / 1000;
        accumulatedDurationRef.current += segmentDuration;
        await updateAccumulatedDuration(
          sessionId,
          accumulatedDurationRef.current
        );
      }
      recordingStartTimeRef.current = null;

      // 合并 IndexedDB 中的所有分片
      const merged = await mergeAndClear(sessionId);
      if (!merged || merged.blob.size === 0) return null;

      const durationSec = accumulatedDurationRef.current;

      // 上传（重试 1 次）
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await uploadInterviewVideo(sessionId, merged.blob, {
            durationSec,
          });
          accumulatedDurationRef.current = 0;
          return {
            videoPath: result.videoPath,
            videoDurationSec: durationSec,
          };
        } catch (error) {
          if (attempt === 0) continue;
          const msg =
            error instanceof Error ? error.message : "视频上传失败";
          setUploadError(msg);
        }
      }

      accumulatedDurationRef.current = 0;
      return null;
    },
    []
  );

  return {
    startRecording,
    stopAndUpload,
    recordingStartTimeRef,
    accumulatedDurationRef,
    isRecording,
    uploadError,
  };
}

function stopMediaRecorder(
  ref: React.RefObject<MediaRecorder | null>
): Promise<void> {
  const recorder = ref.current;
  if (!recorder || recorder.state === "inactive") return Promise.resolve();

  return new Promise((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
    ref.current = null;
  });
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 可能有其他尚未修改文件的错误，但 useVideoRecorder.ts 本身无新增错误。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts
git commit -m "refactor: rewrite useVideoRecorder with IndexedDB persistence, remove Egress path"
```

---

### Task 9: 重写 CandidateVideo.tsx — LiveKitRoom → 本地 video

**Files:**
- Modify: `frontend/src/pages/InterviewPage/components/CandidateVideo.tsx`

- [ ] **Step 1: 用简化版本替换 CandidateVideo.tsx**

```typescript
import { useEffect, useRef } from "react";
import { UserOutlined } from "@ant-design/icons";
import "./CandidateVideo.css";

interface CandidateVideoProps {
  cameraStream: MediaStream | null;
  cameraEnabled: boolean;
}

export function CandidateVideo({
  cameraStream,
  cameraEnabled,
}: CandidateVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && cameraStream && cameraEnabled) {
      video.srcObject = cameraStream;
    }
    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [cameraStream, cameraEnabled]);

  if (!cameraEnabled) {
    return (
      <div className="candidate-video-tile">
        <div className="video-placeholder">
          <UserOutlined />
          <p>摄像头已关闭</p>
        </div>
      </div>
    );
  }

  if (!cameraStream) {
    return (
      <div className="candidate-video-tile">
        <div className="video-placeholder">
          <UserOutlined />
          <p>正在启动摄像头...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="candidate-video-tile">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="candidate-self-view"
      />
    </div>
  );
}
```

- [ ] **Step 2: 更新 CandidateVideo.css — 添加 self-view 样式**

```css
.candidate-video-tile {
  aspect-ratio: 4 / 3;
  background: var(--color-bg-container, #141414);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.candidate-self-view {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-tertiary, #666);
  padding: 24px;
  text-align: center;
}

.video-placeholder .anticon {
  font-size: 48px;
  opacity: 0.6;
}
```

- [ ] **Step 3: 清理 InterviewPage.css 中 LiveKit 相关样式**

删除 InterviewPage.css 中第 726-753 行的 LiveKit 样式：

```css
/* 删除以下所有内容:
/* ===== LiveKit 候选人视频 ===== */
.candidate-livekit-room { ... }
.candidate-video-grid { ... }
.lk-button-group-menu { ... }
.lk-control-bar { ... }
.lk-button { ... }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/InterviewPage/components/CandidateVideo.tsx frontend/src/pages/InterviewPage/components/CandidateVideo.css frontend/src/pages/InterviewPage/InterviewPage.css
git commit -m "refactor: replace LiveKitRoom with local video element for candidate self-view"
```

---

### Task 10: 更新 InterviewPage/index.tsx

**Files:**
- Modify: `frontend/src/pages/InterviewPage/index.tsx`

- [ ] **Step 1: 移除 useLiveKit import 和 Egress startRecording import**

第 6 行删除 `startRecording as startEgressRecording` import，第 13 行删除 `useLiveKit` import：

```typescript
// 删除:
import { startRecording as startEgressRecording } from "@/apiClient";
// 删除:
import { useLiveKit } from "./hooks/useLiveKit";
```

- [ ] **Step 2: 删除 useLiveKit hook 调用**

删除第 43 行：

```typescript
// 删除:
  const liveKit = useLiveKit(sessionId, session);
```

- [ ] **Step 3: 更新 useVideoRecorder 调用和 CandidateVideo props**

第 41 行保持不变（`const recorder = useVideoRecorder();`）。

第 42 行 `useVideoAnalysis` 需要新增 `accumulatedDurationRef` 参数：

```typescript
// 修改为:
  const video = useVideoAnalysis(sessionId, session, updateSession, recorder.recordingStartTimeRef, recorder.accumulatedDurationRef);
```

第 136-142 行，`handleStartCandidateAnswer` 中改为：

```typescript
    // 第一次回答时启动录制
    if (!recorder.isRecording && session?.id) {
      await recorder.startRecording(session.id, video.analysisStreamRef.current, video.analysisCanvasRef.current);
    }
```

删除原来的 `startEgressRecording(session.id).catch(...)` 调用。

第 235 行，CandidateVideo 改为：

```typescript
          <CandidateVideo
            cameraStream={video.analysisStreamRef.current}
            cameraEnabled={video.cameraEnabled}
          />
```

- [ ] **Step 4: 验证 TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

修正所有类型错误后再继续。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/InterviewPage/index.tsx
git commit -m "refactor: remove useLiveKit and Egress calls from InterviewPage"
```

---

### Task 11: 更新 useVideoAnalysis — 新增 accumulatedDurationRef 参数

**Files:**
- Modify: `frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts`

- [ ] **Step 1: 更新函数签名和关键帧时间戳计算**

在 `useVideoAnalysis` 函数签名中新增 `accumulatedDurationRef` 参数：

```typescript
export function useVideoAnalysis(
  sessionId: string | undefined,
  session: InterviewSession | null,
  onSessionUpdate: (updated: InterviewSession) => void,
  recordingStartTimeRef: React.RefObject<number | null>,
  accumulatedDurationRef: React.RefObject<number>
): VideoAnalysisHandle {
```

在关键帧计算处（约第 140 行），修改时间戳为：

```typescript
videoTimestampSec: recordingStartTimeRef.current
  ? (accumulatedDurationRef.current + (timestampMs - recordingStartTimeRef.current) / 1000)
  : null,
```

- [ ] **Step 2: 验证 TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts
git commit -m "feat: add accumulatedDuration offset for keyframe timestamps across recording segments"
```

---

### Task 12: 清理 apiClient.ts — 移除 LiveKit/Egress 函数

**Files:**
- Modify: `frontend/src/apiClient.ts`

- [ ] **Step 1: 删除 requestLiveKitToken 函数（第 374-388 行）**

```typescript
// 删除整个函数
export async function requestLiveKitToken(...)
```

- [ ] **Step 2: 删除 startRecording 函数（第 390-400 行）**

```typescript
// 删除整个函数
export async function startRecording(...)
```

- [ ] **Step 3: 删除 stopRecording 函数（第 402-412 行）**

```typescript
// 删除整个函数
export async function stopRecording(...)
```

- [ ] **Step 4: 删除 LiveKitToken 类型（如存在）**

检查并删除 `LiveKitToken` 类型定义（约第 75 行附近）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apiClient.ts
git commit -m "refactor: remove LiveKit/Egress API client functions"
```

---

### Task 13: 清理 interviewFlow.ts — 移除 egressId 和 meetingRoom

**Files:**
- Modify: `frontend/src/interviewFlow.ts`

- [ ] **Step 1: 从 InterviewSession 类型移除 meetingRoom 和 egressId**

删除第 138-139 行：

```typescript
// 删除:
  meetingRoom: string;
  egressId?: string | null;
```

- [ ] **Step 2: 从 createDraft/session 初始化中移除**

在 session 初始化对象中（约第 177 行）删除：

```typescript
// 删除:
    meetingRoom: "",
```

- [ ] **Step 3: 验证 TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/interviewFlow.ts
git commit -m "refactor: remove meetingRoom and egressId from frontend types"
```

---

### Task 14: 清理 apiClient.ts mapSession — 移除 meetingRoom 和 egressId 映射

**Files:**
- Modify: `frontend/src/apiClient.ts`

- [ ] **Step 1: 从 ApiSession 类型移除 egress_id 和 meeting_room**

在 ApiSession 类型中（约第 133、138 行）删除：

```typescript
// 删除:
  egress_id?: string | null;
// 检查 meeting_room 是否还在 ApiSession 中，若有则删除
```

- [ ] **Step 2: 从 mapSession 函数移除映射**

删除第 662-663 行：

```typescript
// 删除:
    meetingRoom: session.meeting_room ?? "",
    egressId: session.egress_id ?? null,
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/apiClient.ts
git commit -m "refactor: remove meetingRoom and egressId from API type mapping"
```

---

### Task 15: 删除前端 LiveKit 文件

**Files:**
- Delete: `frontend/src/pages/InterviewPage/hooks/useLiveKit.ts`
- Delete: `frontend/src/pages/InterviewPage/liveKitState.ts`
- Delete: `frontend/src/pages/InterviewPage/liveKitState.test.ts`

- [ ] **Step 1: 删除文件**

```bash
rm frontend/src/pages/InterviewPage/hooks/useLiveKit.ts
rm frontend/src/pages/InterviewPage/liveKitState.ts
rm frontend/src/pages/InterviewPage/liveKitState.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/InterviewPage/hooks/useLiveKit.ts frontend/src/pages/InterviewPage/liveKitState.ts frontend/src/pages/InterviewPage/liveKitState.test.ts
git commit -m "refactor: remove useLiveKit hook and liveKitState"
```

---

### Task 16: 清理 npm 依赖

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 移除 LiveKit 相关 npm 包**

```bash
cd frontend
pnpm remove livekit-client @livekit/components-react @livekit/components-styles
```

- [ ] **Step 2: 验证前端构建**

```bash
cd frontend && npx tsc --noEmit
```

修复所有残留的类型错误。

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "refactor: remove livekit-client and LiveKit Components npm dependencies"
```

---

### Task 17: 运行完整测试套件

- [ ] **Step 1: 运行 Python 测试**

```bash
uv run python -m unittest discover -s backend/tests -v
```

Expected: 所有测试通过。若有 `test_egress` 相关引用报错，确认文件已删除。

- [ ] **Step 2: 运行前端测试**

```bash
cd frontend && npx vitest run
```

Expected: 所有测试通过。若有 `liveKitState.test.ts` 引用报错，确认文件已删除。

- [ ] **Step 3: 运行前端构建**

```bash
cd frontend && npx vite build
```

Expected: 构建成功，无错误。

- [ ] **Step 4: 运行全量测试脚本**

```bash
bash scripts/test.sh
```

Expected: 所有测试通过。

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "chore: final cleanup after LiveKit removal, all tests pass"
```

---

## 实施顺序

推荐顺序：Task 1 → 2 → 3 → 4 → 5 → 6（后端清理，可一批做），Task 7 → 11 → 8 → 9 → 10 → 12 → 13 → 14 → 15 → 16（前端重构，注意 Task 11 须在 Task 10 之前），Task 17（验证）。

后端和前端可并行进行，因为它们之间无依赖（API 的 video 上传端点保持不变）。

## 验收标准

1. `docker-compose.yml` 不再包含 livekit/redis/egress 服务
2. `livekit.yaml`、`egress.yaml` 文件已删除
3. 搜索 `livekit`（排除 node_modules 和 .venv）无后端/前端源码引用
4. 面试录制可正常工作：开始回答 → 录制 → 离开页面 → 重新进入 → 继续录制 → 结束 → 视频上传成功
5. 关键帧时间戳在合并视频中定位正确
6. 报告页视频播放正常
7. 所有 Python 单元测试通过
8. 所有前端 vitest 测试通过
9. 前端 `vite build` 成功
