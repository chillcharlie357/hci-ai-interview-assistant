---
name: AI Interview System Design System
colors:
  surface: '#ffffff'
  surface-dim: '#d7dbd9'
  surface-bright: '#f7faf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f3'
  surface-container: '#ebefed'
  surface-container-high: '#e5e9e7'
  surface-container-highest: '#e0e3e1'
  on-surface: '#181c1c'
  on-surface-variant: '#3e4947'
  inverse-surface: '#2d3130'
  inverse-on-surface: '#eef1f0'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fd'
  on-secondary-container: '#57657b'
  tertiary: '#7f4025'
  on-tertiary: '#ffffff'
  tertiary-container: '#9c573a'
  on-tertiary-container: '#ffe5db'
  error: '#b91c1c'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#d5e3fd'
  secondary-fixed-dim: '#b9c7e0'
  on-secondary-fixed: '#0d1c2f'
  on-secondary-fixed-variant: '#3a485c'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb598'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#72361b'
  background: '#f7faf8'
  on-background: '#181c1c'
  surface-variant: '#e0e3e1'
  primary-light: '#dff5f2'
  primary-text: '#0f3f3a'
  page-bg: '#f4f7fb'
  surface-alt: '#f8fafc'
  surface-livekit: '#eef3f8'
  border: '#d8e0ec'
  text-main: '#172033'
  text-muted: '#637086'
  text-helper: '#475569'
  warning: '#b45309'
  dark-code-bg: '#101827'
  code-text: '#eef5ff'
  caption-overlay: rgba(16, 24, 39, 0.85)
typography:
  h1:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
  h2:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.45'
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '700'
    lineHeight: '1'
  eyebrow:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '800'
    letterSpacing: 0.08em
  caption:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  panel-padding: 20px
  grid-gap: 16px
  form-gap: 10px
  video-gap: 12px
  container-max-setup: 720px
  container-max-report: 900px
---

# DESIGN.md

前端设计文档，用于指导 AI 前端生成工具重建本项目的 TypeScript + React 前端。

---

## 1. 项目概述

AI 辅助面试系统 MVP，包含三个独立页面：

- **页面一：准备页** (`/setup`) — 招聘官选择岗位、上传简历、回答 LLM 追问、配置面试参数、生成面试链接。
- **页面二：面试页** (`/interview/{sessionId}`) — 类在线会议界面，左侧为数字人面试官与候选人视频区域，左下为弹幕式实时字幕，右侧为当前题目说明与监控指标，右下为工具栏。
- **页面三：报告页** (`/report/{sessionId}`) — 面试结束后展示完整智能面试纪要，支持下载。

## 2. 设计系统

### 2.1 颜色

| 用途 | 色值 |
|---|---|
| 主色（品牌色/按钮） | `#0f766e`（深青色） |
| 主色浅底 | `#dff5f2` |
| 主色文字 | `#0f3f3a` |
| 页面背景 | `#f4f7fb` |
| 卡片/面板背景 | `#ffffff` |
| 次要背景 | `#f8fafc` |
| 边框 | `#d8e0ec` |
| 次要背景（LiveKit） | `#eef3f8` |
| 主文字 | `#172033` |
| 次要文字 | `#637086` |
| 辅助文字 | `#475569` |
| 错误文字 | `#b91c1c` |
| 警告/高亮 | `#b45309` |
| 次要按钮 | `#334155` |
| 深色代码背景 | `#101827` |
| 代码文字 | `#eef5ff` |

### 2.2 字体

- 字体族：`Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- 标题 h1：28px，line-height 1.2
- 标题 h2：18px，line-height 1.45
- 标签 label：13px，font-weight 700，颜色 `#637086`
- 小标签 eyebrow：12px，font-weight 800，letter-spacing 0.08em，大写，颜色 `#637086`
- 正文：继承 `:root` 默认

### 2.3 圆角与间距

- 按钮/输入框圆角：6px
- 卡片面板圆角：8px
- 胶囊标签圆角：999px
- 面板内边距：20px
- 网格间距：16px
- 表单元素间距：10px

### 2.4 按钮样式

- 主按钮：背景 `#0f766e`，白色文字，font-weight 700，padding 11px 14px
- 次要按钮：背景 `#334155`，白色文字
- 链接按钮：同主按钮样式但使用 `<a>` 标签
- 禁用状态：opacity 0.45，cursor not-allowed

### 2.5 输入框样式

- 边框 `1px solid #d8e0ec`，圆角 6px，padding 10px 11px
- 文字颜色 `#172033`

### 2.6 面板/卡片样式

- 白色背景，`1px solid #d8e0ec` 边框，8px 圆角，20px 内边距

## 3. 路由结构

```
/                          → 重定向到 /setup
/setup                     → 准备页 (SetupPage)
/interview/{sessionId}     → 面试页 (InterviewPage)
/report/{sessionId}        → 报告页 (ReportPage)
```

路由通过 `window.location.pathname` 正则匹配实现，不使用路由库。

---

## 4. 页面一：准备页 (`SetupPage`)

### 4.1 整体布局

居中单列卡片布局，最大宽度 720px，页面上下留白居中。整体风格简洁，类似表单向导。


### 4.2 交互流程

```
1. 输入候选人姓名
2. 选择简历文件（PDF/DOCX/图片）
3. 点击"上传简历"
   → 调用 POST /api/prep-sessions/resume
   → 下方显示简历解析预览（白底滚动区域，最大高度 200px）
4. 系统自动显示 LLM 追问问题
5. 逐条输入回答
6. 点击"提交回答"
   → 调用 POST /api/prep-sessions/{id}/followups
7. 配置报告可见性、LLM 开关、视频观察开关
8. 点击"创建面试"
   → 调用 POST /api/prep-sessions/{id}/interview-session
   → 下方显示面试链接 + 复制按钮
9. 可点击"查看报告"跳转到报告页（面试结束后有内容）
```

---

## 5. 页面二：面试页 (`InterviewPage`)

### 5.1 整体布局

全屏会议风格布局，无页面滚动，四个区域占满视口：

```
┌────────────────────────────────────────┬──────────────────────────┐
│                                        │                          │
│          视频会议区                      │    题目与说明区            │
│     (数字人面试官 + 候选人视频)           │                          │
│                                        │  当前问题                 │
│                                        │  维度标签                 │
│                                        │  追问建议                 │
│                                        │  观察点                   │
│                                        │                          │
│                                        ├──────────────────────────┤
│                                        │                          │
│                                        │    监控指标区             │
├────────────────────────────────────────┤                          │
│                                        │  视频指标面板             │
│          弹幕字幕区                      │  语音指标面板             │
│     (AI 提问 + 候选人回答 弹幕流)        │  关键帧列表               │
│                                        │                          │
├────────────────────────────────────────┼──────────────────────────┤
│                                        │                          │
│          回答控制区                      │    工具栏                 │
│     (开始回答/结束回答/文本输入)          │  摄像头/麦克风/结束面试    │
│                                        │                          │
└────────────────────────────────────────┴──────────────────────────┘
```

网格布局定义：

```css
.interview-page {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr auto 72px;
  height: 100vh;
  gap: 0;
}
/* 区域分配：
   [视频会议区]    [题目与说明区]
   [弹幕字幕区]    [监控指标区]
   [回答控制区]    [工具栏]
*/
```

### 5.2 视频会议区（左上，占约 60% 宽度，约 60% 高度）

类在线会议软件的双人视频布局。

**布局**

- 水平排列两个视频瓦片，间距 12px，内边距 12px
- 背景：渐变 `#f8fafc → #eef3f8`
- 左侧瓦片：数字人面试官
- 右侧瓦片：候选人视频（LiveKit）或占位符

**数字人面试官瓦片**

- 白色卡片，8px 圆角，居中内容
- 头像区域（132x132px）：
  - 外圈光环（`avatar-orbit`）：渐变色 `#0f766e → #22c55e → #0ea5e9`
  - 内核（`avatar-core`）：白色圆形 82x82px，显示 "AI"，30px font-weight 900
  - 说话时光环脉冲动画（`avatarPulse`，1.4s）
- 名称行："AI 面试官" + 状态胶囊标签（准备中/提问中/等待回答/已结束/不支持）
- 语音动画条（`voice-bars`）：4 根竖条，说话时弹跳（`voiceBounce`，0.8s）
- 底部进度："问题 2/6"

**候选人视频瓦片**

- LiveKit 视频组件（`LiveKitRoom`、`GridLayout`、`ParticipantTile`）
- 浅色主题变量覆盖
- 控制栏隐藏（控制权移到右下工具栏）
- LiveKit 不可用时显示占位符："等待候选人加入..."

### 5.3 弹幕字幕区（左下，视频区下方）

类似直播弹幕的实时字幕效果，字幕从底部上浮或横向滚动。

**布局**

- 深色半透明背景：`rgba(16, 24, 39, 0.85)`（深色 `#101827` 半透明）
- 内边距 12px-16px
- 最小高度 120px，最大高度 180px
- 内容从底部向上堆叠，最新字幕在最下方
- 可自动滚动到最新内容

**字幕条目**

- AI 字幕（左对齐）：
  - 前缀标签："AI 面试官"，小字，深青色 `#0f766e`
  - 内容：白色文字，14-16px
  - 淡入动画
- 候选人字幕（右对齐）：
  - 前缀标签："候选人"，小字，浅青色 `#dff5f2`
  - 内容：浅绿色文字 `#dff5f2`
  - 实时更新（语音识别流式结果）
  - 淡入动画

**字幕行为**

- AI TTS 朗读时，逐句显示提问字幕
- 候选人语音识别结果实时追加，识别中显示省略号动画
- 历史字幕逐渐降低 opacity（越旧越淡）

### 5.4 题目与说明区（右上）

当前面试题目的详细信息。

**内容**

- 区域标题："当前题目"（eyebrow 样式）
- 维度标签：胶囊形，橙色高亮 `#b45309`
- 问题文本：大字 18px，左侧 3px 深青色竖线装饰
- 追问建议区：
  - 标题："追问建议"
  - 列表形式展示
- 观察点区：
  - 标题："观察要点"
  - 列表形式展示
- 问题进度：底部显示 "2 / 6"

**样式**

- 白色面板，圆角 8px
- 内容可滚动（如果追问/观察点较多）
- 问题切换时有轻微过渡动画

### 5.5 监控指标区（右中，题目区下方）

实时展示面试过程中的各项指标。

**视频指标面板**

- 4 列网格（`metric-grid`），间距 8px
- 每个指标项（`metric-item`）：
  - 标签：12px，`#637086`
  - 数值：14px，`#172033`
- 指标列表：
  - 脸部可见、亮度、清晰度、运动量
  - 视线稳定、头部姿态、眨眼、点头
  - 手势活跃、身体活跃

**语音指标面板**

- 显示当前回答的实时指标：
  - 回答用时（秒）
  - 字数
  - 填充词数量

**关键帧列表**

- 网格布局，每项 120px 最小宽度
- 每项：缩略图（4:3）+ 时间戳说明
- 提示文字（小字，`#637086`）："仅作为观察信号"

### 5.6 回答控制区（左下，字幕区下方）

候选人回答操作区域。

**主流程**

- "开始回答" 按钮（主色按钮）：点击后开始语音识别
- "结束回答" 按钮（次要按钮）：点击后结束识别，提交答案
- 回答中显示计时器（秒数递增）

**文本 fallback**

- 浏览器不支持语音识别时，显示文本输入框
- 输入框下方 "提交回答" 按钮

**状态提示**

- 当前状态文字（如 "等待 AI 提问..."、"请回答"、"回答已提交"）

### 5.7 工具栏（右下）

面试控制工具栏。

**按钮**

- 摄像头开关（开/关切换）
- 麦克风开关（开/关切换）
- 结束面试按钮（红色，确认后跳转到报告页）

**样式**

- 水平排列，居中对齐
- 按钮使用图标 + 文字
- 禁用状态：面试未开始或已结束时部分按钮禁用

### 5.8 数字人状态机

```
preparing → speaking → waiting → speaking → ... → finished
                                                      ↑
                                        unsupported ──┘（浏览器不支持 TTS 时）
```

- `preparing`：加载会话中
- `speaking`：TTS 朗读当前问题，头像光环脉冲动画激活，字幕区显示 AI 提问
- `waiting`：等待候选人回答，字幕区等待输入
- `finished`：所有题目已完成
- `unsupported`：浏览器不支持 Web Speech API

---

## 6. 页面三：报告页 (`ReportPage`)

### 6.1 整体布局

居中单列布局，最大宽度 900px。类似文档阅读体验。

```
┌──────────────────────────────────────────────┐
│                   报告页                      │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  报告头部                              │    │
│  │  候选人：xxx    岗位：xxx              │    │
│  │  面试时长：xx分钟    日期：xxxx-xx-xx   │    │
│  │  [下载 Markdown]                       │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  时间线摘要                            │    │
│  │  • q_001 候选人介绍项目经验。           │    │
│  │  • q_002 候选人说明技术实现方案。       │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  问答记录                              │    │
│  │  ┌────┬──────────┬──────────┐        │    │
│  │  │ 序号│ 问题      │ 回答摘要  │        │    │
│  │  ├────┼──────────┼──────────┤        │    │
│  │  │ 1  │ ...       │ ...      │        │    │
│  │  └────┴──────────┴──────────┘        │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  技术能力观察                          │    │
│  │  解题思路 / 代码实现 / Debug / ...     │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  表达与互动观察                        │    │
│  │  填充词 / 回答用时 / 回答字数 / ...    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  非语言观察                            │    │
│  │  画面质量 / 脸部可见 / 运动量 / ...    │    │
│  │  关键帧缩略图列表                      │    │
│  │  ⚠ 仅作为观察信号，不代表能力结论      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  待人工确认                            │    │
│  │  • 回答过短的问题                      │    │
│  │  • 填充词较多的问题                    │    │
│  │  • 尚未回答的问题                      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [返回准备页]                                  │
│                                              │
└──────────────────────────────────────────────┘
```

### 6.2 交互流程

```
1. 页面加载，调用 GET /api/sessions/{id}/report?viewer=recruiter|candidate
2. 解析 Markdown 报告，分区渲染
3. 点击"下载 Markdown" → 下载 .md 文件
   文件名：{候选人姓名}_{sessionId}.md
4. 点击"返回准备页" → 跳转 /setup
```

### 6.3 报告可见性

- `viewer=recruiter`：招聘官视角，始终可访问，显示完整内容
- `viewer=candidate`：候选人视角，仅在报告配置为 `shared_with_candidate` 时可访问，否则显示无权限提示

---

## 7. 组件清单

### 7.1 页面级组件

| 组件 | 路由 | 说明 |
|---|---|---|
| `SetupPage` | `/setup` | 准备页：简历上传、追问、配置、生成链接 |
| `InterviewPage` | `/interview/{sessionId}` | 面试页：会议式布局、字幕、指标、工具栏 |
| `ReportPage` | `/report/{sessionId}` | 报告页：Markdown 报告展示与下载 |

### 7.2 业务逻辑模块

| 模块 | 文件 | 职责 |
|---|---|---|
| API 客户端 | `apiClient.ts` | 所有后端 API 调用封装 |
| 面试流程 | `interviewFlow.ts` | 面试状态管理、数据类型定义 |
| 数字人面试官 | `digitalInterviewer.ts` | 状态描述、自动播报判断、字幕构建 |
| 题目预览 | `questionPreview.ts` | 题目预览列表构建 |
| 报告下载 | `reportDownload.ts` | 文件名生成、Markdown 下载 |
| 语音识别 | `speechRecognition.ts` | 浏览器 SpeechRecognition 封装 |
| 音频录制 | `pcmRecorder.ts` | PCM 音频录制，用于语音分析 |
| 摄像头分析 | `videoAnalyzer.ts` | Canvas 帧分析，计算视频指标 |
| 配置 | `config.ts` | 运行时配置读取 |

### 7.3 面试页子组件

| 组件 | 区域 | 说明 |
|---|---|---|
| `MeetingArea` | 左上 | 视频会议区容器 |
| `DigitalInterviewerTile` | 会议区内 | 数字人头像 + 状态 + 语音动画 |
| `CandidateVideoTile` | 会议区内 | LiveKit 视频或占位符 |
| `DanmakuCaptions` | 左下 | 弹幕式实时字幕流 |
| `QuestionPanel` | 右上 | 当前题目、追问、观察点 |
| `MetricsPanel` | 右中 | 视频指标 + 语音指标 + 关键帧 |
| `AnswerControls` | 左下 | 开始/结束回答按钮、文本输入 |
| `Toolbar` | 右下 | 摄像头/麦克风/结束面试 |

---

## 8. API 接口

前端需要调用的后端 API：

| 方法 | 路径 | 说明 | 请求体 |
|---|---|---|---|
| POST | `/api/prep-sessions/resume` | 上传简历 | `{ candidateName, fileName, contentType, dataBase64 }` |
| POST | `/api/prep-sessions/{id}/followups` | 提交追问回答 | `{ answers: [{ questionId, answer }] }` |
| POST | `/api/prep-sessions/{id}/interview-session` | 创建面试会话 | `{ reportVisibility, useLlmQuestions, enableVideoObservation }` |
| GET | `/api/sessions/{id}` | 获取会话详情 | — |
| POST | `/api/sessions/{id}/livekit-token` | 获取 LiveKit token | `{ participantName }` |
| POST | `/api/sessions/{id}/answers` | 提交答案 | `{ questionId, text, durationSec }` |
| POST | `/api/sessions/{id}/video-events` | 上报视频事件 | `{ event_type, metrics, keyframe? }` |
| POST | `/api/sessions/{id}/speech-chunk` | 上报语音片段 | `{ audioBase64, questionId }` |
| GET | `/api/sessions/{id}/report?viewer=recruiter\|candidate` | 获取报告 | — |
| GET | `/api/sessions/__healthcheck__` | 健康检查 | — |

---

## 9. 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `VITE_API_BASE_URL` | 后端 API 地址 | `http://127.0.0.1:8000` |
| `VITE_INTERVIEW_FILLER_WORDS` | 逗号分隔的填充词列表 | 空 |

通过 `import.meta.env` 读取，封装在 `config.ts` 中。

---

## 10. 响应式断点

| 断点 | 布局变化 |
|---|---|
| > 1200px | 面试页完整双列布局 |
| 800px - 1200px | 面试页左右区域堆叠为单列 |
| < 800px | 准备页去掉左右留白，报告页全宽 |

---

## 11. 动画

| 动画名 | 元素 | 效果 |
|---|---|---|
| `avatarPulse` | 数字人头像光环 | 说话时缩放 0.98-1.04 + 旋转 0-12deg + 饱和度变化，1.4s 循环 |
| `voiceBounce` | 语音条 | 高度 10px-28px 弹跳，0.8s 循环，各条延迟 0.12s |
| 字幕淡入 | 弹幕字幕条目 | opacity 0→1，transform translateY(8px→0)，0.3s |

---

## 12. 外部依赖

| 包 | 用途 |
|---|---|
| `react` / `react-dom` | UI 框架 |
| `vite` / `@vitejs/plugin-react` | 构建工具 |
| `typescript` | 类型系统 |
| `@livekit/components-react` | LiveKit React 组件（`LiveKitRoom`、`GridLayout`、`ParticipantTile`、`ControlBar`、`RoomAudioRenderer`） |
| `@livekit/components-styles` | LiveKit 默认样式 |
| `livekit-client` | LiveKit 客户端 SDK（`Track`） |
| `@mediapipe/tasks-vision` | 可选，浏览器端视觉 landmark 分析 |
| `vitest` | 测试框架 |
