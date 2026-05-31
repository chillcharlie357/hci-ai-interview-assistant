# 视频录制 MVP 实现计划

## 目标

在面试过程中录制候选人摄像头视频，面试结束后可回放查看。

## 方案设计

### 录制参数

| 参数 | 值 | 说明 |
|------|---|------|
| 分辨率 | 320×240 | 原始分析流 640×480 的一半，足够回放确认面试状态 |
| 编码 | VP8（webm） | 浏览器原生支持，无需转码 |
| 比特率 | 200 kbps（视频） | 浏览器实际码率可能上浮 30-50%，30 分钟约 45-70MB |
| 帧率 | 15 fps | 面试场景足够 |
| 音频 | 录制 | 包含音频轨道（~32kbps Opus），确保回放时可听；实时语音分析仍由 pcmRecorder 独立采集 |

### 存储方案：Supabase Storage

```
前端 MediaRecorder
  → webm 分片（每 10s 一个 Blob）
  → 面试结束时前端合并为完整 webm
  → POST raw binary body 至后端
  → 后端上传至 Supabase Storage bucket: interview-videos
  → 数据库 interview_sessions 表新增 video_path 字段存引用
```

选择前端合并一次性上传而非分片上传，理由：
- MVP 阶段文件约 80MB（含音频 + 码率浮动），浏览器内存可承受
- 避免引入分片上传 + 后端合并的复杂度
- 后续可升级为 Multipart Upload

### 上传方案：Raw Binary Body

前端直接将 Blob 作为请求体发送，Content-Type 设为 `video/webm`，无需 multipart/form-data 编码：

```ts
// 前端
fetch(`/api/sessions/${id}/video`, {
  method: 'POST',
  body: videoBlob,
  headers: { 'Content-Type': 'video/webm' },
})
```

```python
# 后端
content_length = int(self.headers['Content-Length'])
video_bytes = self.rfile.read(content_length)
# → 上传到 Supabase Storage
```

选择此方案而非 multipart/form-data 的理由：
- 单文件上传，无需表单混合字段，raw body 最简单
- 零新依赖（python-multipart 等需与 stdlib HTTP 服务器写胶水代码）
- 前后端实现均为最简路径

### 上传大小限制

后端设置 200MB 安全上限，防止异常请求导致 OOM：

```python
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200MB
content_length = int(self.headers.get('Content-Length', 0))
if content_length > MAX_VIDEO_SIZE:
    self.send_error(413, "Video too large")
    return
```

Vite dev proxy 需配置 body size 限制，否则开发环境上传会被 proxy 拦截。

### 访问控制

- Storage bucket 设为私有
- 通过 Supabase RLS + 签名 URL 控制访问：recruiter 可看，candidate 默认不可见
- MVP 阶段可先简化：bucket 公开读 + RLS 策略，后续再加签名 URL

## 实现步骤

### 第 1 步：Supabase Storage 初始化

- 创建 `interview-videos` bucket（私有）
- 设置 RLS 策略：recruiter（session 创建者）可读写，其他人不可访问
- 文件路径格式：`{user_id}/{session_id}.webm`

#### 操作步骤

1. **创建 Bucket**：Supabase Dashboard → Storage → New bucket → 名称填 `interview-videos`，勾选 **Private**，点击 Create

2. **设置读取策略**：进入 `interview-videos` → Policies → New Policy
   - Policy name: `recruiter_read_own`
   - Allowed operation: 勾选 **Select**
   - Target roles: `authenticated`
   - USING expression:
     ```sql
     auth.uid()::text = (storage.foldername(name))[1]
     ```
   含义：文件路径格式为 `{user_id}/{session_id}.webm`，`storage.foldername(name)[1]` 取第一级目录即 `user_id`，只有登录用户 uid 匹配时才可读取

3. **写入策略**：无需单独配置，后端使用 `service_role` key 调用 Storage API，自动绕过 RLS 全权操作

> **MVP 简化**：如果暂时不需要前端直连 Storage，RLS 读取策略也可以后续再加。签名 URL 由后端通过 `service_role` 生成，不受 RLS 限制。

### 第 2 步：数据库迁移

`interview_sessions` 表新增：

```sql
ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS video_path TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_sec FLOAT;
```

#### 操作步骤

在 Supabase Dashboard → SQL Editor 中执行上述 SQL，或直接运行 `backend/database/migrations/005_add_video_columns.sql`。

同步更新：
- `backend/interview/session.py` 的 `InterviewSession` dataclass 新增对应字段
- `backend/database/session_repo.py` 的序列化/反序列化逻辑
- `frontend/src/interviewFlow.ts` 的类型定义

### 第 3 步：前端录制逻辑

新建 `frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts`，独立封装录制逻辑，不塞入现有 hooks。

#### 录制启动时序

录制必须与面试流程同步启动——在候选人点击"开始回答"第一个问题时调用 `mediaRecorder.start()`，确保关键帧时间戳有可靠基准。如果录制晚于面试开始，或中途重连导致录制重启，关键帧的 `video_timestamp_sec` 将与视频时间轴错位。

#### 录制实现

1. **创建低分辨率录制流**：将现有分析 canvas 以 320×240 尺寸 `captureStream(15)`，不额外占用摄像头设备
2. **添加音频轨道**：从 `getUserMedia` 获得的原始摄像头流中提取音频轨道，加入录制流：
   ```ts
   const canvasStream = canvas.captureStream(15);
   const audioTrack = cameraStream.getAudioTracks()[0];
   if (audioTrack) canvasStream.addTrack(audioTrack);
   ```
3. **MediaRecorder 录制**：
   - `new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 200000 })`
   - `timeslice: 10000`（每 10s 触发 ondataavailable）
   - 收集所有 Blob 分片到数组

4. **面试结束时**：
   - `mediaRecorder.stop()`
   - 合并所有分片：`new Blob(chunks, { type: 'video/webm' })`
   - 计算录制时长
   - 上传（见第 4 步）

### 第 4 步：前端上传逻辑

新增 `frontend/src/apiClient.ts` 函数：

```ts
async function uploadInterviewVideo(sessionId: string, videoBlob: Blob): Promise<{ videoPath: string }>
```

上传路径：

```
前端 → POST /api/sessions/{id}/video (raw binary, Content-Type: video/webm) → 后端 → Supabase Storage → 返回 video_path
```

后端控制权限，前端不需要 Supabase Storage 客户端。

上传失败时重试 1 次，仍失败则在 session 中标记 `video_upload_failed: true`，面试仍正常结束。

### 第 5 步：后端上传/下载端点

`backend/interview/api.py` 新增：

- `POST /api/sessions/{id}/video`：接收 raw binary body（Content-Type: video/webm）
  - 检查 Content-Length ≤ 200MB，超限返回 413
  - 验证 session 存在且属于当前用户
  - 读取 `self.rfile.read(content_length)` 获取视频字节
  - 上传到 Supabase Storage：`interview-videos/{user_id}/{session_id}.webm`
  - 更新 session 的 `video_path` 和 `video_duration_sec`
  - 返回 video_path

- `GET /api/sessions/{id}/video`：返回视频的签名 URL（或公开 URL）
  - 验证权限后生成 Supabase Storage 签名 URL
  - 前端用此 URL 播放视频

`backend/auth/supabase_client.py` 新增：
- `upload_video(user_id, session_id, video_bytes)` — 上传至 Storage
- `get_video_signed_url(user_id, session_id)` — 生成签名 URL

### 第 6 步：报告页视频回放

`frontend/src/pages/ReportPage/index.tsx` 中：

1. 调用 `GET /api/sessions/{id}/video` 获取视频 URL
2. 在"面试关键情绪捕获"区域上方或下方，新增 `<video>` 播放器：
   ```tsx
   <video src={videoUrl} controls width="100%" style={{ maxHeight: 360 }} />
   ```
3. 如果无录制视频（旧数据兼容），不显示播放器

### 第 7 步：清理与兜底

- 录制失败（浏览器不支持 MediaRecorder、用户拒绝摄像头）时静默降级，不影响面试流程
- 上传失败时重试 1 次，仍失败则在 session 中标记 `video_upload_failed: true`，面试仍正常结束
- 面试中途断开连接：已收集的分片丢失，这是 MVP 可接受的；后续可改为分片实时上传

### 第 8 步：关键帧改为视频时间戳引用

视频录制上线后，关键帧不再需要存储 base64 JPEG 截图——任何时刻的画面都可以从视频中截取。

1. **前端**：`useVideoRecorder.ts` 中捕获关键帧时，改为只发送 `video_timestamp_sec`（相对于 `mediaRecorder.start()` 的秒数）+ `reason`，不再调用 `canvas.toDataURL()`
2. **后端**：`KeyframeRecord` 结构移除 `data_url` 字段，新增 `video_timestamp_sec: float | None`
3. **报告页**：关键帧展示改为在视频播放器中跳转到对应时间点（点击关键帧条目 → `<video>.currentTime = timestamp`），替代 `<img>` 缩略图
4. **数据库**：`keyframes` JSONB 列中不再存储 base64 数据，体积大幅缩小

> **已知取舍**：此变更与录制启动时序强绑定（见第3步），且已有 session 中的 base64 关键帧数据将不可用。MVP 阶段数据量少，旧 session 的关键帧丢失可接受；后续如需兼容可做数据迁移（从旧 base64 关键帧提取缩略图或标记为无视频引用）。

**影响范围**：`useVideoRecorder.ts`、`useVideoAnalysis.ts`、`frontend/src/interviewFlow.ts`、`frontend/src/pages/ReportPage/`、`backend/interview/session.py`、`backend/interview/api.py`

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `backend/database/migrations/00X_add_video_columns.sql` | 新增 video_path、video_duration_sec 列 |
| `backend/interview/session.py` | InterviewSession 新增字段；KeyframeRecord 移除 data_url，新增 video_timestamp_sec |
| `backend/interview/api.py` | 新增视频上传/下载端点（raw binary body）；关键帧端点改为接收 timestamp |
| `backend/database/session_repo.py` | 序列化/反序列化新字段 |
| `backend/auth/supabase_client.py` | 新增 Storage 操作（upload_video、get_video_signed_url） |
| `frontend/src/interviewFlow.ts` | 类型定义新增字段；KeyframeRecord 类型同步修改 |
| `frontend/src/pages/InterviewPage/hooks/useVideoRecorder.ts` | **新建** — MediaRecorder 录制 + 上传逻辑；关键帧改为发送 timestamp |
| `frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts` | 关键帧捕获逻辑移除 dataUrl 生成，改为返回 video_timestamp_sec |
| `frontend/src/pages/InterviewPage/index.tsx` | 引入 useVideoRecorder hook，关联录制启动与面试流程 |
| `frontend/src/apiClient.ts` | 新增 uploadInterviewVideo、fetchVideoUrl |
| `frontend/src/pages/ReportPage/` | 视频播放器；关键帧改为视频跳转 |
| `frontend/src/videoAnalyzer.ts` | classifyVideoEvent 返回中不再包含 dataUrl |
| `frontend/vite.config.ts` | dev proxy 配置 body size 限制 |
| `frontend/src/config.ts` | 可能新增配置项 |

## 不做的事（MVP 范围外）

- 分片实时上传（断连恢复）
- 后端 ffmpeg 转码/压缩
- 视频与问答时间线的联动定位
- 候选人端视频回放权限
- 录制过程实时预览
- 从 webm 中提取音频替代 pcmRecorder（当前 pcmRecorder 负责实时语音分析，MVP 保持独立；后续可考虑统一，但需解决实时性要求）
