# 删除 LiveKit 音视频开关功能 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 CandidateVideo 组件中删除 ControlBar 及所有 mute 相关的状态管理和 ASR 联动逻辑。

**Architecture:** 纯删除操作，涉及 3 个文件。CandidateVideo 移除 ControlBar 和 mute 事件监听；InterviewPage 移除 liveKitMicMuted 状态；useSpeechRecognition 移除 mute 同步逻辑。

**Tech Stack:** TypeScript + React + LiveKit Components

---

### Task 1: 清理 CandidateVideo 组件

**Files:**
- Modify: `frontend/src/pages/InterviewPage/components/CandidateVideo.tsx`

- [ ] **Step 1: 删除 ControlBar、useLocalParticipant、TrackPublication 相关代码**

将以下导入：
```typescript
import {
  LiveKitRoom,
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, type TrackPublication } from "livekit-client";
```

替换为：
```typescript
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useConnectionState,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
```

将 `CandidateVideoProps` 接口：
```typescript
interface CandidateVideoProps {
  liveKit: { url: string; token: string; room: string } | null;
  meetingError: string;
  onMicrophoneMutedChange?: (muted: boolean) => void;
}
```

替换为：
```typescript
interface CandidateVideoProps {
  liveKit: { url: string; token: string; room: string } | null;
  meetingError: string;
}
```

将 `CandidateVideo` 函数签名：
```typescript
export function CandidateVideo({
  liveKit,
  meetingError,
  onMicrophoneMutedChange,
}: CandidateVideoProps) {
```

替换为：
```typescript
export function CandidateVideo({
  liveKit,
  meetingError,
}: CandidateVideoProps) {
```

将 LiveKitRoom 内部的组件使用：
```typescript
<CandidateLiveKitConference onMicrophoneMutedChange={onMicrophoneMutedChange} />
```

替换为：
```typescript
<CandidateLiveKitConference />
```

- [ ] **Step 2: 删除 CandidateLiveKitConference 中的 mute 监听和 ControlBar**

将 `CandidateLiveKitConference` 函数及其内部代码：
```typescript
function CandidateLiveKitConference({
  onMicrophoneMutedChange,
}: {
  onMicrophoneMutedChange?: (muted: boolean) => void;
}) {
  const [connectionError, setConnectionError] = useState<string>("");
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();

  // 监听 LiveKit 麦克风 track 的静音/取消静音事件
  useEffect(() => {
    if (!localParticipant) return;

    const handleTrackMuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Microphone) {
        onMicrophoneMutedChange?.(true);
      }
    };
    const handleTrackUnmuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Microphone) {
        onMicrophoneMutedChange?.(false);
      }
    };

    localParticipant.on("trackMuted", handleTrackMuted);
    localParticipant.on("trackUnmuted", handleTrackUnmuted);

    return () => {
      localParticipant.off("trackMuted", handleTrackMuted);
      localParticipant.off("trackUnmuted", handleTrackUnmuted);
    };
  }, [localParticipant, onMicrophoneMutedChange]);

  useEffect(() => {
    if (connectionState === "disconnected") {
      setConnectionError("视频连接已断开，请刷新页面重试");
    } else if (connectionState === "connected") {
      setConnectionError("");
    }
  }, [connectionState]);

  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  if (connectionError) {
    return (
      <div className="candidate-livekit-room">
        <div className="video-placeholder video-error">
          <DisconnectOutlined />
          <p>{connectionError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="candidate-livekit-room">
      <div className="candidate-video-grid">
        {cameraTracks.length > 0 ? (
          <GridLayout tracks={cameraTracks}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="video-placeholder">
            <UserOutlined />
            <p>正在连接摄像头...</p>
          </div>
        )}
      </div>
      <ControlBar
        controls={{
          microphone: true,
          camera: true,
          screenShare: false,
          chat: false,
          settings: false,
          leave: true,
        }}
      />
      <RoomAudioRenderer />
    </div>
  );
}
```

替换为：
```typescript
function CandidateLiveKitConference() {
  const [connectionError, setConnectionError] = useState<string>("");
  const connectionState = useConnectionState();

  useEffect(() => {
    if (connectionState === "disconnected") {
      setConnectionError("视频连接已断开，请刷新页面重试");
    } else if (connectionState === "connected") {
      setConnectionError("");
    }
  }, [connectionState]);

  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  if (connectionError) {
    return (
      <div className="candidate-livekit-room">
        <div className="video-placeholder video-error">
          <DisconnectOutlined />
          <p>{connectionError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="candidate-livekit-room">
      <div className="candidate-video-grid">
        {cameraTracks.length > 0 ? (
          <GridLayout tracks={cameraTracks}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="video-placeholder">
            <UserOutlined />
            <p>正在连接摄像头...</p>
          </div>
        )}
      </div>
      <RoomAudioRenderer />
    </div>
  );
}
```

- [ ] **Step 3: TypeScript 编译检查**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```
预期：无错误输出。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/InterviewPage/components/CandidateVideo.tsx
git commit -m "refactor: remove LiveKit ControlBar and mute event listeners from CandidateVideo"
```

---

### Task 2: 清理 InterviewPage 中的 mute 状态

**Files:**
- Modify: `frontend/src/pages/InterviewPage/index.tsx`

- [ ] **Step 1: 删除 liveKitMicMuted 状态及相关传参**

删除第 31 行：
```typescript
const [liveKitMicMuted, setLiveKitMicMuted] = useState(false);
```

将 `useSpeechRecognition` 调用（第 33-38 行）：
```typescript
const speech = useSpeechRecognition(
    sessionId,
    (interim) => setInterimTranscriptDisplay(interim),
    (finalText) => setAnswerTextFromAsr(finalText),
    liveKitMicMuted
);
```

替换为：
```typescript
const speech = useSpeechRecognition(
    sessionId,
    (interim) => setInterimTranscriptDisplay(interim),
    (finalText) => setAnswerTextFromAsr(finalText),
);
```

将 CandidateVideo 使用（第 237 行）：
```typescript
<CandidateVideo liveKit={liveKit.liveKit} meetingError={liveKit.meetingError} onMicrophoneMutedChange={setLiveKitMicMuted} />
```

替换为：
```typescript
<CandidateVideo liveKit={liveKit.liveKit} meetingError={liveKit.meetingError} />
```

- [ ] **Step 2: TypeScript 编译检查**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```
预期：无错误输出。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/InterviewPage/index.tsx
git commit -m "refactor: remove liveKitMicMuted state and mute callback from InterviewPage"
```

---

### Task 3: 清理 useSpeechRecognition 中的 mute 同步逻辑

**Files:**
- Modify: `frontend/src/pages/InterviewPage/hooks/useSpeechRecognition.ts`

- [ ] **Step 1: 删除 liveKitMicMuted 参数和 mute 同步 useEffect**

将函数签名（第 26-31 行）：
```typescript
export function useSpeechRecognition(
  sessionId: string | undefined,
  onInterimTranscript: (text: string) => void,
  onFinalTranscript: (text: string) => void,
  liveKitMicMuted: boolean = false,
): SpeechRecognitionHandle {
```

替换为：
```typescript
export function useSpeechRecognition(
  sessionId: string | undefined,
  onInterimTranscript: (text: string) => void,
  onFinalTranscript: (text: string) => void,
): SpeechRecognitionHandle {
```

删除 `stopMediaStream` 之后的整个 mute 同步代码块（第 169-209 行）：
```typescript
  // 同步 LiveKit 麦克风静音 → 暂停/恢复 ASR
  const pausedByLiveKitRef = useRef(false);

  useEffect(() => {
    if (!mediaStreamRef.current) return; // ASR 未启动，无需操作

    if (liveKitMicMuted) {
      // 静音：暂停 ASR 和 PCM 录音，但保留媒体流
      transcriberRef.current?.stop();
      if (qwenAsrRef.current) {
        void qwenAsrRef.current.stop();
        qwenAsrRef.current = null;
      }
      const recorder = pcmRecorderRef.current;
      if (recorder) {
        void recorder.stop();
        pcmRecorderRef.current = null;
      }
      setAudioChunkStatus("已静音");
      setAsrProvider("none");
      pausedByLiveKitRef.current = true;
    } else if (pausedByLiveKitRef.current) {
      // 取消静音：恢复 ASR 和 PCM 录音
      pausedByLiveKitRef.current = false;
      const stream = mediaStreamRef.current;
      if (!stream) return;

      void (async () => {
        try {
          const recorder = await startPcmRecorder(stream, (wavBlob) => {
            enqueueSpeechChunkUpload(wavBlob);
          });
          pcmRecorderRef.current = recorder;
          setAudioChunkStatus("采集中");
        } catch {
          setAudioChunkStatus("音频上传未启动");
        }
        await startAsrWithFallback(stream);
      })();
    }
  }, [liveKitMicMuted, enqueueSpeechChunkUpload, startAsrWithFallback]);
```

- [ ] **Step 2: TypeScript 编译检查**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```
预期：无错误输出。

- [ ] **Step 3: 运行前端测试**

```bash
cd frontend && pnpm test
```
预期：所有已有测试通过。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/InterviewPage/hooks/useSpeechRecognition.ts
git commit -m "refactor: remove liveKitMicMuted sync logic from useSpeechRecognition"
```

---

### 验证检查点

全部任务完成后运行：

```bash
cd frontend && npx tsc --noEmit && pnpm test
```

预期：TypeScript 编译无错误，所有测试通过。
