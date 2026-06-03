# 报告页视频回看 & 时刻截图修复方案

## 问题清单

### P0 - 视频分段加载（浏览器进度条总时长逐段增加）

**根因**：MediaRecorder 生成的 WebM 是流式格式，Segment Info 中 Duration=unknown，且无 Cues（seek 索引表）。浏览器无法从文件头获知总时长，只能逐 Cluster 解析，边下载边推算。合并分片用 `new Blob(chunks)` 不会修复元数据。

**修复**：后端 ffmpeg `-c copy` 无损重封装（不重新编码），重建 Duration 和 Cues 元数据。

### P0 - 视频 URL 重复加载、播放器各自为政

- `VideoPlaybackCard` 和 `KeyframesGallery` 各自维护独立的 `<video>` 元素和 `fetchVideoUrl()` 调用
- 同一视频被请求两次
- `KeyframesGallery` 内嵌的视频播放器与主播放器互不同步

**修复**：将视频 URL 加载逻辑提升到 `ReportPage`，用 React Context 或 props 向下传递，所有组件共享同一个视频状态。

### P0 - QATimeline「回放」按钮在视频未加载时静默失败

- 用户可能先点击 QATimeline 的回放按钮，但 `VideoPlaybackCard` 的 `seekTo()` 在 `videoUrl` 为 null 时直接 return

**修复**：`seekTo` 内部自动触发视频加载，加载完成后跳转到指定时间戳。

### P1 - 关键帧 dataUrl 丢失

- `api.py:379`：视频事件仅更新内存，`save_session()` 只在答题时触发
- 两次答题之间/session 结束时关键帧可能丢失

**修复**：在 `record_video_event()` 时也调用 `save_session()`，或用限流（如每 N 个关键帧持久化一次）。

### P2 - 关键帧无 dataUrl 时只能显示图标，无缩略图

- `KeyframesGallery.tsx:91-97`：`dataUrl` 为空时只显示 `<PlayCircleOutlined />`

**修复**：后端 ffmpeg 提取缩略图，或者前端用 `<video>` 的 `currentTime` 截图（canvas drawImage + toDataURL）。

### P2 - KeyframesGallery 内嵌多余视频播放器

- 当 `hasVideo` 时 embed 一个独立的 `<video>` 控件到画廊卡片内

**修复**：移除内嵌播放器，点击关键帧时跳转到共享的主播放器。

---

## 修复方案

### 1. 后端：ffmpeg 重封装 WebM（方案 A）

在 `backend/storage/video.py` 中增加 `_fix_webm_metadata()` 函数：

```python
def _fix_webm_metadata(video_bytes: bytes) -> bytes:
    """用 ffmpeg -c copy 重建 WebM Duration/Cues，不重新编码。
    
    -c copy 只重写容器元数据，CPU 开销极低。
    100MB 视频耗时约 1-2 秒。
    """
    import subprocess, tempfile, os
    
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as fin, \
         tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as fout:
        try:
            fin.write(video_bytes)
            fin.flush()
            subprocess.run([
                'ffmpeg', '-y', '-v', 'error',
                '-i', fin.name,
                '-c', 'copy',
                '-fflags', '+genpts',
                fout.name
            ], check=True, timeout=120)
            return fout.read()
        finally:
            os.unlink(fin.name)
            os.unlink(fout.name)
```

在 `upload_video()` 中调用 `_fix_webm_metadata()` 处理后再上传。

**Dockerfile.backend 变更**：在系统包安装中添加 `ffmpeg`。

### 2. 前端：共享视频状态

在 `ReportPage` 中创建统一的视频状态管理：

```typescript
// ReportPage 内部
const [videoUrl, setVideoUrl] = useState<string | null>(null);
const [videoLoading, setVideoLoading] = useState(false);
const videoRef = useRef<HTMLVideoElement>(null);

async function loadVideo() { ... }
function seekTo(timestampSec: number) { ... }
```

- `VideoPlaybackCard` 接收 `videoUrl`、`videoLoading`、`videoRef` 作为 props（去掉内部独立加载）
- `KeyframesGallery` 点击关键帧时调用 `onSeekVideo(timestampSec)`（不再内嵌播放器）
- `QATimeline` 回放按钮调用 `onSeekVideo()`

### 3. 前端：VideoPlaybackCard 自动加载模式

- 移除手动"点击加载"按钮，改为页面加载时自动获取 URL
- `seekTo()` 逻辑改为：若 URL 尚未加载完成，先把 `pendingSeekTimestamp` 存下，等 loadeddata 事件触发时自动跳转

### 4. 前端：KeyframesGallery 重构

- 移除内嵌的 `<video>` 元素和 `loadVideo()` 逻辑
- 点击关键帧格子 → `props.onSeekVideo(kf.videoTimestampSec)`
- 有 `dataUrl` 时显示 `<img>` 缩略图
- 无 `dataUrl` 但有 `videoTimestampSec` 时，显示时间戳 + 播放图标
- 移除 `KeyframePlaceholder` 硬编码（没有真实数据时不显示占位）

### 5. 后端：video_events 实时持久化

在 `api.py` 的 `record_video_event()` 中，改为按频率持久化（如每 5 个关键帧或每 10 秒持久化一次），而不是完全不持久化。

或者更简单的方案：关键帧数量少（通常一场面试只有几个），直接在每次收到关键帧时调用 `save_session()`。

---

## 组件通信新架构

```
ReportPage (持有共享状态)
├── videoUrl, videoLoading, videoRef, seekTo(), loadVideo()
│
├── VideoPlaybackCard (纯展示 + 接收 shared props)
│   └── <video ref={sharedVideoRef} src={sharedVideoUrl} />
│
├── KeyframesGallery (接收 onSeekVideo + hasVideo)
│   └── 点击关键帧 → onSeekVideo(timestampSec)
│
└── QATimeline (接收 onSeekVideo)
    └── 回放按钮 → onSeekVideo(timestampSec)
```

---

## 测试计划

### 前端测试

1. **VideoPlaybackCard 单元测试**
   - 传入 `videoUrl` 时渲染 `<video>` 元素
   - `videoLoading=true` 时显示加载状态
   - `videoUrl=null && !videoLoading` 时不显示视频

2. **KeyframesGallery 单元测试**
   - 有关键帧数据时渲染关键帧格子
   - 无关键帧数据时不显示占位符
   - 有 `dataUrl` 时渲染 `<img>`
   - 无 `dataUrl` 时渲染播放图标
   - 点击关键帧调用 `onSeekVideo`

3. **QATimeline 回放按钮测试**
   - `answer.videoTimestampSec` 存在且有 `onSeekVideo` 回调时显示回放按钮
   - 点击回放按钮调用 `onSeekVideo` 并传入正确的时间戳

4. **ReportPage 集成测试**
   - 视频 URL 共享状态正确传递到子组件
   - `seekTo` 在有/无视频时行为正确

### 后端测试

5. **`_fix_webm_metadata()` 单元测试**
   - 输入有效 webm bytes → 输出仍有数据和有效 duration
   - 输入空 bytes → 不崩溃
   - 输入的 webm 播放后 prompt 有正确的 duration（非 `Infinity` 或 `NaN`）

6. **`upload_video()` 测试**
   - 上传后存储的 webm 是经过 ffmpeg 处理的（元数据完整）

---

## 实施顺序

1. 后端 ffmpeg 重封装（P0）
2. 前端共享视频状态重构（P0）
3. KeyframesGallery 重构（P0 + P1 + P2）
4. video_events 持久化改进（P1）
5. 关键帧缩略图提取（P2）
6. 各阶段完成后运行测试
