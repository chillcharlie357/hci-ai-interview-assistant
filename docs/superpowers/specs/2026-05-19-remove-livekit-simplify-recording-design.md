# 移除 LiveKit，简化视频录制方案

日期：2026-05-19
状态：设计完成

## 目标

1. 移除 LiveKit 全家桶（livekit-server、redis、egress 3 个容器及相关代码）
2. 用纯客户端 MediaRecorder + IndexedDB 断点续录替代当前的双路径录制
3. 保持关键帧时间戳跳转功能
4. 保持 Supabase Storage 视频存储

## 动机

当前录制系统存在两条并行路径（LiveKit Egress 服务端录制 + 客户端 MediaRecorder fallback），架构臃肿：

- 3 个额外 Docker 容器（livekit、redis、egress）
- ~600 行录制相关代码分布在 10+ 个文件
- 复杂的 async/sync 桥接（ThreadPoolExecutor）
- Twirp JSON API 手动调用

而 PRD 明确将"视频会议"列为 P2 后续能力，MVP 不需要 WebRTC SFU。LiveKit 的两个用途都有更简单的替代：

| LiveKit 用途 | 替代方案 |
|-------------|---------|
| 候选人自拍预览（LiveKitRoom） | 本地 `<video>` 元素播放 getUserMedia 流 |
| 服务端录制（Egress） | 客户端 MediaRecorder → IndexedDB → Supabase Storage |

## 架构

### 新架构

```
getUserMedia (640x480)
  ├─ <video> 自拍预览（替代 LiveKitRoom）
  ├─ Canvas 面部分析（useVideoAnalysis，现有逻辑不变）
  │    └─ 关键帧捕获 → videoTimestampSec（累计时长偏移）
  └─ Canvas.captureStream(15fps, 320x240) + audioTrack
       └─ MediaRecorder(vp8+opus, 200kbps)
            └─ ondataavailable (每10s)
                 └─ IndexedDB.saveChunk(sessionId, seq, blob)
```

### 原架构（将被删除）

```
摄像头 → LiveKit SDK → LiveKit 服务器 → Egress → 本地文件 → 后端上传
       ↘ getUserMedia → Canvas → MediaRecorder(备用) → Blob → 上传
```

## IndexedDB 断点续录

### 存储结构

```
Key: sessionId
Value: {
  chunks: [{ seq: number, blob: Blob }],
  accumulatedDuration: number,  // 累计录制时长（秒）
  mimeType: string
}
```

### 生命周期

1. **面试开始**：检查 IndexedDB 是否有存量数据 → 恢复 accumulatedDuration
2. **录制中**：每 10s 触发 ondataavailable → 立即写入 IndexedDB
3. **离开页面**：MediaRecorder.stop() → 最后 chunk 写入 IndexedDB
4. **重新进入**：读取 accumulatedDuration → 关键帧时间戳加上偏移 → 新 chunks 继续追加
5. **面试结束**：合并所有 chunks → 上传 → 成功后清除 IndexedDB

### 存储容量

- 每个 chunk：~250KB（200kbps × 10s）
- 30 分钟面试：~180 chunks ≈ 45MB
- 浏览器 IndexedDB 限制：通常 > 500MB，足够使用

## 关键帧时间戳偏移

断点续录产生多段录制时，关键帧时间戳需要偏移才能在合并后的视频中正确定位。

```
第一次录制:
  accumulatedDuration = 0
  关键帧时间戳 = 0 + (now - recordingStartTime) / 1000
  录制 120s 后离开 → 保存 accumulatedDuration = 120

重新进入:
  accumulatedDuration = 120
  关键帧时间戳 = 120 + (now - recordingStartTime) / 1000

最终合并视频:
  new Blob(allChunks) → 300s 连续视频
  关键帧时间戳已自动偏移 → report 页 video.currentTime 直接可用
```

## 录制参数

| 参数 | 值 | 说明 |
|------|---|------|
| 分辨率 | 320×240 | canvas.captureStream 从分析 canvas 缩放 |
| 编码 | VP8 (webm) | 浏览器原生支持，Blob 可直接拼接 |
| 视频比特率 | 200 kbps | 实际码率可能上浮 30-50% |
| 帧率 | 15 fps | 面试回放足够 |
| 音频 | Opus ~32kbps | 从 getUserMedia 流提取音频轨道 |
| 分片间隔 | 10s | MediaRecorder timeslice |

## WebM 合并

多个 webm 分片可以直接用 `new Blob(chunks, { type: 'video/webm' })` 拼接，无需 ffmpeg。这是 WebM/Matroska 容器格式的特性。

## 上传

```
前端: new Blob(allChunks) → POST /api/sessions/{id}/video
      Content-Type: video/webm
      body: raw binary

后端: 读取 Content-Length（上限 200MB）→ Supabase Storage
      interview-videos/{user_id}/{session_id}.webm
```

## 清理策略

| 时机 | 操作 |
|------|------|
| 上传成功后 | 删除 IndexedDB 中该 session 的所有数据 |
| 上传失败 | 保留 IndexedDB 数据，下次进入可重试 |
| Session 过期/删除 | 后端删除 Supabase Storage 对应文件 |
| 用户手动清理 | 提供清除单个 session 录制数据的 API |

## 删除清单

### 后端

| 文件 | 处理 |
|------|------|
| `backend/interview/egress.py` | 删除 |
| `backend/interview/livekit_token.py` | 删除 |
| `backend/interview/api.py` 中 LiveKit/Egress 路由 | 删除 |
| `backend/interview/api.py` 中 `transfer_egress_file()` | 删除 |
| `backend/interview/api.py` 中 LiveKit/Egress 健康检查 | 删除（`livekit`、`egress` 组件） |
| `backend/interview/session.py` 中 `egress_id` 字段 | 删除 |
| `backend/interview/session.py` 中 `meeting_room` 字段 | 删除 |
| `backend/database/session_repo.py` 中对应序列化 | 删除 |
| `backend/tests/test_egress.py` | 删除 |

### 前端

| 文件 | 处理 |
|------|------|
| `frontend/.../hooks/useLiveKit.ts` | 删除 |
| `frontend/.../liveKitState.ts` | 删除 |
| `frontend/.../liveKitState.test.ts` | 删除 |
| `frontend/.../hooks/useVideoRecorder.ts` | 重写（去 Egress，加 IndexedDB） |
| `frontend/.../components/CandidateVideo.tsx` | 重写（LiveKitRoom → 本地 `<video>`） |
| `frontend/.../components/CandidateVideo.css` | 简化 |
| `frontend/.../index.tsx` | 简化（去 Egress 启动调用） |
| `frontend/src/apiClient.ts` | 删除 LiveKit/Egress 相关函数 |
| `frontend/src/interviewFlow.ts` | 删除 egressId、meetingRoom 类型 |

### 新增

| 文件 | 说明 |
|------|------|
| `frontend/.../hooks/videoStorage.ts` | IndexedDB 持久化层（~80 行） |

### Docker / 配置

| 文件 | 处理 |
|------|------|
| `docker-compose.yml` | 删除 livekit/redis/egress 服务、egress-output 卷 |
| `docker-compose.dev.yml` | 删除 LiveKit 环境变量 |
| `livekit.yaml` | 删除 |
| `egress.yaml` | 删除 |

### 依赖

| 包 | 处理 |
|------|------|
| `livekit` (Python) | 从 pyproject.toml 移除（仅 egress.py 和 livekit_token.py 使用） |
| `aiohttp` (Python) | 从 pyproject.toml 移除（仅 egress.py 使用） |
| `livekit-client` (npm) | 移除 |
| `@livekit/components-react` (npm) | 移除 |
| `@livekit/components-styles` (npm) | 移除 |

## 不做的事

- 分片实时上传（MVP 用 IndexedDB + 最终合并上传）
- ffmpeg 合并/转码（WebM 原生支持 Blob 拼接）
- 浏览器崩溃后自动恢复最后一段录制（丢失 <10s，MVP 可接受）
- 录制过程实时预览缩略图
- 从 webm 中提取音频替代 pcmRecorder

## 风险与应对

| 风险 | 应对 |
|------|------|
| 浏览器不支持 MediaRecorder | 静默降级，不影响面试流程 |
| 浏览器不支持 vp8 编码 | 降级为 `video/webm` 默认编码 |
| IndexedDB 写入失败（存储满） | 停止录制，标记错误，面试继续 |
| 上传失败 | 保留 IndexedDB 数据，标记 `video_upload_failed`，下次可重试 |
| 合并后视频在某些浏览器无法播放 | 测试 Chrome/Firefox/Edge；WebM 拼接是标准特性 |
| 最后 chunk 丢失（页面崩溃） | MVP 接受丢失 <10s；pagehide 事件覆盖正常关闭场景 |
