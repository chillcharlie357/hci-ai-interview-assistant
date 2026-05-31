# 视频面试 LiveKit 修复计划

> **For agentic workers:** 使用 superpowers:executing-plans 按任务顺序执行。步骤使用 checkbox (`- [ ]`) 语法跟踪进度。

**目标：** 修复 LiveKit 视频连接 20 秒后自动断开（ICE consent 失败）、Egress 录制 503、摄像头/麦克风多重占用、GridLayout 崩溃的问题。

**架构：** 升级 LiveKit 服务器从 v1.8 到 v1.9+ 以匹配客户端 SDK (2.18.8) 的 protocol 16，扩展 RTC 端口映射，统一摄像头/麦克风获取路径，添加连接失败优雅降级 UI。

**技术栈：** LiveKit Server v1.9+, livekit-client 2.18.8, @livekit/components-react 2.9.20, React 19, TypeScript, Python 3.12

---

## 环境现状

所有服务通过 Docker Compose 运行（`compose.sh up`）：

| 服务 | 容器 | 端口映射 | 状态 |
|------|------|----------|------|
| backend | `hci-ai-interview-assistant-backend-1` | `9000→8000` | unhealthy（health check 401，功能正常） |
| frontend | `hci-ai-interview-assistant-frontend-1` | `5173→5173` | running |
| livekit | `livekit/livekit-server:v1.8` | `7881→7880`, `7882→7882` | healthy |
| egress | `livekit/egress:v1.8` | — | running |
| redis | `redis:7-alpine` | — | healthy |
| asr | `hci-ai-interview-assistant-asr-1` | `9100→8765` | running |

---

## 根因分析（基于容器日志重新确认）

### 问题 1：WebRTC 连接 20 秒后断开（ICE consent 失败）

**LiveKit 服务器日志证据：**
```
02:24:50 participant active  {"connectionType": "udp", "publisherCandidates": [...], "subscriberCandidates": ["[local][selected:1][trickle] udp4 host 127.0.0.1:7882" ...]}
02:25:10 participant closing {"reason": "PEER_CONNECTION_DISCONNECTED", "isExpectedToResume": false}
```

**完整时序：**
```
1. 信令连接: ws://127.0.0.1:7881/rtc/v1 → 404 → 回退 /rtc → 连接成功
2. ICE 候选交换: 成功，选中 UDP (127.0.0.1:7882)
3. 对等连接建立: 成功，participant 变为 active
4. ICE consent 保活: 失败 → 20 秒后 PEER_CONNECTION_DISCONNECTED
```

**根因：** `livekit/livekit-server:v1.8`（protocol 15）的 ICE consent 机制与 `livekit-client:2.18.8`（protocol 16）不兼容。连接能建立但无法维持。

**次要因素：** Docker 仅映射单个 UDP 端口 `7882→7882`，`livekit.yaml` 中 RTC 端口范围也是 `7882-7882`。ICE 只有一个候选端口，缺乏冗余。

### 问题 2：Egress 录制返回 503

**LiveKit 服务器日志证据：**
```
API Egress.StartRoomCompositeEgress → "error": "no response from servers", "status": 503
```

**根因：** `livekit-server:v1.8` 与 `egress:v1.8` 之间的 psrpc 通信超时（21 秒无响应）。两个服务都通过 Redis 通信，但 psrpc 内部 RPC 调用失败。

### 问题 3：摄像头/麦克风多重占用

三个组件各自调用 `getUserMedia`：

| 组件 | 请求设备 | 用途 |
|------|----------|------|
| `useSpeechRecognition` | `{audio: true}` | PCM 录音 + ASR |
| `useVideoAnalysis` | `{video: {facingMode: "user"}}` | MediaPipe 面部分析 |
| `LiveKitRoom` | `audio + video` props | WebRTC 发布 |

### 问题 4：GridLayout 崩溃

```
Error: Element not part of the array:
candidate-赵六_camera_placeholder not in candidate-赵六_camera_TR_VCJQDMFmTKcTZN
```

Track 断开后 `withPlaceholder: true` 创建的占位元素与 GridLayout 内部数组不同步。

---

## 修复任务

### Task 1: 升级 LiveKit 和 Egress 镜像版本 + 扩展 RTC 端口

**文件：**
- Modify: `docker-compose.yml:43,48-50,68`
- Modify: `livekit.yaml:3-6`

**原因：** 服务器 v1.8 的 ICE consent 机制与客户端 SDK 2.18.8 不兼容，导致连接 20 秒后断开。Egress v1.8 与服务器 psrpc 通信也失败。升级到 v1.9+ 同时修复两个问题。

- [ ] **Step 1: 升级 docker-compose.yml 镜像版本**

```yaml
# docker-compose.yml line 43: 升级 LiveKit 服务器
    image: livekit/livekit-server:v1.9

# docker-compose.yml line 68: 升级 Egress
    image: livekit/egress:v1.9
```

- [ ] **Step 2: 扩展端口映射**

将单端口 UDP 映射扩展为端口范围：

```yaml
# docker-compose.yml livekit ports 部分 (lines 48-50)，替换为：
    ports:
      - "${LIVEKIT_PORT:-7880}:7880"
      - "7882-7888:7882-7888"
      - "7882-7888:7882-7888/udp"
```

- [ ] **Step 3: 扩展 livekit.yaml 的 RTC 端口范围**

```yaml
# livekit.yaml
port: 7880
rtc:
  port_range_start: 7882
  port_range_end: 7888      # 从 7882 扩展到 7888
  use_external_ip: false
  node_ip: 127.0.0.1
keys:
  devkey: devsecret
```

- [ ] **Step 4: 重新部署并验证**

```bash
# 重新创建 LiveKit 和 Egress 容器
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate livekit egress

# 检查版本
docker logs hci-ai-interview-assistant-livekit-1 2>&1 | head -5
```

预期：LiveKit 日志显示新版本号，不再出现 `PEER_CONNECTION_DISCONNECTED`。

- [ ] **Step 5: 验证 WebRTC 连接稳定**

打开面试页面，浏览器控制台检查：
- 预期：`connection state: connected` 且持续保持（不出现 disconnected）
- 预期：摄像头画面持续显示，不消失
- 预期：`connected to Livekit Server` 显示 protocol ≥ 16

- [ ] **Step 6: 验证 Egress 录制**

```bash
# 进入面试后触发录制，检查 Egress 日志
docker logs hci-ai-interview-assistant-egress-1 --tail=20
```

预期：不再出现 `no response from servers`。

- [ ] **Step 7: 提交**

```bash
git add docker-compose.yml livekit.yaml
git commit -m "fix: upgrade LiveKit to v1.9 and expand RTC port range to fix ICE consent failure"
```

---

### Task 2: 修复摄像头/麦克风多重占用

**文件：**
- Modify: `frontend/src/pages/InterviewPage/index.tsx:30-43,131-143`
- Modify: `frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts:167-183`
- Modify: `frontend/src/pages/InterviewPage/hooks/useSpeechRecognition.ts:123-135`

**原因：** 三个组件各自调用 `getUserMedia` 争抢同一摄像头/麦克风。统一由 `InterviewPage` 获取共享流，分发给子模块。

- [ ] **Step 1: 在 InterviewPage 中新增共享媒体流管理**

在 `InterviewPage/index.tsx` 中添加：

```tsx
// 在组件顶部，其他 hooks 之前添加
const [sharedStream, setSharedStream] = useState<MediaStream | null>(null);
const [streamError, setStreamError] = useState<string>("");

useEffect(() => {
  if (!session?.enableVideoObservation) return;
  
  let cancelled = false;
  void (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      if (cancelled) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      setSharedStream(stream);
    } catch (error) {
      if (!cancelled) {
        setStreamError(error instanceof Error ? error.message : "无法访问摄像头/麦克风");
      }
    }
  })();
  
  return () => {
    cancelled = true;
    setSharedStream((prev) => {
      prev?.getTracks().forEach(t => t.stop());
      return null;
    });
  };
}, [session?.id, session?.enableVideoObservation]);
```

- [ ] **Step 2: 修改 useVideoAnalysis 接受外部流**

`useVideoAnalysis` 新增 `sharedStream` 参数，`startVideoObservation` 使用外部流而非自行调用 `getUserMedia`：

```ts
// useVideoAnalysis.ts — 修改函数签名
export function useVideoAnalysis(
  sessionId: string | undefined,
  session: InterviewSession | null,
  onSessionUpdate: (updated: InterviewSession) => void,
  recordingStartTimeRef: React.RefObject<number | null>,
  sharedStream: MediaStream | null  // 新增参数
): VideoAnalysisHandle {

  // startVideoObservation 中，替换 getUserMedia 调用：
  // 原代码 (line 176):
  //   const stream = await navigator.mediaDevices.getUserMedia({...});
  // 改为:
  const startVideoObservation = useCallback(async () => {
    // ...
    if (!sharedStream) {
      setVideoObservationStatus("等待摄像头流");
      return;
    }
    const videoTrack = sharedStream.getVideoTracks()[0];
    if (!videoTrack) {
      setVideoObservationStatus("未检测到摄像头");
      return;
    }
    const stream = new MediaStream([videoTrack]);
    analysisStreamRef.current = stream;
    // ... 后续逻辑不变
  }, [sharedStream, /* 其他依赖 */]);
```

- [ ] **Step 3: 修改 useSpeechRecognition 接受外部流**

```ts
// useSpeechRecognition.ts — 修改 startMediaStreamAndAsr
const startMediaStreamAndAsr = useCallback(async (externalStream?: MediaStream) => {
  // ...
  let stream: MediaStream;
  
  if (externalStream) {
    const audioTrack = externalStream.getAudioTracks()[0];
    if (!audioTrack) {
      setAudioChunkStatus("未检测到麦克风");
      return;
    }
    stream = new MediaStream([audioTrack]);
  } else {
    // 降级：LiveKit 不可用时独立获取音频
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setAudioChunkStatus(error instanceof Error ? error.message : "麦克风不可用");
      return;
    }
  }
  mediaStreamRef.current = stream;
  // ... 后续逻辑不变
}, [enqueueSpeechChunkUpload, startAsrWithFallback]);
```

- [ ] **Step 4: 更新 InterviewPage 中的 hook 调用和 handleStartCandidateAnswer**

```tsx
// 传入共享流
const video = useVideoAnalysis(sessionId, session, updateSession, 
  recorder.recordingStartTimeRef, sharedStream);

// handleStartCandidateAnswer 传入共享流
async function handleStartCandidateAnswer() {
  if (!session?.currentQuestion || answerStartedAt !== null) return;
  startAnswer();
  await speech.startMediaStreamAndAsr(sharedStream ?? undefined);
  if (!recorder.isRecording) {
    recorder.startRecording(video.analysisStreamRef.current, video.analysisCanvasRef.current);
    startEgressRecording(session.id).catch(() => {});
  }
}
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/InterviewPage/index.tsx \
        frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts \
        frontend/src/pages/InterviewPage/hooks/useSpeechRecognition.ts
git commit -m "fix: unify media stream acquisition to prevent camera/mic conflicts"
```

---

### Task 3: 修复 GridLayout 崩溃 + 断开连接降级 UI

**文件：**
- Modify: `frontend/src/pages/InterviewPage/components/CandidateVideo.tsx`
- Create: `frontend/src/pages/InterviewPage/components/CandidateVideo.css`

**原因：** Track 断开后 `withPlaceholder: true` 导致 GridLayout 内部数组与 DOM 不同步。需要关闭 placeholder 并添加连接状态感知。

- [ ] **Step 1: 重写 CandidateVideo 组件**

```tsx
import { memo, useState, useCallback } from "react";
import { UserOutlined, DisconnectOutlined } from "@ant-design/icons";
import { 
  LiveKitRoom, ControlBar, GridLayout, ParticipantTile, 
  RoomAudioRenderer, useTracks, useConnectionState 
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import "./CandidateVideo.css";

interface CandidateVideoProps {
  liveKit: { url: string; token: string; room: string } | null;
  meetingError: string;
}

export const CandidateVideo = memo(function CandidateVideo({ 
  liveKit, meetingError 
}: CandidateVideoProps) {
  if (!liveKit) {
    return (
      <div className="candidate-video-tile">
        <div className="video-placeholder">
          <UserOutlined />
          <p>{meetingError || "会议服务未配置"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="candidate-video-tile">
      <LiveKitRoom 
        token={liveKit.token} 
        serverUrl={liveKit.url} 
        connect 
        audio 
        video
        onDisconnected={() => console.warn("[HCI:livekit] 连接已断开")}
      >
        <CandidateLiveKitConference />
      </LiveKitRoom>
    </div>
  );
});

function CandidateLiveKitConference() {
  const [connectionError, setConnectionError] = useState<string>("");
  
  // 监听连接状态变化
  useConnectionState((state: string) => {
    if (state === "disconnected") {
      setConnectionError("视频连接已断开，请刷新页面重试");
    } else if (state === "connected") {
      setConnectionError("");
    }
  });

  // 关键修复：withPlaceholder: false 避免 GridLayout 崩溃
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
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

- [ ] **Step 2: 创建 CSS 样式文件**

```css
/* CandidateVideo.css */
.candidate-video-tile {
  aspect-ratio: 4 / 3;
  background: var(--color-bg-container, #141414);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.candidate-livekit-room {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.candidate-video-grid {
  flex: 1;
  min-height: 0;
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

.video-error {
  color: var(--color-error, #ff4d4f);
}

.video-error .anticon {
  font-size: 48px;
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/InterviewPage/components/CandidateVideo.tsx \
        frontend/src/pages/InterviewPage/components/CandidateVideo.css
git commit -m "fix: handle LiveKit disconnect gracefully and fix GridLayout crash"
```

---

### Task 4: 修复 Egress 降级日志

**文件：**
- Modify: `backend/interview/api.py`（录制端点）
- Modify: `frontend/src/pages/InterviewPage/index.tsx:138-142`

**原因：** Egress 不可用时后端返回 503，前端虽然静默降级但无足够日志帮助排查。

- [ ] **Step 1: 后端改进录制启动端点的错误响应**

```python
# api.py — POST /recording/start 处理中
try:
    egress_id = start_recording(session.meeting_room)
    session = replace(session, egress_id=egress_id)
    self._session_store.save(session)
    _send_json(self, 200, {"egressId": egress_id, "status": "started"})
except LiveKitConfigError:
    _send_json(self, 503, {
        "error": "livekit_not_configured",
        "message": "LiveKit 未配置，服务端录制不可用"
    })
except EgressError as e:
    log.warning("Egress 启动失败（降级到客户端录制）: %s", e)
    _send_json(self, 503, {
        "error": "egress_unavailable", 
        "message": "录制服务暂不可用，已降级到客户端录制"
    })
```

- [ ] **Step 2: 前端增强降级日志**

```tsx
// InterviewPage/index.tsx handleStartCandidateAnswer 中
startEgressRecording(session.id)
  .then((result) => {
    console.info("[HCI:recording] Egress 服务端录制已启动: %s", result.egressId);
  })
  .catch((error) => {
    console.warn(
      "[HCI:recording] Egress 不可用，使用客户端录制降级: %s",
      error instanceof Error ? error.message : error
    );
  });
```

- [ ] **Step 3: 提交**

```bash
git add backend/interview/api.py frontend/src/pages/InterviewPage/index.tsx
git commit -m "fix: improve egress recording fallback error handling and logging"
```

---

## 验收标准

### 功能验收

| # | 验收项 | 验证方法 |
|---|--------|----------|
| 1 | LiveKit 连接稳定，不会 20 秒后断开 | 控制台无 `PEER_CONNECTION_DISCONNECTED`，连接保持 > 60 秒 |
| 2 | 摄像头画面持续显示 | CandidateVideo tile 始终显示视频画面 |
| 3 | ControlBar 麦克风/摄像头按钮可操作 | 点击按钮状态同步切换 |
| 4 | 视频分析（眨眼、点头、眼神接触）正常工作 | MetricsSidebar 显示实时数据 |
| 5 | ASR 实时字幕正常 | 说话时字幕区域显示文字 |
| 6 | 断连后显示降级 UI，不崩溃 | 停止 livekit 容器后页面不白屏，显示错误提示 |
| 7 | Egress 不可用时静默降级 | 面试正常完成，录制使用客户端 fallback |
| 8 | 无 `Element not part of the array` 错误 | 控制台无此错误 |

### 性能验收

| # | 验收项 | 阈值 |
|---|--------|------|
| 1 | LiveKit 连接建立时间 | < 5 秒 |
| 2 | 视频延迟 | < 500ms |
| 3 | 连接稳定性 | 面试全程不断开（10 分钟以上） |

---

## 测试规范

### 手动测试（必做）

**TC1：连接稳定性测试（最重要）**
1. 打开 `http://127.0.0.1:5173`，进入面试间
2. 确认摄像头画面显示
3. 保持面试页面打开 3 分钟，不做任何操作
4. 预期：摄像头画面始终显示，不消失，控制台无 `PEER_CONNECTION_DISCONNECTED`

**TC2：完整面试流程**
1. 创建新面试 → 进入面试间
2. 确认：摄像头画面可见，麦克风可用，ASR 字幕显示
3. 依次回答 6 道题
4. 确认：面试正常结束，跳转报告页

**TC3：断连恢复**
1. 进入面试间确认连接正常
2. 执行 `docker compose stop livekit`
3. 确认：页面不崩溃，显示"视频连接已断开"
4. 执行 `docker compose start livekit`，刷新页面
5. 确认：连接恢复，摄像头画面恢复

**TC4：摄像头权限拒绝**
1. Chrome 阻止摄像头权限
2. 进入面试间 → 确认显示错误提示，面试可继续（纯文本模式）

### 自动化测试（建议添加）

```tsx
// frontend/src/pages/InterviewPage/components/CandidateVideo.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandidateVideo } from "./CandidateVideo";

describe("CandidateVideo", () => {
  it("shows placeholder when liveKit token is null", () => {
    render(<CandidateVideo liveKit={null} meetingError="" />);
    expect(screen.getByText("会议服务未配置")).toBeDefined();
  });

  it("shows meeting error message when provided", () => {
    render(<CandidateVideo liveKit={null} meetingError="LiveKit 连接失败" />);
    expect(screen.getByText("LiveKit 连接失败")).toBeDefined();
  });
});
```

---

## 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `docker-compose.yml` | 修改 | 镜像升级 v1.8→v1.9，端口范围扩展 |
| `livekit.yaml` | 修改 | RTC 端口范围 7882→7882-7888 |
| `frontend/src/pages/InterviewPage/index.tsx` | 修改 | 统一媒体流管理 + Egress 日志增强 |
| `frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts` | 修改 | 接受外部传入 MediaStream |
| `frontend/src/pages/InterviewPage/hooks/useSpeechRecognition.ts` | 修改 | 接受外部传入音频流 |
| `frontend/src/pages/InterviewPage/components/CandidateVideo.tsx` | 修改 | 连接状态感知 + 降级 UI + 修复 GridLayout |
| `frontend/src/pages/InterviewPage/components/CandidateVideo.css` | 新建 | 视频组件降级样式 |
| `backend/interview/api.py` | 修改 | 录制端点错误信息细化 |
