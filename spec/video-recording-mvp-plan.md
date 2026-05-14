# 视频录制 MVP 实现计划

## 目标

在面试过程中录制候选人摄像头视频，面试结束后可回放查看。

## 方案设计

### 录制参数

| 参数 | 值 | 说明 |
|------|---|------|
| 分辨率 | 320×240 | 原始分析流 640×480 的一半，足够回放确认面试状态 |
| 编码 | VP8（webm） | 浏览器原生支持，无需转码 |
| 比特率 | 200 kbps | 30 分钟 ≈ 45MB |
| 帧率 | 15 fps | 面试场景足够 |
| 音频 | 不录制 | 音频由 pcmRecorder 独立采集，用于实时语音分析（见指标补全计划 P0） |

### 存储方案：Supabase Storage

```
前端 MediaRecorder
  → webm 分片（每 10s 一个 Blob）
  → 面试结束时前端合并为完整 webm
  → 上传至 Supabase Storage bucket: interview-videos
  → 数据库 interview_sessions 表新增 video_path 字段存引用
```

选择前端合并一次性上传而非分片上传，理由：
- MVP 阶段文件约 50MB，浏览器内存可承受
- 避免引入分片上传 + 后端合并的复杂度
- 后续可升级为 Multipart Upload

### 访问控制

- Storage bucket 设为私有
- 通过 Supabase RLS + 签名 URL 控制访问：recruiter 可看，candidate 默认不可见
- MVP 阶段可先简化：bucket 公开读 + RLS 策略，后续再加签名 URL

## 实现步骤

### 第 1 步：Supabase Storage 初始化

- 创建 `interview-videos` bucket（私有）
- 设置 RLS 策略：recruiter（session 创建者）可读写，其他人不可访问
- 文件路径格式：`{user_id}/{session_id}.webm`

### 第 2 步：数据库迁移

`interview_sessions` 表新增：

```sql
ALTER TABLE interview_sessions
  ADD COLUMN video_path TEXT,
  ADD COLUMN video_duration_sec FLOAT;
```

同步更新：
- `backend/interview/session.py` 的 `InterviewSession` dataclass 新增对应字段
- `backend/database/session_repo.py` 的序列化/反序列化逻辑
- `frontend/src/interviewFlow.ts` 的类型定义

### 第 3 步：前端录制逻辑（InterviewPage）

在 `frontend/src/pages/InterviewPage/index.tsx` 中：

1. **开始录制**：在 `getUserMedia` 获取摄像头流后，创建独立低分辨率流用于录制
   ```ts
   // 从现有摄像头流中创建低分辨率流
   const recordingStream = cameraStream.clone();
   // 或用 canvas 以 320x240 重新采集，降低分辨率
   ```
   实际推荐用 Canvas 方案：将现有分析 canvas 以 320×240 尺寸 captureStream(15)，这样不额外占用摄像头设备

2. **MediaRecorder 录制**：
   - `new MediaRecorder(recordingStream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 200000 })`
   - 不录制音频（`audio: false`），音频由 pcmRecorder 独立采集用于实时语音分析，避免重复捕获
   - `timeslice: 10000`（每 10s 触发 ondataavailable）
   - 收集所有 Blob 分片到数组

3. **面试结束时**：
   - `mediaRecorder.stop()`
   - 合并所有分片：`new Blob(chunks, { type: 'video/webm' })`
   - 计算录制时长
   - 上传（见第 4 步）

### 第 4 步：前端上传逻辑

新增 `frontend/src/apiClient.ts` 函数：

```ts
async function uploadInterviewVideo(sessionId: string, videoBlob: Blob): Promise<{ videoPath: string }>
```

两种上传路径（选一种）：

**方案 A：通过后端代理上传（推荐 MVP）**
```
前端 → POST /api/sessions/{id}/video (multipart/form-data) → 后端 → Supabase Storage → 返回 video_path
```
- 优势：后端控制权限，前端不需要 Supabase Storage 客户端
- 后端新增端点接收文件，用 service_role key 上传到 Storage

**方案 B：前端直传 Supabase Storage**
```
前端 → supabase.storage.from('interview-videos').upload() → 返回路径 → POST /api/sessions/{id}/video-path
```
- 优势：不经过后端转发，大文件更友好
- 劣势：前端需要 Supabase Storage 客户端和权限配置

**MVP 选方案 A**，实现简单，50MB 文件后端可承受。

### 第 5 步：后端上传端点

`backend/interview/api.py` 新增：

- `POST /api/sessions/{id}/video`：接收 multipart/form-data 中的 webm 文件
  - 验证 session 存在且属于当前用户
  - 上传到 Supabase Storage：`interview-videos/{user_id}/{session_id}.webm`
  - 更新 session 的 `video_path` 和 `video_duration_sec`
  - 返回 video_path

- `GET /api/sessions/{id}/video`：返回视频的签名 URL（或公开 URL）
  - 验证权限后生成 Supabase Storage 签名 URL
  - 前端用此 URL 播放视频

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

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `backend/database/migrations/00X_add_video_columns.sql` | 新增 video_path、video_duration_sec 列 |
| `backend/interview/session.py` | InterviewSession 新增字段；KeyframeRecord 移除 data_url，新增 video_timestamp_sec |
| `backend/interview/api.py` | 新增视频上传/下载端点；关键帧端点改为接收 timestamp |
| `backend/database/session_repo.py` | 序列化/反序列化新字段 |
| `frontend/src/interviewFlow.ts` | 类型定义新增字段；KeyframeRecord 类型同步修改 |
| `frontend/src/pages/InterviewPage/index.tsx` | MediaRecorder 录制 + 上传逻辑；关键帧改为发送 timestamp |
| `frontend/src/apiClient.ts` | 新增 uploadInterviewVideo、fetchVideoUrl |
| `frontend/src/pages/ReportPage/index.tsx` | 视频播放器；关键帧改为视频跳转 |
| `frontend/src/videoAnalyzer.ts` | classifyVideoEvent 返回中不再包含 dataUrl |
| `frontend/src/config.ts` | 可能新增配置项 |

### 第 8 步：关键帧改为视频时间戳引用

视频录制上线后，关键帧不再需要存储 base64 JPEG 截图——任何时刻的画面都可以从视频中截取。

1. **前端**：`InterviewPage` 中捕获关键帧时，改为只发送 `video_timestamp_sec`（相对于录制开始的秒数）+ `reason`，不再调用 `canvas.toDataURL()`
2. **后端**：`KeyframeRecord` 结构移除 `data_url` 字段，新增 `video_timestamp_sec: float | None`
3. **报告页**：关键帧展示改为在视频播放器中跳转到对应时间点（点击关键帧条目 → `<video>.currentTime = timestamp`），替代 `<img>` 缩略图
4. **数据库**：`keyframes` JSONB 列中不再存储 base64 数据，体积大幅缩小

> 注意：数据库将清空，无需做旧数据迁移。

**影响范围**：`frontend/src/pages/InterviewPage/index.tsx`、`frontend/src/interviewFlow.ts`、`frontend/src/pages/ReportPage/index.tsx`、`backend/interview/session.py`、`backend/interview/api.py`

## 不做的事（MVP 范围外）

- 分片实时上传（断连恢复）
- 后端 ffmpeg 转码/压缩
- 视频与问答时间线的联动定位
- 候选人端视频回放权限
- 录制过程实时预览
- 从 webm 中提取音频替代 pcmRecorder（当前 pcmRecorder 负责实时语音分析，MVP 保持独立；后续可考虑统一，但需解决实时性要求）
