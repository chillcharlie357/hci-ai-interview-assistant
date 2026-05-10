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

```bash
scripts/dev.sh
```

The script starts:

- API: `http://127.0.0.1:8000`
- Frontend: `http://localhost:5173`

Configuration lives in `.env`:

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

## Docker Compose

```bash
docker compose up --build
```

Exposed ports:

- API: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- ASR WebSocket: `ws://localhost:8765`

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
- `DELETE /api/sessions/{id}`: delete an interview session.
- `POST /api/mock-session`: quickly create a test interview with pre-built mock data (templates: frontend/backend/ai/pm).

Note: When `REQUIRE_AUTH=true`, all session endpoints require a valid JWT token in the `Authorization: Bearer <token>` header.

## Run Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend expects the backend API at `http://127.0.0.1:8000`.

## Tests

```bash
scripts/test.sh
```

Run the full browser E2E flow with mocked camera, microphone, TTS, STT, and MinerU:

```bash
scripts/e2e.sh
```

This starts the API and frontend with `INTERVIEW_DISABLE_DOTENV=1`, so it does not read local LLM or LiveKit secrets from `.env`. The test covers recruiter resume upload, role follow-up, generated question preview, candidate subtitle interview, Markdown report download, and report visibility enforcement. Screenshots and downloaded reports are written to `/private/tmp` by default.

## Mock Resumes For Local QA

Generate disposable mock resumes for recruiter-flow testing:

```bash
python3 scripts/generate_mock_resumes.py
```

The generated files are written to ignored `mock-resumes/`. To test resume upload without installing MinerU, start the app with the local mock extractor:

```bash
MINERU_COMMAND="$PWD/scripts/mock_mineru_open_api.py" scripts/dev.sh
```

## Spec

Read the spec documents before changing product scope:

- `spec/prd.md`
- `spec/goals.md`
- `spec/implementation-plan.md`
- `spec/problem-related-work-solution.md`
- `AGENTS.md`
