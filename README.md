# HCI AI Interview Assistant

AI-assisted interview MVP for structured question generation, digital interviewer prompts, answer capture, realtime observation signals, and auditable interview summaries.

## Scope

The MVP focuses on the smallest useful interview loop:

1. Enter candidate profile, resume summary, job description, and interview goals.
2. Generate structured interview questions.
3. Ask questions through a digital interviewer UI.
4. Record candidate answers and basic metrics.
5. Optionally observe browser-side camera quality/activity signals and in-memory keyframes.
6. Generate a Markdown interview summary tied back to questions, answers, events, and observation signals.

The MVP intentionally does not implement screen sharing, OCR, high-precision facial recognition, sensitive-attribute inference, or automatic hire/no-hire decisions. Camera-derived metrics are observation signals for human review only.

## Tech Stack

- Backend/core logic: Python standard library.
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

Optional OpenAI-compatible LLM environment:

```bash
export OPENAI_API_KEY="..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4.1-mini"
```

If the API key or model is missing, the app uses rule-based fallback and returns `llm_status: "fallback"`.

## Docker Compose

```bash
docker compose up --build
```

Exposed ports:

- API: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## Run Backend API Manually

```bash
python3 -m backend.interview.api --host 127.0.0.1 --port 8000
```

Useful API endpoints:

- `POST /api/sessions`: create an interview session from candidate, resume, JD, and goal inputs.
- `GET /api/sessions/{id}`: fetch an in-memory session.
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
