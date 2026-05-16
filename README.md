# HCI AI Interview Assistant

AI-assisted interview MVP for structured question generation, digital interviewer prompts, answer capture, realtime observation signals, and auditable interview summaries.

## Scope

The MVP now has two user-facing entry points:

- Recruiter: `http://localhost:5173/recruiter`
- Candidate interview room: `http://localhost:5173/interview/{sessionId}`

The recruiter uploads a resume, answers LLM follow-up questions about the role, configures report visibility, then creates an interview link. The candidate joins a LiveKit video room, hears the digital interviewer prompt, answers by browser speech-to-text or manual text fallback, and submits answers into the existing report flow.

The MVP intentionally does not implement screen sharing, OCR, high-precision facial recognition, sensitive-attribute inference, or automatic hire/no-hire decisions. Camera-derived metrics are observation signals for human review only.

## Tech Stack

- Backend/core logic: Python standard library managed by `uv`.
- Frontend UI: TypeScript + React + Vite.
- Browser video analysis: `getUserMedia`, Canvas metrics, optional MediaPipe Tasks Vision dependency.
- LLM: OpenAI-compatible Chat Completions format.
- Tests: Python `unittest`, frontend `vitest`.

## One-Click Local Run

### 首选：Docker/Podman Compose（推荐）

```bash
./compose.sh up       # 开发模式（源码热重载）
./compose.sh prod     # 生产模式（nginx 部署）
./compose.sh down     # 关闭所有服务
```

自动检测 podman 或 docker，支持 `COMPOSE_BIN=docker ./compose.sh up` 强制指定。详见下方 Docker/Podman Compose 章节。

### 本地开发调试（直接启动 API + 前端）

```bash
# 终端 1：后端
uv run python -m backend.interview.api --host 127.0.0.1 --port 8000

# 终端 2：前端
cd frontend && pnpm install && pnpm dev
```

> `scripts/dev.sh` 已不再维护，请使用上述方式或 Docker/Podman Compose。

```bash
cp .env.example .env
```

### Required: Supabase Authentication

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 用于后端直接操作数据库，绕过 RLS
REQUIRE_AUTH=true
VITE_REQUIRE_AUTH=true
```

Get these values from Supabase Dashboard → Settings → API. Service role key 让后端用单一权限客户端操作数据库，应用层做 user_id 隔离。

### Optional: LLM Configuration

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
```

### Optional: Other Services

```bash
UV_DEFAULT_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple
MINERU_COMMAND=mineru-open-api
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

### Optional: ASR (语音识别)

```bash
VITE_ASR_WS_URL=ws://127.0.0.1:8765/
VITE_ASR_PROVIDER=qwen          # qwen 或 webspeech
ASR_WS_HOST=0.0.0.0
ASR_WS_PORT=8765
```

ASR 服务使用阿里云 DashScope（qwen）实时语音识别，通过 WebSocket 与后端通信。未配置时前端自动降级到浏览器内置 Web Speech API。

If the API key or model is missing, the app uses fallback logic and returns `llm_status: "fallback"`.

## Docker / Podman Compose

支持 `docker compose` 和 `podman compose`，跨平台（Windows / macOS / Linux）。

### 一键启动 / 关闭

使用 `compose.sh` 自动检测 podman 或 docker，无需记忆 compose 参数：

```bash
# 启动开发模式（默认，前端 Vite HMR + 后端 watchfiles 热重载）
./compose.sh up

# 启动生产模式（nginx 静态服务）
./compose.sh prod

# 关闭所有服务
./compose.sh down
```

支持环境变量 `COMPOSE_BIN` 手动指定编排工具：`COMPOSE_BIN=docker ./compose.sh up`。

### 模式对比

| 特性 | 生产模式 (`prod`) | 开发模式 (`dev`) |
|---|---|---|
| 前端构建 | `pnpm build` → nginx:alpine | `pnpm dev` (Vite HMR) |
| 后端热重载 | ❌ | ✅ (watchfiles) |
| 前端热重载 | ❌ | ✅ (Vite HMR + 源码挂载) |
| 镜像体积 | 小（nginx alpine ~10MB） | 大（node:22-slim + deps） |
| 环境变量 | 构建时注入 (VITE_*) | 运行时注入 |
| DEBUG | false | true |

### 端口

| 服务 | 端口 | 说明 |
|---|---|---|
| 后端 API | `http://localhost:8000` | 可通过 `BACKEND_PORT` 自定义 |
| 前端 | `http://localhost:5173` | 可通过 `FRONTEND_PORT` 自定义 |
| ASR WebSocket | `ws://localhost:9785` | 可通过 `ASR_PORT` 自定义 |

## Run Backend API Manually

```bash
uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

Useful API endpoints:

### Authentication (public)

- `POST /api/auth/register`: register a new user (email, password, full_name).
- `POST /api/auth/login`: login with email and password.
- `POST /api/auth/refresh`: refresh access token.
- `POST /api/auth/logout`: logout (clears server session).

### Authentication (protected)

- `GET /api/auth/me`: get current user info.

### Interview Sessions (protected)

- `POST /api/sessions`: create an interview session from candidate, resume, JD, and goal inputs.
- `POST /api/prep-sessions/resume`: upload a PDF/DOCX/image resume for MinerU extraction.
- `POST /api/prep-sessions/{id}/followups`: submit recruiter answers to LLM role follow-up questions.
- `POST /api/prep-sessions/{id}/interview-session`: generate the candidate interview session.
- `GET /api/sessions/{id}`: fetch a session.
- `POST /api/sessions/{id}/livekit-token`: create a LiveKit participant token.
- `GET /api/sessions/{id}/report?viewer=recruiter|candidate`: fetch report with visibility enforcement.
- `POST /api/sessions/{id}/video-events`: record a browser-side camera observation event and optional in-memory keyframe.
- `POST /api/sessions/{id}/answers`: record the current answer and return the updated session plus Markdown report.
- `POST /api/sessions/{id}/speech-chunks`: submit an audio chunk for server-side speech analysis.
- `POST /api/mock-session`: quickly create a test interview with pre-built mock data (templates: frontend/backend/ai/pm).

Note: When `REQUIRE_AUTH=true`, all session endpoints require a valid JWT token in the `Authorization: Bearer <token>` header.

## Run Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000`. Set `VITE_API_BASE_URL` in `.env` to override (Docker 环境自动注入，本地开发留空即可走 proxy)。

## Tests

```bash
scripts/test.sh         # Python 单元测试 + 脚本测试 + 前端测试 + 构建
```

### 功能测试（真实 HTTP 请求，后端需运行中）

```bash
uv run python -m unittest backend.tests.test_functional -v
```

测试 20 项核心功能：健康端点、真实 MinerU 简历解析、Followup、Session 生命周期、完整 6 题答题 + 报告、错误处理。后端未运行时自动跳过。

### Playwright E2E 全流程测试

Run the `/interview-e2e-testing` skill to automatically execute the full Playwright E2E test flow with mocked camera, microphone, TTS, STT, and MinerU. Prerequisites:
- Dev environment started (`./compose.sh up`)
- Playwright plugin loaded
- PDF resumes available in `mock-resumes/`

## Mock Resumes For Local QA

Generate disposable mock resumes for recruiter-flow testing:

```bash
python3 scripts/generate_mock_resumes.py
```

The generated files are written to ignored `mock-resumes/`. To test resume upload without installing MinerU, use the mock extractor:

```bash
# 本地开发调试（mock MinerU）
MINERU_COMMAND="$PWD/scripts/mock_mineru_open_api.py" uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

## Spec

Read the spec documents before changing product scope:

- `spec/prd.md` — product requirements, data structures, acceptance criteria
- `spec/goals.md` — MVP goals, scope boundaries, non-goals
- `spec/implementation-plan.md` — phased implementation plan
- `spec/problem-related-work-solution.md` — problem analysis, competitive landscape, design principles
- `spec/evaluation-metrics.md` — evaluation dimensions, metric reference ranges, data flow design
- `spec/frontend-quality-plan.md` — frontend quality improvement plan (completed)
- `AGENTS.md` — project direction, product guardrails, coding conventions
