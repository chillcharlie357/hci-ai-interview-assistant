# HCI AI Interview Assistant

AI-assisted interview MVP for structured question generation, digital interviewer prompts, answer capture, and auditable interview summaries.

## Scope

The MVP focuses on the smallest useful interview loop:

1. Enter candidate profile, resume summary, job description, and interview goals.
2. Generate structured interview questions.
3. Ask questions through a digital interviewer UI.
4. Record candidate answers and basic metrics.
5. Generate a Markdown interview summary tied back to questions and answers.

The MVP intentionally does not implement video analysis, screen sharing, OCR, facial analysis, gaze analysis, or automatic hire/no-hire decisions.

## Tech Stack

- Backend/core logic: Python standard library.
- Frontend UI: TypeScript + React + Vite.
- Tests: Python `unittest`, frontend `vitest`.

## Run Backend API

```bash
python3 -m backend.interview.api --host 127.0.0.1 --port 8000
```

Useful API endpoints:

- `POST /api/sessions`: create an interview session from candidate, resume, JD, and goal inputs.
- `GET /api/sessions/{id}`: fetch an in-memory session.
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
python3 -m unittest discover -s backend/tests

cd frontend
pnpm test
pnpm build
```

## Spec

Read the spec documents before changing product scope:

- `spec/prd.md`
- `spec/goals.md`
- `spec/implementation-plan.md`
- `spec/problem-related-work-solution.md`
- `AGENTS.md`
