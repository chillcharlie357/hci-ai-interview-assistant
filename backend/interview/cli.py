from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.interview.question_engine import generate_interview_questions
from backend.interview.session import create_interview_session, generate_markdown_report, record_answer


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the AI-assisted interview MVP from a JSON payload.")
    parser.add_argument("input", type=Path, help="Path to a JSON file with candidate, resume, JD, goals, and answers.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    question_set = generate_interview_questions(
        resume=payload.get("resume", ""),
        job_description=payload.get("job_description", ""),
        interview_goal=payload.get("interview_goal", ""),
    )
    session = create_interview_session(
        candidate_name=payload.get("candidate_name", "候选人"),
        role=question_set.role,
        questions=question_set.questions,
    )

    for answer in payload.get("answers", []):
        session = record_answer(
            session,
            text=answer.get("text", ""),
            duration_sec=int(answer.get("duration_sec", 0)),
        )

    print(generate_markdown_report(session))


if __name__ == "__main__":
    main()
