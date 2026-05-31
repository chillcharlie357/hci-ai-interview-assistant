# 报告页改版设计

> **状态：** 已确认
> **日期：** 2026-05-19
> **关联：** feat/video-recording 分支

## 目标

改造报告页（`/report/{sessionId}`），加上视频回放卡片、问答追踪时间戳跳转、修复关键帧截图显示，并解决 PDF 下载排版错位。

## 架构概要

纯单栏堆叠布局，屏幕和 PDF 同一套 DOM。视频回放作为顶部独立卡片。答案记录新增 `video_timestamp_sec` 字段，实现"点击问答→跳转视频对应时刻"。关键帧截图逻辑修复 + 主动截图补充。

## 技术栈

- 前端：React + TypeScript + Ant Design + vitest
- 后端：Python 3.12，标准库 HTTP 服务器
- PDF：html2canvas + jsPDF（保持不变）
- 视频：Supabase Storage 签名 URL

---

## 需求

### R1：答案记录新增视频时间戳

**目标：** 每条答案携带视频录制中的偏移秒数，供报告页跳转使用。

**后端改动：**

- `AnswerRecord` dataclass 新增字段 `video_timestamp_sec: float | None = None`
- `record_answer()` 函数签名和逻辑适配
- API 层 `submit_answer` 接收并传递 `video_timestamp_sec`
- `apiClient.ts` 的 `submitAnswer()` 新增 `videoTimestampSec?: number` 参数

**前端改动：**

- `handleFinishCandidateAnswer` 中计算视频偏移量：
  ```
  videoOffset = accumulatedDuration + (now - recordingStartTime) / 1000
  ```
- 传入 `finishAnswer` → `submitAnswer`

**测试：** 后端 UT 验证 AnswerRecord 携带 video_timestamp_sec；前端 UT 验证 submitAnswer 传参正确

### R2：报告页纯单栏布局

**目标：** 屏幕和 PDF 共享单栏竖排布局，解决双栏→A4 错位。

**改动：**

- 移除当前双栏 Grid 布局
- 改为单栏 Flex 列：回放卡 → 评分卡 → 雷达图 → 关键帧画廊 → 问答时间线 → 完整报告
- 每块卡片 `width: 100%; max-width: 800px; margin: 0 auto`
- CSS 无需 `@media print` 特殊处理

**参考宽度：** A4 竖版宽 210mm，屏幕最大宽 800px 居中

### R3：视频回放卡片

**目标：** 报告页顶部独立视频播放器，独立于关键帧存在。

**行为：**

- session 有 `videoPath` 时显示回放卡片（哪怕没有关键帧）
- 点击加载 → `fetchVideoUrl()` 获取签名 URL
- `<video controls>` 内嵌播放
- 显示视频总时长

**实现：** 新建 `VideoPlaybackCard` 组件，从 `KeyframesGallery` 中提取视频播放逻辑

### R4：关键帧截图 Bug 修复

**Bug 1 — 图片显示逻辑反了：**

- `KeyframesGallery.tsx:90`：当前 `dataUrl && videoTimestampSec == null` 才显示 `<img>`
- 修复：有 `dataUrl` 就显示 `<img>`，不管有没有 timestamp
- 逻辑：`dataUrl ? <img> : videoTimestampSec ? <PlayCircle> : <UserIcon>`

**Bug 2 — 视频播放器与关键帧耦合：**

- 当前：`!videoUrl && !videoLoading && hasRealKeyframes` 才显示回放入口
- 修复：回放卡片独立为 `VideoPlaybackCard`（见 R3），不依赖关键帧数据

**Bug 3 — 正常场景无截图：**

- 当前：关键帧仅在异常条件触发（face_missing、low_light、low_sharpness、high_motion）
- 修复：在 `VideoAnalysisHandle` 新增 `captureKeyframe(context: string)` 方法
  - 调用 `canvas.toDataURL("image/jpeg", 0.7)` 获取截图
  - 计算 `videoTimestampSec`
  - 通过 `submitVideoEvent` 提交
- 调用时机：
  - `handleStartCandidateAnswer`：答题开始时截图，context=`"answer_start"`
  - `handleFinishCandidateAnswer`：答题结束时截图，context=`"answer_end"`

### R5：问答时间线跳转按钮

**目标：** QATimeline 每条问答显示跳转按钮，点击 seek 视频到该答题开始时刻。

**改动：**

- `QATimeline` 接收可选的 `onSeekVideo: (timestampSec: number) => void` prop
- 每条有 `videoTimestampSec` 的答案行显示 `▷ 回放` 按钮
- `VideoPlaybackCard` 通过 `useImperativeHandle` 暴露 `seekTo(timestampSec)` 方法
- ReportPage 连接两者

### R6：PDF 排版修复

**目标：** PDF 不再有排版错位。

**改动：**

- 单栏布局（R2）自身适配 A4 竖版
- 关键卡片（评分、雷达、关键帧）加 CSS `page-break-inside: avoid`
- 可选：关键帧在 PDF 中渲染为缩略图（html2canvas 自动处理）

---

## 涉及文件

| 文件 | 操作 |
|------|------|
| `backend/interview/session.py` | 修改：AnswerRecord 加字段，record_answer 适配 |
| `backend/interview/api.py` | 修改：submit_answer 路由接收 video_timestamp_sec |
| `frontend/src/interviewFlow.ts` | 修改：AnswerRecord 类型加 videoTimestampSec |
| `frontend/src/apiClient.ts` | 修改：submitAnswer 加 videoTimestampSec 参数 |
| `frontend/src/pages/InterviewPage/index.tsx` | 修改：handleFinishCandidateAnswer 计算偏移量 |
| `frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts` | 修改：新增 captureKeyframe 方法 |
| `frontend/src/pages/ReportPage/index.tsx` | 修改：单栏布局 + 引用新组件 |
| `frontend/src/pages/ReportPage/index.css` | 修改：去除双栏 Grid，改单栏 Flex |
| `frontend/src/pages/ReportPage/components/VideoPlaybackCard.tsx` | **新建**：视频回放卡片 |
| `frontend/src/pages/ReportPage/components/KeyframesGallery.tsx` | 修改：修复图片显示逻辑，解耦视频播放 |
| `frontend/src/pages/ReportPage/components/QATimeline.tsx` | 修改：加跳转按钮 |
| `frontend/src/reportDownload.ts` | 修改：可能加 page-break 处理 |

---

## 非目标

- 不切换 PDF 生成库（保持 html2canvas + jsPDF）
- 不改雷达图/评分卡的计算逻辑
- 不改后端 Markdown 报告生成
- 不加 `@media print` 双模布局
