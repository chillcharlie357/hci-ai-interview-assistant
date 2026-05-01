# AGENTS.md

## Project Direction

This project is an AI-assisted interview MVP. The first product slice is a minimal interview question-and-answer loop:

- Parse resume summary, job description, and interview goals.
- Generate structured interview questions.
- Let a digital interviewer ask questions one by one.
- Record candidate answers and basic answer metrics.
- Generate an auditable interview summary.

Do not expand MVP scope into video analysis, screen sharing, OCR, facial analysis, gaze analysis, or automatic hiring decisions unless the spec is updated first.

## Tech Stack

- Core/backend logic: Python.
- Frontend UI: TypeScript.
- Spec documents: Markdown under `spec/`.
- Current JS prototype files are historical scaffolding and should not guide new implementation choices.

## Spec-Driven Development

- Read `spec/prd.md`, `spec/goals.md`, `spec/implementation-plan.md`, and `spec/problem-related-work-solution.md` before implementing features.
- If product scope changes, update `spec/` first.
- Keep implementation aligned with the MVP: question generation, digital interviewer prompt flow, answer recording, and report generation.

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
- Preserve human review paths for short, missing, or uncertain answers.
- Avoid collecting or inferring sensitive attributes.

## Code Style

- Prefer small, focused modules.
- Keep domain objects explicit: question, answer, session, event, report.
- Avoid adding frameworks or external services until the MVP loop works locally.
- Add comments only when they clarify non-obvious logic.
