# HCI AI 面试助手

[English](README-en.md)

AI 辅助面试 MVP，覆盖招聘方配置、候选人面试间、实时观察信号、语音分析、参考答案辅助、视频回看，以及可审计的面试报告。

本项目坚持 evidence-first：系统记录问题、回答、时间、语音/视频观察信号、关键帧和事件日志，辅助人工复核。系统不会自动给出录用或不录用决策。

## 产品范围

当前面向用户的主要流程：

- 招聘方面板：`/recruiter`
- 招聘方配置：`/recruiter/setup`
- 候选人面试间：`/interview/{sessionId}`
- 面试报告：`/report/{sessionId}`

主要能力：

- 基于 Supabase Auth 的招聘方注册和登录。
- 招聘方准备流程：上传简历、MinerU 解析、LLM 追问、报告可见性控制、创建面试链接。
- 快速本地 QA 用的 mock session 创建，无需简历解析。
- 基于简历、岗位描述和面试目标生成结构化面试问题。
- 候选人面试间：数字人面试官头像、浏览器 TTS 提问、字幕、手动回答兜底，以及可选 ASR。
- 使用 MediaPipe Tasks Vision 静态资源和 canvas 质量/活动代理信号做浏览器端实时摄像头观察。
- 浏览器音频切片语音分析和服务端聚合。
- 视频录制上传、ffmpeg WebM 元数据修复、报告页视频播放、时间线跳转和关键帧复核。
- Markdown/web 报告生成，包含软技能雷达、问答时间线、参考答案辅助、关键帧、视频回放和可下载报告内容。

MVP 暂不包含：

- 屏幕共享和 OCR。
- 高精度人脸识别或身份核验。
- 基于敏感属性、健康、人格或情绪的推断。
- 全自动评分或录用/不录用决策。

## 技术栈

- 后端：Python 3.12、标准库 HTTP server、`uv`、`unittest`。
- 认证/数据库：Supabase Auth 和 Supabase Postgres。
- LLM：OpenAI 兼容 Chat Completions API。
- 简历解析：MinerU API/client 集成。
- ASR：DashScope Qwen 实时 ASR WebSocket 服务，浏览器 Web Speech 作为兜底。
- 前端：TypeScript、React 19、Vite 8、Ant Design 6、Zustand、Recharts。
- 浏览器媒体：`getUserMedia`、MediaRecorder、Web Speech API、Canvas、MediaPipe Tasks Vision。
- 视频存储/修复：Supabase storage 路径支持，以及后端 `ffmpeg` WebM remux。
- 容器：Docker/Podman，多阶段前端镜像，Python 后端镜像。
- 生产托管：Render Blueprint。
  - Backend 和 ASR 是 Render image web service，使用 GHCR `:main` 镜像。
  - Frontend 是 Render Static Site，从 `frontend/dist` 构建。

## 快速开始

先复制环境配置：

```bash
cp .env.example .env
```

启动完整本地栈：

```bash
./compose.sh up
```

常用地址：

- 前端：`http://127.0.0.1:5173`
- 后端健康检查：`http://127.0.0.1:8000/api/health`
- ASR WebSocket：`ws://127.0.0.1:9785/`

停止服务：

```bash
./compose.sh down
```

查看日志：

```bash
./compose.sh logs
./compose.sh logs backend
./compose.sh logs frontend
./compose.sh logs asr
```

`compose.sh` 会优先自动检测 `podman`，其次使用 `docker`。如果要强制使用 Docker：

```bash
COMPOSE_BIN=docker ./compose.sh up
```

## 不使用 Compose 的本地开发

后端：

```bash
uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

ASR：

```bash
DASHSCOPE_API_KEY=... uv run python -m backend.asr.qwen_realtime --host 127.0.0.1 --port 8765
```

前端：

```bash
cd frontend
pnpm install
pnpm dev
```

Vite dev server 会在提供 `VITE_API_BASE_URL` 时使用该值。Compose/dev 默认指向 `http://127.0.0.1:8000` 后端。

## 面部分析资源

面部分析需要生成以下静态资源：

- `frontend/public/models/face_landmarker.task`
- `frontend/public/mediapipe/wasm/*`

这些文件是生成的第三方二进制资源，因此不提交到 Git。运行以下命令会自动准备：

```bash
pnpm --dir frontend build
```

开发模式下，`./compose.sh up` 也会在容器启动前检查并准备这些资源。如需直接执行：

```bash
scripts/setup_face_assets.sh
```

生产构建把这些资源视为必需项。如果模型或 WASM runtime 无法准备，前端构建应失败，避免部署损坏页面。

## 环境变量

生产认证/数据库必需项：

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
REQUIRE_AUTH=true
VITE_REQUIRE_AUTH=true
```

LLM：

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

MinerU：

```bash
MINERU_API_TOKEN=...
MINERU_TIMEOUT_SEC=300
```

设置 `MINERU_API_TOKEN` 时，简历解析使用 MinerU Precision API。未设置时，后端回退到 MinerU Agent API；已废弃的 `MINERU_COMMAND` CLI 路径只在显式配置时使用。

ASR：

```bash
DASHSCOPE_API_KEY=...
VITE_ASR_PROVIDER=qwen
VITE_ASR_WS_URL=ws://127.0.0.1:9785/
ASR_WS_HOST=0.0.0.0
ASR_WS_PORT=8765
INTERVIEW_FILLER_WORDS=嗯,啊,呃,额,那个,就是,然后,um,uh,erm
VITE_INTERVIEW_FILLER_WORDS=嗯,啊,呃,额,那个,就是,然后,um,uh,erm
```

Compose 会把宿主机端口 `9785` 映射到 ASR 服务端口 `8765`。如果不使用 Compose、直接运行 ASR 服务，请给前端设置：

```bash
VITE_ASR_WS_URL=ws://127.0.0.1:8765/
```

面试 session 会从简历、岗位描述、面试目标、岗位和问题文本中生成 ASR 上下文词。前端把这些词传给 ASR WebSocket，Qwen ASR 代理再作为 session `corpus_text` 转发，用于提升 `RAG`、`TypeScript`、`LiveKit` 以及中文领域词等技术名词的识别效果。

生成的词会持久化到 `interview_sessions.asr_context_terms`。生产环境依赖该字段前，请先执行数据库迁移。

LiveKit：

```bash
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

前端构建期变量必须在 `pnpm build` 之前可用，因为 Vite 会把 `VITE_*` 值嵌入静态 bundle。

## API 接口

公开接口：

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

当 `REQUIRE_AUTH=true` 时需要认证：

- `GET /api/auth/me`
- `POST /api/prep-sessions/resume`
- `POST /api/prep-sessions/{id}/followups`
- `POST /api/prep-sessions/{id}/interview-session`
- `POST /api/sessions`
- `GET /api/sessions/{id}`
- `POST /api/sessions/{id}/answers`
- `POST /api/sessions/{id}/help`
- `POST /api/sessions/{id}/speech-chunks`
- `POST /api/sessions/{id}/video-events`
- `POST /api/sessions/{id}/video`
- `GET /api/sessions/{id}/video`
- `POST /api/sessions/{id}/livekit-token`
- `GET /api/sessions/{id}/report?viewer=recruiter|candidate`
- `POST /api/mock-session`

受保护接口使用：

```text
Authorization: Bearer <access_token>
```

## 测试

运行标准测试脚本：

```bash
scripts/test.sh
```

常用聚焦检查：

```bash
uv run python -m unittest discover -s backend/tests
CI=true pnpm --dir frontend test
CI=true pnpm --dir frontend build
```

功能 API 测试，需要后端已启动：

```bash
uv run python -m unittest backend.tests.test_functional -v
```

完整面试流程浏览器测试使用项目 `/interview-e2e-testing` skill，需要开发栈已启动，并且 `mock-resumes/` 中有 PDF 简历。

## Mock 简历

生成本地 mock 简历：

```bash
uv run python scripts/generate_mock_resumes.py
```

生成文件会写入被忽略的 `mock-resumes/` 目录。

不接真实 MinerU 测试简历上传：

```bash
MINERU_COMMAND="$PWD/scripts/mock_mineru_open_api.py" \
  uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

## Docker / Podman

开发模式：

```bash
./compose.sh up
```

类生产本地模式：

```bash
./compose.sh prod
```

等价原生命令：

```bash
docker compose up -d --build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
podman compose up -d --build
podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

服务端口：

| 服务 | 默认地址 | 覆盖变量 |
|---|---|---|
| Backend API | `http://127.0.0.1:8000` | `BACKEND_PORT` |
| Frontend | `http://127.0.0.1:5173` | `FRONTEND_PORT` |
| ASR WebSocket | `ws://127.0.0.1:9785/` | `ASR_PORT` |

## 生产部署

生产部署由 `render.yaml` 描述。

Render 资源：

- `hci-ai-interview-backend`：image web service，新加坡区域，使用 GHCR backend `:main` 镜像。
- `hci-ai-interview-asr`：image web service，新加坡区域，使用同一个 backend 镜像并覆盖 ASR 启动命令。
- `hci-ai-interview-frontend`：static site，从 `frontend/dist` 构建。

重要 Render 配置：

- `.github/workflows/package-images.yml` 会在 `main` 上发布 GHCR 镜像。
- 镜像发布成功后，同一个 workflow 会通过 GitHub Secrets 中的 Render Deploy Hook 触发 image 服务重拉镜像：
  - `RENDER_BACKEND_DEPLOY_HOOK_URL`：`hci-ai-interview-backend` 的 Deploy Hook URL。
  - `RENDER_ASR_DEPLOY_HOOK_URL`：`hci-ai-interview-asr` 的 Deploy Hook URL。
- Backend/ASR 需要名为 `hci` 的 Render registry credential，并具备读取 GHCR package 的权限。
- 生产环境变量集中在 Render environment group `hci_env`。
- 将 `.env.prod` 作为 Render Secret File 上传到 `hci_env`。
- Python image 服务会加载 `/etc/secrets/.env.prod`。
- 静态前端构建会在运行 `pnpm build` 前 export `/etc/secrets/.env.prod`。

校验 Blueprint：

```bash
render blueprints validate render.yaml --output json
```

## 仓库结构

- `backend/interview/`：HTTP API、session 模型、问题生成、回答分析、配置和日志。
- `backend/auth/`：Supabase auth service 和 middleware。
- `backend/database/`：Supabase 持久化 repository 和 SQL migration。
- `backend/asr/`：DashScope 实时 ASR WebSocket 服务。
- `backend/speech_analysis/`：语音特征、聚合和音频分析。
- `backend/storage/`：视频上传/存储辅助和 WebM 元数据修复。
- `frontend/src/pages/`：招聘方、面试间、报告和 dashboard 页面。
- `frontend/src/pages/InterviewPage/hooks/`：面试状态、语音、视频录制和视频分析 hooks。
- `frontend/public/`：生成的面部分析资源和静态头像/视频资源。
- `spec/`：产品需求、实现说明和设计计划。
- `scripts/`：本地设置、测试、mock 简历和资源生成脚本。

## 产品护栏

- 结论必须绑定证据：问题文本、候选人回答、回答指标、视频/语音观察和事件日志。
- 摄像头和语音指标只作为观察信号，不作为能力判断。
- 不从非语言信号推断敏感属性、情绪、人格、健康或录用结果。
- 对短回答、缺失回答、不确定回答或低置信度回答保留人工复核路径。
- 除非项目策略改变，否则不要把生成的二进制资源提交到 Git。

## 规格文档

变更产品范围前先阅读：

- `spec/prd.md`
- `spec/goals.md`
- `spec/implementation-plan.md`
- `spec/problem-related-work-solution.md`
- `spec/digital-interviewer-meeting-experience.md`
- `spec/report-video-playback-fix-plan.md`
- `AGENTS.md`
