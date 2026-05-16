# AGENTS.md

## Project Direction

This project is an AI-assisted interview MVP. The first product slice is a minimal interview question-and-answer loop:

- Parse resume summary, job description, and interview goals.
- Generate structured interview questions.
- Let a digital interviewer ask questions one by one.
- Record candidate answers and basic answer metrics.
- Record browser-side realtime camera observation signals for the candidate when explicitly enabled.
- Generate an auditable interview summary.
- Split user flows into recruiter configuration and candidate interview room when the feature requires different permissions or visibility.

Current MVP scope includes lightweight browser-side camera metrics and in-memory keyframes. Do not expand into screen sharing, OCR, high-precision facial recognition, sensitive-attribute inference, or automatic hiring decisions unless the spec is updated first.

## Tech Stack

- Core/backend logic: Python.
- Frontend UI: TypeScript.
- Spec documents: Markdown under `spec/`.
- Local secrets and model endpoints: `.env`; commit only `.env.example`.
- Resume extraction uses MinerU CLI. Treat uploaded source files as temporary only.
- Candidate interview room uses LiveKit when configured; keep text fallback for unavailable browser/meeting capabilities.
- Do not add root-level JavaScript prototypes; frontend code belongs under `frontend/`.
- Docker/Podman for containerization; multi-stage builds (dev → builder → nginx prod).

## Docker / Podman

### Start

```bash
# Production (nginx static serve, optimized image)
docker compose up -d --build
podman compose up -d --build

# Development (hot reload: watchfiles + Vite HMR)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### Stop

```bash
docker compose down
podman compose down
```

### Architecture

- **Dockerfile.backend**: Python 3.12-slim, uv sync分层缓存, mineru CLI
- **Dockerfile.frontend**: 三阶段构建
  - `dev` → node:22-slim + pnpm dev (开发热重载)
  - `builder` → pnpm build (VITE_* 构建时注入)
  - `prod` → nginx:alpine (静态服务, ~10MB)
- **docker-compose.yml**: 生产模式，backend:8000 + nginx:80→5173 + asr:9785
- **docker-compose.dev.yml**: 开发覆盖，全量源码挂载 + watchfiles + HMR

All Dockerfiles are at project root. `.dockerignore` excludes node_modules, .git, .env, etc.

## Spec-Driven Development

- Read `spec/prd.md`, `spec/goals.md`, `spec/implementation-plan.md`, and `spec/problem-related-work-solution.md` before implementing features.
- If product scope changes, update `spec/` first.
- Keep implementation aligned with the MVP: question generation, digital interviewer prompt flow, answer recording, realtime observation signals, and report generation.

## Git Workflow

- Do not develop directly on `main`.
- Before changing files, start from `main` and create a focused feature branch.
- Use normal `git` feature branches from `main`.
- One feature per branch where practical.
- Complete implementation and verification on the feature branch first.
- Run relevant tests on the feature branch before merging.
- Merge completed branches back to `main` with `--no-ff`.
- Keep `main` pushable and clean.
- After merging to `main`, push `main` only when the merge has been verified.

## Project Skills

Project-level skills are available under `.claude/skills/` and can be invoked via `/skill-name`:

- **`interview-e2e-testing`** — Playwright-based E2E test of the complete interview flow: resume upload (PDF) → LLM question generation → candidate interview (6 Q&A) → report page.

## Mock Resumes

- `mock-resumes/` contains pre-generated PDF resumes for testing (4 candidates: frontend, backend, ML engineer, AI product manager).
- Run `scripts/generate_mock_resumes.py` to regenerate both PDF and source markdown files.
- MinerU only supports PDF reliably; DOCX files time out on the cloud-based API.

## Testing Rules

- Write tests before production code for new behavior.
- Python core logic should have unit tests.
- TypeScript UI data flow should have focused tests.
- Do not claim work is complete until tests have been run and results are known.

## Observability & Logging

The project has a structured observability layer designed for agent-parsable log output. All new features should use the shared logging infrastructure rather than `print()` or `console.info()`.

### Backend Logging

- **Config**: `backend/interview/logging_config.py` — call `configure_logging()` once at startup.
- **Logger names**: Use `logging.getLogger("backend.<component>")`:
  - `backend.http` — HTTP requests/responses (api.py)
  - `backend.db` — Database operations (session_repo.py, prep_session_repo.py)
  - `backend.startup` — Application startup events (handled by `backend.http`)
- **Log format**: `%(asctime)s [%(levelname)-7s] [%(name)s] %(message)s`
  ```
  2026-05-16 10:30:15 [INFO   ] [backend.http] GET /api/sessions -> 200 (42ms)
  2026-05-16 10:30:16 [WARNING] [backend.db] save_session: user_id='xyz' not valid UUID
  ```
- **Level control**: `LOG_LEVEL` env var (DEBUG, INFO, WARNING, ERROR). Default: INFO.
- **Health endpoint**: `GET /api/health` returns component status, LLM config, and runtime metrics. It is a public route (no auth required). Add it to `_is_public_auth_route()` if new public routes are added.
- **Rule**: Always use `log.info()`, `log.warning()`, `log.exception()` instead of `print()`, `traceback.print_exc()`, or custom `_dbg()` wrappers. The `_dbg()` function has been removed — use the real logging system.

### Frontend Logging

- **Config**: `frontend/src/logger.ts` — call `createLogger("<component>")` to get a logger.
- **Console prefix**: `[HCI:<component>]` for easy filtering in browser DevTools.
- **Level control**: `VITE_LOG_LEVEL` env var (debug, info, warn, error). Default: info.
- **Usage patterns**:
  - `createLogger("api")` — API request logging (in apiClient.ts)
  - `createLogger("app")` — App startup logging (in main.tsx)
  - `createLogger("error-boundary")` — React render error logging
- **Rule**: Use the logger in all new code instead of `console.log()`, `console.info()`, etc. Exception: `console.error()` remains acceptable for critical errors.

### Docker Logging

- All three services (backend, asr, frontend) have JSON-file logging with max-size 10m and max-file 3.
- `restart: unless-stopped` is set on all services.
- Backend has a healthcheck using the `/api/health` endpoint.
- nginx in the frontend container uses JSON log format with `access_log` and `error_log` configured.

### Agent Log Inspection Commands

```bash
# View logs for all services
./compose.sh logs

# View logs for a specific service
./compose.sh logs backend
./compose.sh logs frontend

# Filter backend warnings/errors
./compose.sh logs backend | grep -E "\[WARNING\]|\[ERROR\]"

# Filter frontend API logs
docker logs hci-frontend-1 2>&1 | grep "\[HCI:api\]"

# Check health endpoint
curl http://localhost:8000/api/health | python -m json.tool
```

## Product Guardrails

- Keep conclusions tied to evidence: question text, candidate answer, answer metrics, and event logs.
- Do not output hire/no-hire decisions.
- Treat answer duration, word count, and filler words as observation signals, not capability judgments.
- Prefer LLM-based answer text analysis when configured; fallback rules must be configurable and must not contain secrets.
- Treat camera-derived signals such as face presence, brightness, blur, gaze proxy, blink proxy, nod proxy, hand activity, body activity, and motion as observation signals only.
- Keyframes are kept in the active in-memory session by default. Do not write keyframes to disk or long-term storage unless the spec is updated and user consent is explicit.
- Reports must describe non-language signals with cautious wording such as "observed", "detected", "needs review", or "quality issue"; they must not infer personality, emotion, health, protected traits, or hiring outcome.
- Preserve human review paths for short, missing, or uncertain answers.
- Avoid collecting or inferring sensitive attributes.

## Code Style

- Prefer small, focused modules.
- Keep domain objects explicit: question, answer, session, event, report.
- Avoid adding frameworks or external services until the MVP loop works locally.
- Add comments only when they clarify non-obvious logic.
