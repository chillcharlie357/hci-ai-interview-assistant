# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

AI 辅助面试 MVP，包含两条用户流程：

- **招聘端** (`/recruiter`)：
  - 控制面板：统计数据、最近面试、快捷入口
  - 面试配置 (`/recruiter/setup`)：上传简历，回答 LLM 关于岗位的追问，配置报告可见性，创建面试链接
  - 支持 Mock 模式快速创建测试面试（跳过简历解析）
- **候选人端** (`/interview/{sessionId}`)：加入 LiveKit 视频房间，听取数字人面试官提问，通过浏览器语音转文字或手动文本回答，提交答案进入报告流程。
- **评价报告** (`/report/{sessionId}`)：雷达图展示软技能分析、问答时间线、完整报告下载。

## 技术栈

- **后端**：Python 3.12，标准库 HTTP 服务器，由 `uv` 管理。无框架，使用 `http.server.ThreadingHTTPServer`。
- **前端**：TypeScript + React + Vite + Ant Design，由 `pnpm` 管理。
- **认证**：Supabase Auth（邮箱注册/登录，JWT token 验证）。
- **数据库**：Supabase PostgreSQL（RLS 行级安全策略）。
- **图表**：Recharts（雷达图等可视化）。
- **LLM**：OpenAI 兼容的 Chat Completions 格式（通过 `.env` 配置）。
- **浏览器视频**：`getUserMedia`、Canvas 指标，可选 MediaPipe Tasks Vision。
- **简历解析**：MinerU CLI（外部工具）。
- **视频会议**：LiveKit（配置后可用）。
- **测试**：Python `unittest`，前端 `vitest`。

## 常用命令

### 一键本地启动（同时启动 API 和前端）

```bash
scripts/dev.sh
```

### 仅启动后端

```bash
uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

### 仅启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

### 运行全部测试（Python 单元测试 + 前端单元测试 + 前端构建）

```bash
scripts/test.sh
```

### 仅运行 Python 测试

```bash
uv run python -m unittest discover -s backend/tests
```

### 运行单个 Python 测试文件

```bash
uv run python -m unittest backend/tests/test_session.py
```

### 仅运行前端测试

```bash
cd frontend
pnpm test
```

### E2E 测试（模拟摄像头、麦克风、TTS、STT、MinerU）

```bash
scripts/e2e.sh
```

### Docker Compose

```bash
docker compose up --build
```

## 架构

### 后端 (`backend/`)

- `auth/` — 用户认证模块：
  - `service.py` — 认证服务（注册、登录、退出、token 验证）
  - `middleware.py` — 认证中间件，验证 JWT token
  - `supabase_client.py` — Supabase 客户端封装
  - `models.py` — AuthContext 数据模型
  - `exceptions.py` — 认证异常类型
- `database/` — 数据持久化模块：
  - `session_repo.py` — Session 数据仓库，负责数据库 CRUD
  - `migrations/` — SQL 迁移脚本
- `interview/api.py` — HTTP API 服务器。所有路由由 `BaseHTTPRequestHandler` 处理。`SessionStore` 持有 `InterviewSession` 和 `PrepSession` 对象，支持数据库持久化。
- `interview/session.py` — 核心领域：`InterviewSession`、`InterviewEvent`、`AnswerRecord`、`VideoMetrics`。包含创建会话、记录答案、记录视频事件、生成 Markdown 报告的函数。
- `interview/question_engine.py` — 从简历/岗位描述/面试目标生成问题。`InterviewQuestion` 数据类包含维度、提问、追问字段。
- `interview/prep_session.py` — 招聘端准备流程：简历上传、LLM 追问、会话创建。
- `interview/llm_client.py` — OpenAI 兼容 LLM 客户端。从环境变量读取 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。未配置时优雅降级。
- `interview/answer_analysis.py` — 答案文本分析（填充词、字数、用时）。
- `interview/document_extractor.py` — 通过 MinerU CLI 解析简历。
- `interview/livekit_token.py` — LiveKit 参与者令牌生成。
- `interview/config.py` — 集中式环境变量配置。
- `speech_analysis/` — 音频语音分析模块（特征、分析器、聚合）。

### 前端 (`frontend/src/`)

- `main.tsx` — React 应用入口，包含路由配置和认证守卫。
- `auth/` — 认证模块：
  - `LoginPage.tsx` — 登录页面（Ant Design Pro LoginFormPage）
  - `RegisterPage.tsx` — 注册页面
  - `ProtectedRoute.tsx` — 路由守卫，检查认证状态
  - `authStore.ts` — 认证状态管理（Zustand + persist）
  - `index.ts` — 模块导出
- `pages/` — 页面组件：
  - `DashboardPage/` — 控制面板（统计数据、最近面试、快捷入口）
  - `RecruiterPage/` — 面试配置页（简历上传、岗位配置、Mock 模式）
  - `InterviewPage/` — 面试间（数字人、视频、弹幕字幕）
  - `ReportPage/` — 评价报告（雷达图、问答时间线、完整报告）
  - `NoSessionPage/` — 无会话提示页
- `components/layout/` — 布局组件（TopNavBar 含用户菜单和主题切换、SideNavBar、AppLayout）
- `apiClient.ts` — 后端 API 客户端函数，包含 Mock session 创建和认证 header。
- `config.ts` — 前端配置（API 基础 URL、认证开关等）。
- `interviewFlow.ts` — 面试状态机/流程逻辑。
- `digitalInterviewer.ts` — 数字人面试官提示处理（TTS 集成）。
- `speechRecognition.ts` — 浏览器语音转文字封装。
- `videoAnalyzer.ts` — 摄像头帧分析（Canvas 指标，可选 MediaPipe）。
- `pcmRecorder.ts` — 语音分析的音频录制。
- `questionPreview.ts` — 题目预览展示逻辑。
- `reportDownload.ts` — 报告下载/导出。
- `store/` — Zustand 全局状态管理（含 themeStore）。
- `theme/` — Ant Design 主题配置（含 illustrationTheme 插画风格）。
- `styles/` — CSS 变量、动画、全局样式。

### 数据流

1. 用户注册/登录 → Supabase Auth 验证 → 前端存储 JWT token。
2. 招聘官上传简历 → MinerU 提取文本 → 创建 `PrepSession`（关联 user_id）。
3. LLM 生成关于岗位的追问 → 招聘官回答。
4. 通过 `question_engine` 创建包含结构化问题的 `InterviewSession`（关联 user_id）。
5. Session 数据自动持久化到 Supabase PostgreSQL。
6. 候选人加入面试房间 → 答案记录为 `AnswerRecord` 并附带指标。
7. 视频事件记录为 `VideoMetrics`（仅作为观察信号）。
8. `generate_markdown_report()` 生成可审计报告，并执行可见性控制（`viewer=recruiter|candidate`）。

## 环境变量

复制 `.env.example` 为 `.env`。关键变量：

### Supabase 认证（必填）

- `SUPABASE_URL` — Supabase 项目 URL
- `SUPABASE_ANON_KEY` — Supabase 匿名公钥
- `REQUIRE_AUTH` — 后端认证开关（`true`/`false`，默认 `false`）
- `VITE_REQUIRE_AUTH` — 前端认证开关（`true`/`false`，默认 `false`）

### LLM 配置（可选）

- `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` — LLM 配置（缺失时应用使用降级逻辑）

### 其他工具（可选）

- `MINERU_COMMAND` — 简历解析工具命令
- `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` — 视频会议配置
- `VITE_API_BASE_URL` — 前端 API 端点（默认 `http://127.0.0.1:8000`）
- `VITE_INTERVIEW_FILLER_WORDS` — 逗号分隔的填充词列表，用于语音分析

## Git 工作流

- 禁止直接在 `main` 上开发。从 `main` 创建聚焦的功能分支。
- 每个分支一个功能。合并前在分支上运行测试。
- 合并回 `main` 时使用 `--no-ff`。
- 使用 conventional commits 格式。

## Spec 驱动开发

实现功能或变更产品范围前，先阅读 spec 文档：

- `spec/prd.md` — 产品需求（v0.5）、数据结构、验收标准
- `spec/goals.md` — MVP 目标、范围边界、非目标
- `spec/implementation-plan.md` — 分阶段实施计划（13 个阶段）
- `spec/problem-related-work-solution.md` — 问题分析、竞品格局、设计原则
- `spec/digital-interviewer-meeting-experience.md` — 数字人面试官 UX 规范
- `spec/execution-process.md` — 分支策略、TDD 流程、模块边界、Mock E2E 边界
- `spec/FRONTEND_DESIGN.md` — 前端设计规范（设计语言、色彩、组件、布局）
- `spec/stitch_elite_digital_presence/` — 设计参考文件（ai_9 至 ai_16）
- `AGENTS.md` — 项目方向、产品红线和编码规范

产品范围变更时，先更新 `spec/`。实现遵循 TDD：先写测试，再写生产代码。

## 评估维度

问题引擎生成的问题覆盖以下维度（定义在 `question_engine.py` 中）：

- 专业能力
- 项目经验
- 技术实现能力
- 应变能力
- 表达能力
- 协作能力

## 核心数据结构

关键领域对象（均为 frozen dataclass，定义在 `backend/interview/session.py` 和 `question_engine.py` 中）：

- `AuthContext` — user_id、email、full_name（定义在 `backend/auth/models.py`）
- `InterviewQuestion` — id、dimension、prompt、followUps、evidenceHints
- `AnswerRecord` — question_id、dimension、prompt、text、duration_sec、word_count、filler_word_count
- `InterviewEvent` — type、timestamp、message、question_id
- `VideoMetrics` — face_present、brightness、blur、motion、gaze_proxy、head_pose_proxy、blink_proxy、nod_proxy、hand_activity、body_activity
- `InterviewSession` — 持有问题、答案、事件、video_events、keyframes、llm_status、报告可见性、user_id

### 数据库表

- `profiles` — 用户资料（id、email、full_name、avatar_url、preferences）
- `interview_sessions` — 面试会话（含 JSON 字段：questions、answers、events、video_events、keyframes）
- `prep_sessions` — 准备会话（含 JSON 字段：turns、ready_summary）

## 产品红线

- 摄像头衍生信号（脸部可见、亮度、模糊、视线、眨眼、点头、手势/身体活动、运动量）**仅作为观察信号** — 禁止推断人格、情绪、健康状态、受保护属性或录用结论。
- 报告使用谨慎措辞："观察到"、"检测到"、"需复核"、"质量问题"。
- 不实现屏幕共享、OCR、高精度人脸识别、敏感属性推断或自动录用/不录用决策。
- 关键帧默认仅保存在内存会话中；未经 spec 更新不得持久化到磁盘。

## 关键依赖包

- Python：`numpy`、`soundfile`（语音分析）、`supabase`（认证和数据库）
- 前端：`react`、`vite`、`antd`、`@ant-design/pro-components`、`recharts`、`@livekit/components-react`、`livekit-client`、`@mediapipe/tasks-vision`、`zustand`、`antd-style`
