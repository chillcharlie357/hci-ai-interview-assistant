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

Optional OpenAI-compatible LLM configuration lives in `.env`:

```bash
cp .env.example .env
```

Fill in `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` in `.env`. Do not commit `.env`.
For resume extraction and video meetings, also configure:

```bash
UV_DEFAULT_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple
MINERU_COMMAND=mineru-open-api
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

If the API key or model is missing, the app uses fallback logic and returns `llm_status: "fallback"`.

## Docker Compose

```bash
docker compose up --build
```

Exposed ports:

- API: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## Run Backend API Manually

```bash
uv run python -m backend.interview.api --host 127.0.0.1 --port 8000
```

Useful API endpoints:

- `POST /api/sessions`: create an interview session from candidate, resume, JD, and goal inputs.
- `POST /api/prep-sessions/resume`: upload a PDF/DOCX/image resume for MinerU extraction.
- `POST /api/prep-sessions/{id}/followups`: submit recruiter answers to LLM role follow-up questions.
- `POST /api/prep-sessions/{id}/interview-session`: generate the candidate interview session.
- `GET /api/sessions/{id}`: fetch an in-memory session.
- `POST /api/sessions/{id}/livekit-token`: create a LiveKit participant token.
- `GET /api/sessions/{id}/report?viewer=recruiter|candidate`: fetch report with visibility enforcement.
- `POST /api/sessions/{id}/video-events`: record a browser-side camera observation event and optional in-memory keyframe.
- `POST /api/sessions/{id}/answers`: record the current answer and return the updated session plus Markdown report.

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

## Spec

Read the spec documents before changing product scope:

- `spec/prd.md`
- `spec/goals.md`
- `spec/implementation-plan.md`
- `spec/problem-related-work-solution.md`
- `AGENTS.md`
