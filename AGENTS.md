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

## Spec-Driven Development

- Read `spec/prd.md`, `spec/goals.md`, `spec/implementation-plan.md`, and `spec/problem-related-work-solution.md` before implementing features.
- If product scope changes, update `spec/` first.
- Keep implementation aligned with the MVP: question generation, digital interviewer prompt flow, answer recording, realtime observation signals, and report generation.

## Git Workflow

- Use normal `git` feature branches from `main`.
- One feature per branch where practical.
- Run relevant tests before merging.
- Merge completed branches back to `main` with `--no-ff`.
- Keep `main` pushable and clean.

## Testing Rules

- Write tests before production code for new behavior.
- Python core logic should have unit tests.
- TypeScript UI data flow should have focused tests.
- Do not claim work is complete until tests have been run and results are known.

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
