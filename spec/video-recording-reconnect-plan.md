# 视频录制断连恢复方案（LiveKit Egress）

## 背景

当前视频录制存在以下问题：

1. **录制分片仅存内存**：`chunksRef` 是 React 组件内存，组件卸载（用户离开页面）后已收集分片全部丢失
2. **重进面试从零开始**：`startRecording` 会清空 `chunksRef`，不会恢复之前的录制
3. **只有最后一题才上传**：中途退出不会触发任何上传
4. **关键帧时间戳错位**：重新录制后 `recordingStartTimeRef` 重置，关键帧的 `videoTimestampSec` 无法对应到正确的视频段

实际影响：候选人中途离开再回来，之前的录制全部丢失，只保留回来后重新录制的那一段。

## 核心策略

**用 LiveKit Egress 服务端录制替代客户端 MediaRecorder**。

候选人的摄像头/麦克风流已经在推到 LiveKit 服务器。Egress 在服务端对这条流做录制，客户端断连/崩溃/刷新都不影响录制——房间仍在，录制继续。

视频分析（canvas 指标、关键帧）仍在前端，不受影响。Egress 只替代 `MediaRecorder + Blob 上传` 这条路径。

> **为什么选择服务端录制而非客户端断连恢复？**
> - 候选人视频流已在 LiveKit 服务器上，录制在服务端进行是最自然的方案
> - 断连/崩溃/刷新对服务端录制零影响，不需要 IndexedDB 持久化、多段合并、ffmpeg
> - 原方案需要 ~350 行新增代码（IndexedDB 读写 + 恢复逻辑 + ffmpeg 合并 + 时间戳偏移），Egress 方案仅需 ~80 行新增 + ~60 行删除
> - LiveKit 未配置时保留客户端录制作为 fallback，零风险

### 架构对比

```
原方案（客户端录制 + 断连恢复）:
  摄像头 → getUserMedia → canvas(分析) → MediaRecorder → chunksRef(内存) → Blob → 上传
  摄像头 → getUserMedia → LiveKit SDK → LiveKit 服务器（只做转发，没录制）
  断连后: IndexedDB 恢复 → 多段录制 → ffmpeg 合并 → 时间戳偏移

Egress 方案（服务端录制）:
  摄像头 → getUserMedia → canvas(分析) → 视频分析指标（照常）
  摄像头 → getUserMedia → LiveKit SDK → LiveKit 服务器 → Egress 录制 → 文件存储
  断连后: 无需恢复，录制从未中断
```

### 断连场景对比

| 场景 | 原方案 | Egress 方案 |
|------|--------|-------------|
| 候选人刷新页面 | 需从 IndexedDB 恢复 + 重新录制 | 房间仍在，录制继续 |
| 候选人网络断开 | 分片在 IndexedDB，重进后上传 | 房间仍在，录制继续 |
| 浏览器崩溃 | 无法捕获，依赖 IndexedDB 数据 | 录制在服务端，无数据丢失 |
| 页面关闭 | pagehide 写 IndexedDB，重进恢复 | 录制在服务端，无数据丢失 |

## 影响范围

| 模块 | 变更类型 | 说明 |
|------|----------|------|
| `backend/interview/egress.py` | 新增 | Egress 录制控制（启动/停止） |
| `backend/interview/session.py` | 修改 | InterviewSession 新增 `egress_id` 字段 |
| `backend/interview/api.py` | 修改 | 新增 `/recording/start` 和 `/recording/stop` 路由 |
| `backend/interview/livekit_token.py` | 修改 | 迁移到 LiveKit SDK 的 AccessToken |
| `frontend/src/apiClient.ts` | 修改 | 新增 `startRecording` / `stopRecording` 函数 |
| `frontend/.../hooks/useVideoRecorder.ts` | 修改 | Egress 优先 + 客户端 fallback |
| `frontend/.../InterviewPage/index.tsx` | 修改 | 调用 Egress 启动 API |
| `frontend/src/interviewFlow.ts` | 修改 | InterviewSession 类型新增 `egressId` |
| `pyproject.toml` | 修改 | 新增 `livekit` 依赖 |
| `docker-compose.yml` | 修改 | 新增 `livekit` + `egress` 服务 |
| `livekit.yaml` | 新增 | LiveKit 服务器配置 |
| `egress.yaml` | 新增 | Egress 录制服务配置 |

**不需要改动的模块**（相比原方案完全省去）：

- `useVideoStorage.ts` — 不需要 IndexedDB 持久化层
- `video_merge.py` — 不需要 ffmpeg 合并逻辑
- `Dockerfile.backend` — 不需要安装 ffmpeg
- `KeyframeRecord` — 不需要 `segmentIndex`，单段录制无需时间戳偏移
- `interviewFlow.ts` 中的关键帧类型 — 无变更
- `KeyframesGallery.tsx` — 播放器/跳转逻辑零改动
- `session_repo.py` — 序列化/反序列化不变（仅新增一个有默认值的字段）
- 无新增数据库迁移

**删除/简化的代码**：

- `useVideoRecorder.ts` 中的 IndexedDB 恢复逻辑 — 不需要
- 多段录制状态管理 — 不需要
- ffmpeg 合并端点 — 不需要
- `pagehide` 事件处理 — 不需要（录制在服务端）
- 时间戳偏移计算 — 不需要（单段录制）

## 实现步骤

### 第 1 步：安装 LiveKit SDK + 迁移 token 生成

安装 `livekit` Python 包，用 SDK 的 `AccessToken` 替代手搓 JWT。

变更：
- `pyproject.toml` 新增 `livekit` 依赖
- `backend/interview/livekit_token.py` 用 `livekit.api.AccessToken` + `VideoGrants` 重写

返回格式 `{ url, token, room }` 不变，前端零改动。

### 第 2 步：新建 Egress 录制控制模块

新建 `backend/interview/egress.py`，封装：

- `start_recording(room_name) -> egress_id` — 启动 RoomComposite 录制
  - 输出为 webm（vp8+opus），320x240 15fps 200kbps，与原客户端录制参数一致
  - 输出路径：`/out/{room_name}.webm`
- `stop_recording(egress_id) -> {file_path, duration_sec}` — 停止录制并返回文件信息
- `EgressError` — 录制操作失败异常

### 第 3 步：InterviewSession 新增 `egress_id` 字段

在 `InterviewSession` dataclass 中新增：

```python
egress_id: str | None = None  # LiveKit Egress 录制 ID
```

有默认值 `None`，不影响现有代码和序列化。

### 第 4 步：后端新增录制 API 端点

新增两个端点：

**`POST /api/sessions/{id}/recording/start`**

- 调用 `start_recording(session.meeting_room)`
- 将返回的 `egress_id` 存入 session 并持久化
- LiveKit 未配置时返回 503 + `livekit_not_configured`

**`POST /api/sessions/{id}/recording/stop`**

- 调用 `stop_recording(session.egress_id)`
- 将 Egress 本地文件上传到 Supabase Storage（`transfer_egress_file`）
- 更新 session 的 `video_path`、`video_duration_sec`、清除 `egress_id`
- 无进行中录制时返回 400 + `no_active_recording`

### 第 5 步：前端类型和 API 对齐

- `interviewFlow.ts`：`InterviewSession` 新增 `egressId?: string | null`
- `apiClient.ts`：新增 `startRecording(sessionId)` 和 `stopRecording(sessionId)` 函数
- `mapApiSession`：映射 `egress_id` → `egressId`

### 第 6 步：改造 useVideoRecorder — Egress 优先 + 客户端 fallback

改造策略：

1. **启动录制时**：
   - 先异步调用 Egress `startRecording`（不阻塞面试流程）
   - 同时启动客户端 MediaRecorder 作为 fallback（与当前逻辑相同）
   - `recordingStartTimeRef` 仍然设置，供视频分析使用

2. **停止录制时**：
   - 优先调用 Egress `stopRecording` 获取服务端录制结果
   - 如果 Egress 成功，使用服务端视频路径和时长
   - 如果 Egress 失败，降级到客户端 Blob 上传（现有 `uploadInterviewVideo`）

3. **InterviewPage 调用变更**：
   - `handleStartCandidateAnswer` 中新增异步 Egress 启动调用
   - `handleFinishCandidateAnswer` 逻辑不变（仍调用 `recorder.stopAndUpload`）

### 第 7 步：Docker Compose 配置 LiveKit + Egress

新增两个服务容器：

- `livekit` — LiveKit 服务器（`livekit/livekit-server:v1.8`），配置 `livekit.yaml`
- `egress` — Egress 录制服务（`livekit/egress:v1.8`），配置 `egress.yaml`，输出到 Docker 卷 `egress-output`

本地开发默认配置：
- `LIVEKIT_URL=ws://livekit:7880`
- `LIVEKIT_API_KEY=devkey`
- `LIVEKIT_API_SECRET=devsecret`

已有外部 LiveKit 服务的部署不需要启动这两个容器，只需配置环境变量。

### 第 8 步：健康检查 + Egress 状态

在 `GET /api/health` 的 `components` 中新增 `egress` 字段：

```python
"egress": {
    "configured": bool(os.environ.get("LIVEKIT_URL")),
    "description": "服务端视频录制（需要 LiveKit + Egress）",
}
```

## 不做的事（本方案范围外）

- 分片实时上传（Egress 天然在服务端录制，不需要分片上传）
- 多 tab 同时录制检测
- 候选人端视频回放权限
- 浏览器崩溃后自动重进面试页（需要用户手动重新进入，但录制不丢失）
- video_events 的断连缓存与重传（当前逐条上传、失败静默丢弃，不在本方案解决）
- tus 断点续传协议（服务端录制不需要）
- IndexedDB 持久化（服务端录制不需要客户端持久化）
- ffmpeg 多段合并（服务端录制产生单个文件）
- 关键帧时间戳偏移（服务端录制产生单个文件，时间轴连续）

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `pyproject.toml` | 新增 `livekit` 依赖 |
| `backend/interview/livekit_token.py` | 用 SDK AccessToken 替代手搓 JWT |
| `backend/interview/egress.py` | **新建** — Egress 录制控制（启动/停止） |
| `backend/interview/session.py` | InterviewSession 新增 `egress_id` 字段 |
| `backend/interview/api.py` | 新增 `/recording/start` 和 `/recording/stop` 端点；新增 `transfer_egress_file`；健康检查增加 egress |
| `backend/tests/test_egress.py` | **新建** — Egress 模块单元测试 |
| `backend/tests/test_api.py` | 新增录制端点测试 |
| `frontend/src/interviewFlow.ts` | InterviewSession 类型新增 `egressId` |
| `frontend/src/apiClient.ts` | 新增 `startRecording` / `stopRecording` 函数 |
| `frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts` | Egress 优先 + 客户端 fallback |
| `frontend/src/pages/InterviewPage/index.tsx` | 异步调用 Egress 启动 API |
| `docker-compose.yml` | 新增 `livekit` + `egress` 服务 |
| `docker-compose.dev.yml` | backend 环境变量新增 LiveKit 配置 |
| `livekit.yaml` | **新建** — LiveKit 服务器配置 |
| `egress.yaml` | **新建** — Egress 录制服务配置 |

## 详细实施计划

参见 `docs/superpowers/plans/2026-05-17-livekit-egress-recording.md`（9 个 Task，TDD 流程，每步含完整代码和验证命令）。
