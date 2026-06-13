# HCI AI Interview Assistant

[中文](README.md)

AI-assisted interview MVP for recruiter setup, candidate interview rooms, realtime observation signals, speech analysis, answer help, video review, and auditable interview reports.

The project is intentionally evidence-first: it records questions, answers, timings, speech/video observation signals, keyframes, and event logs to help human reviewers. It does not produce automatic hire/no-hire decisions.

## Product Scope

Current user-facing flows:

- Recruiter dashboard: `/recruiter`
- Recruiter setup: `/recruiter/setup`
- Candidate interview room: `/interview/{sessionId}`
- Interview report: `/report/{sessionId}`

Main capabilities:

- Supabase Auth-backed recruiter registration/login.
- Recruiter preparation flow with resume upload, MinerU extraction, LLM follow-up questions, report visibility controls, and interview link creation.
- Mock session creation for quick local QA without resume parsing.
- Structured interview question generation from resume, job description, and interview goals.
- Candidate room with a digital interviewer avatar, browser TTS prompts, captions, manual answer fallback, and optional ASR.
- Realtime browser camera observation using MediaPipe Tasks Vision assets plus canvas-based quality/activity proxies.
- Speech analysis from browser audio chunks and server-side aggregation.
- Video recording upload, ffmpeg WebM metadata repair, report-page video playback, timeline seeking, and keyframe review.
- Markdown/web report generation with soft-skill radar, Q&A timeline, answer help, keyframes, video playback, and downloadable report content.

Out of scope for the MVP:

- Screen sharing and OCR.
- High-precision face recognition or identity verification.
- Sensitive-attribute, health, personality, or emotion inference.
- Fully automated scoring or hire/no-hire decisions.

## Tech Stack

- Backend: Python 3.12, standard-library HTTP server, `uv`, `unittest`.
- Auth/database: Supabase Auth and Supabase Postgres.
- LLM: OpenAI-compatible Chat Completions API.
- Resume extraction: MinerU API/client integration.
- ASR: DashScope Qwen realtime ASR WebSocket service, with browser Web Speech fallback.
- Frontend: TypeScript, React 19, Vite 8, Ant Design 6, Zustand, Recharts.
- Browser media: `getUserMedia`, MediaRecorder, Web Speech API, Canvas, MediaPipe Tasks Vision.
- Video storage/repair: Supabase storage path support plus backend `ffmpeg` WebM remuxing.
- Containers: Docker/Podman, multi-stage frontend image, Python backend image.
- Production hosting: Render Blueprint.
  - Backend and ASR are Render image web services using GHCR `:main` images.
  - Frontend is a Render Static Site built from `frontend/dist`.

## Quick Start

Copy environment configuration first:

```bash
cp .env.example .env
```

Then start the full local stack:

```bash
./compose.sh up
```

Useful URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:8000/api/health`
- ASR WebSocket: `ws://127.0.0.1:9785/`

Stop services:

```bash
./compose.sh down
```

View logs:

```bash
./compose.sh logs
./compose.sh logs backend
./compose.sh logs frontend
./compose.sh logs asr
```

`compose.sh` auto-detects `podman` first, then `docker`. Use `COMPOSE_BIN=docker ./compose.sh up` to force Docker.

## Local Development Without Compose

Backend:

```bash
uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

ASR:

```bash
DASHSCOPE_API_KEY=... uv run python -m backend.asr.qwen_realtime --host 127.0.0.1 --port 8765
```

Frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

The Vite dev server uses `VITE_API_BASE_URL` when provided. In compose/dev defaults, it points to the backend at `http://127.0.0.1:8000`.

## Face Analysis Assets

Face analysis needs generated static assets:

- `frontend/public/models/face_landmarker.task`
- `frontend/public/mediapipe/wasm/*`

These files are ignored by Git because they are generated third-party binaries. They are prepared automatically by:

```bash
pnpm --dir frontend build
```

For dev mode, `./compose.sh up` also checks and prepares the assets before starting containers. To run the setup directly:

```bash
scripts/setup_face_assets.sh
```

Production builds treat these assets as required. If the model or WASM runtime cannot be prepared, the frontend build should fail instead of deploying a broken page.

## Environment Variables

Required for production auth/database:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
REQUIRE_AUTH=true
VITE_REQUIRE_AUTH=true
```

LLM:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

MinerU:

```bash
MINERU_API_TOKEN=...
MINERU_TIMEOUT_SEC=300
```

When `MINERU_API_TOKEN` is set, resume extraction uses MinerU Precision API. Without it, the backend falls back to MinerU Agent API; the deprecated `MINERU_COMMAND` CLI path is only used when explicitly configured.

ASR:

```bash
DASHSCOPE_API_KEY=...
VITE_ASR_PROVIDER=qwen
VITE_ASR_WS_URL=ws://127.0.0.1:9785/
ASR_WS_HOST=0.0.0.0
ASR_WS_PORT=8765
INTERVIEW_FILLER_WORDS=嗯,啊,呃,额,那个,就是,然后,um,uh,erm
VITE_INTERVIEW_FILLER_WORDS=嗯,啊,呃,额,那个,就是,然后,um,uh,erm
```

Compose maps host port `9785` to the ASR service port `8765`. If you run the ASR service directly without Compose, set `VITE_ASR_WS_URL=ws://127.0.0.1:8765/` for the frontend.

Interview sessions generate ASR context terms from the resume, job description, interview goals, role, and question text. The frontend passes those terms to the ASR WebSocket, and the Qwen ASR proxy forwards them as session `corpus_text` to improve recognition of technical terms such as `RAG`, `TypeScript`, `LiveKit`, and domain-specific Chinese phrases.
The generated terms are persisted in `interview_sessions.asr_context_terms`; apply database migrations before relying on this field in production.

LiveKit:

```bash
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Frontend build-time variables must be available before `pnpm build` because Vite embeds `VITE_*` values into the static bundle.

## API Surface

Public:

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Protected when `REQUIRE_AUTH=true`:

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

Use `Authorization: Bearer <access_token>` for protected routes.

## Testing

Run the standard test script:

```bash
scripts/test.sh
```

Common focused checks:

```bash
uv run python -m unittest discover -s backend/tests
CI=true pnpm --dir frontend test
CI=true pnpm --dir frontend build
```

Functional API test, with backend already running:

```bash
uv run python -m unittest backend.tests.test_functional -v
```

For full interview-flow browser testing, use the project `/interview-e2e-testing` skill with the dev stack running and PDF resumes available in `mock-resumes/`.

## Mock Resumes

Generate local mock resumes:

```bash
uv run python scripts/generate_mock_resumes.py
```

Generated files are written under ignored `mock-resumes/`.

To test resume upload without real MinerU:

```bash
MINERU_COMMAND="$PWD/scripts/mock_mineru_open_api.py" \
  uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

## Docker / Podman

Development mode:

```bash
./compose.sh up
```

Production-like local mode:

```bash
./compose.sh prod
```

Raw compose equivalent:

```bash
docker compose up -d --build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
podman compose up -d --build
podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Service ports:

| Service | Default URL | Override |
|---|---|---|
| Backend API | `http://127.0.0.1:8000` | `BACKEND_PORT` |
| Frontend | `http://127.0.0.1:5173` | `FRONTEND_PORT` |
| ASR WebSocket | `ws://127.0.0.1:9785/` | `ASR_PORT` |

## Production Deployment

Production is described by `render.yaml`.

Render resources:

- `hci-ai-interview-backend`: image web service, Singapore, GHCR backend image `:main`.
- `hci-ai-interview-asr`: image web service, Singapore, same backend image with ASR command.
- `hci-ai-interview-frontend`: static site, built from `frontend/dist`.

Important Render setup:

- GHCR images are published by `.github/workflows/package-images.yml` on `main`.
- Backend/ASR need a Render registry credential named `hci` with GHCR package read access.
- Production environment is centralized in Render environment group `hci_env`.
- Upload `.env.prod` as a Render Secret File in `hci_env`.
- Python image services load `/etc/secrets/.env.prod`.
- The static frontend build exports `/etc/secrets/.env.prod` before running `pnpm build`.

Validate the Blueprint:

```bash
render blueprints validate render.yaml --output json
```

## Repository Map

- `backend/interview/`: HTTP API, session model, question generation, answer analysis, config, logging.
- `backend/auth/`: Supabase auth service and middleware.
- `backend/database/`: Supabase persistence repositories and SQL migrations.
- `backend/asr/`: DashScope realtime ASR WebSocket service.
- `backend/speech_analysis/`: speech features, aggregation, and audio analysis.
- `backend/storage/`: video upload/storage helpers and WebM metadata repair.
- `frontend/src/pages/`: recruiter, interview, report, and dashboard pages.
- `frontend/src/pages/InterviewPage/hooks/`: interview state, speech, video recording, and video analysis hooks.
- `frontend/public/`: generated face-analysis assets and static avatar/video assets.
- `spec/`: product requirements, implementation notes, and design plans.
- `scripts/`: local setup, testing, mock resume, and generated asset helpers.

## Product Guardrails

- Keep conclusions tied to evidence: question text, candidate answer, answer metrics, video/speech observations, and event logs.
- Treat camera and speech metrics as observation signals, not capability judgments.
- Do not infer sensitive attributes, emotion, personality, health, or hiring outcome from non-language signals.
- Preserve human review paths for short, missing, uncertain, or low-confidence answers.
- Keep generated binary assets out of Git unless the project policy changes.

## Specs

Read these before changing product scope:

- `spec/prd.md`
- `spec/goals.md`
- `spec/implementation-plan.md`
- `spec/problem-related-work-solution.md`
- `spec/digital-interviewer-meeting-experience.md`
- `spec/report-video-playback-fix-plan.md`
- `AGENTS.md`
