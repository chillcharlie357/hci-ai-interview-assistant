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

### 首选：Docker/Podman Compose（一键启动）

```bash
./compose.sh up       # 开发模式（源码热重载，推荐）
./compose.sh prod     # 生产模式（前端构建后 nginx 部署）
./compose.sh down     # 关闭所有服务
./compose.sh logs     # 查看所有容器日志
./compose.sh logs backend   # 只看后端日志
```

`compose.sh` 自动检测 podman 或 docker。支持 `COMPOSE_BIN=docker ./compose.sh up` 强制指定。

Dev 覆盖：后端挂载 `./backend` 源码 + `watchfiles` 热重载 + `DEBUG=true`；前端挂载 `./frontend/src`，Vite HMR 生效。

### 仅启动后端（本地开发调试）

```bash
uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

### 仅启动前端（本地开发调试）

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

### 运行功能测试（真实 HTTP 请求，需后端运行中）

```bash
uv run python -m unittest backend.tests.test_functional -v
```

### 仅运行前端测试

```bash
cd frontend
pnpm test
```

### 生成 Mock 简历（PDF + Markdown）

```bash
uv run python scripts/generate_mock_resumes.py
```

输出文件在 `mock-resumes/`（PDF）和 `mock-resumes/sources/`（Markdown 源码）。

### Playwright E2E 全流程测试

通过 `/interview-e2e-testing` skill 运行完整的面试流程自动化测试（简历上传 → LLM 出题 → 候选人答题 → 报告页）。前置条件：
- 容器环境已启动（`./compose.sh up`）
- Playwright 插件已加载
- `mock-resumes/` 目录下有 PDF 简历

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
  - `prep_session_repo.py` — PrepSession 数据仓库
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
- `interview/exceptions.py` — 业务异常类型（PersistenceError）。
- `interview/logging_config.py` — 全局日志配置（configure_logging），所有模块共享同一格式和 handler。日志格式：`%(asctime)s [%(levelname)-7s] [%(name)s] %(message)s`，通过 `LOG_LEVEL` 环境变量控制级别（默认 INFO）。
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
- `logger.ts` — 前端结构化日志工具（`createLogger`），日志以 `[HCI:component]` 前缀输出，通过 `VITE_LOG_LEVEL` 控制级别。
- `apiClient.ts` — 后端 API 客户端函数，包含 Mock session 创建和认证 header。所有请求自动记录 `[HCI:api]` 日志。
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
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service_role 密钥（后端绕过 RLS，自己做 user_id 过滤）
- `REQUIRE_AUTH` — 后端认证开关（`true`/`false`，默认 `false`）
- `VITE_REQUIRE_AUTH` — 前端认证开关（`true`/`false`，默认 `false`）

### LLM 配置（可选）

- `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` — LLM 配置（缺失时应用使用降级逻辑）

### 其他工具（可选）

- `MINERU_API_TOKEN` — MinerU API Token（配饰后使用 Precision API，未配置自动降级 Agent API）
- `MINERU_TIMEOUT_SEC` — MinerU 解析超时秒数（默认 300）
- `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` — 视频会议配置
- `DATABASE_URL` — 数据库直连 URL（可选，现有代码通过 Supabase API 操作）
- `VITE_API_BASE_URL` — 前端 API 端点（默认 `http://127.0.0.1:8000`）
- `VITE_INTERVIEW_FILLER_WORDS` — 逗号分隔的填充词列表，用于语音分析

### 日志级别（可选）

- `LOG_LEVEL` — 后端日志级别：`DEBUG`、`INFO`、`WARNING`、`ERROR`（默认 `INFO`）
- `VITE_LOG_LEVEL` — 前端日志级别：`debug`、`info`、`warn`、`error`（默认 `info`）

### 健康检查

- `GET /api/health` — 公共路由（无需认证），返回组件状态（database、LLM、ASR、LiveKit、MinerU）和运行时指标（uptime、内存会话数）

### ASR 语音识别（可选）

- `VITE_ASR_WS_URL` — 前端 ASR WebSocket 地址（默认 `ws://127.0.0.1:8765/`）
- `VITE_ASR_PROVIDER` — ASR 提供商（`qwen` 或 `webspeech`，默认 `qwen`）
- `ASR_WS_HOST` / `ASR_WS_PORT` — 后端 ASR 服务监听地址/端口

## Git 工作流

- 禁止直接在 `main` 上开发。从 `main` 创建聚焦的功能分支。
- 每个分支一个功能。合并前在分支上运行测试。
- commit 的粒度是一组相关且经过验证的变更，而不是“每改一个文件就提交一次”。只有当一个逻辑变更涉及的相关文件都完成、并且相关验证已经运行后，才创建 commit。
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
- `spec/evaluation-metrics.md` — 面试评估指标规范（维度、参考范围、数据流、实现状态）
- `spec/frontend-quality-plan.md` — 前端质量改进计划（已完成，保留作为设计参考）
- `spec/video-recording-mvp-plan.md` — 视频录制 MVP 计划
- `spec/stitch_elite_digital_presence/` — 设计参考文件（ai_9 至 ai_16）
- `AGENTS.md` — 项目方向、产品红线和编码规范
- `.claude/skills/` — 项目级 Claude Code skills（运行 `/interview-e2e-testing` 执行 Playwright E2E 全流程测试）
- `scripts/generate_mock_resumes.py` — 生成 Mock 简历 PDF 和 Markdown 源码（输出到 `mock-resumes/`）
- `mock-resumes/` — 预生成的 PDF 简历文件（前端、后端、AI 工程师、产品经理 4 个候选）
- `backend/tests/test_functional.py` — 真实 HTTP 请求功能测试（需运行中的后端）
- `TROUBLESHOOTING.md` — 常见排错指南（端口冲突、MinerU 超时、health check 等）

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
- `AnswerRecord` — question_id、dimension、prompt、text、duration_sec、word_count、filler_word_count、speech_rate_wpm、audio_f0_std_semitones
- `InterviewEvent` — type、timestamp、message、question_id
- `VideoMetrics` — face_present、brightness、blur、motion、gaze_proxy、head_pose_proxy、blink_proxy、blink_count、blink_rate_per_minute、nod_proxy、nod_count、nod_rate_per_minute、hand_activity、body_activity
- `InterviewSession` — 持有问题、答案、事件、video_events、keyframes、llm_status、user_id（API 响应中注入 speech_summary）

### 数据库表

- `profiles` — 用户资料（id、email、full_name、avatar_url、preferences）
- `interview_sessions` — 面试会话（含 JSON 字段：questions、answers、events、video_events、keyframes）
- `prep_sessions` — 准备会话（含 JSON 字段：turns、ready_summary）
- `speech_aggregates` — 语音聚合数据（chunk_count、基频统计、半音标准差累积等）

## 产品红线

- 摄像头衍生信号（脸部可见、亮度、模糊、视线、眨眼、点头、手势/身体活动、运动量）**仅作为观察信号** — 禁止推断人格、情绪、健康状态、受保护属性或录用结论。
- 报告使用谨慎措辞："观察到"、"检测到"、"需复核"、"质量问题"。
- 不实现屏幕共享、OCR、高精度人脸识别、敏感属性推断或自动录用/不录用决策。
- 关键帧默认仅保存在内存会话中；未经 spec 更新不得持久化到磁盘。

## 关键依赖包

- Python：`numpy`、`soundfile`（语音分析）、`supabase`（认证和数据库）、`dashscope`（阿里云 ASR）、`websockets`
- 前端：`react`、`vite`、`antd`、`@ant-design/pro-components`、`recharts`、`@livekit/components-react`、`livekit-client`、`@mediapipe/tasks-vision`、`zustand`、`antd-style`
