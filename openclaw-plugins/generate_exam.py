from __future__ import annotations

from typing import Any, Dict

from common import openclaw, require_fields


@openclaw.skill(name="generate_exam")
def generate_exam(payload: Dict[str, Any]) -> Dict[str, Any]:
    require_fields(payload, "subject")

    difficulty = payload.get("difficulty", "medium")
    grade_level = payload.get("grade_level", "K-12")
    question_count = int(payload.get("question_count", 10))

    prompt = (
        "Create a mock exam in JSON format with fields: question, type, options, answer, reason.\n"
        f"Subject: {payload['subject']}\n"
        f"Difficulty: {difficulty}\n"
        f"Grade: {grade_level}\n"
        f"Question count: {question_count}"
    )

    questions = openclaw.llm_generate(prompt=prompt, model=payload.get("model", "deepseek-v3"))
    return {
        "subject": payload["subject"],
        "difficulty": difficulty,
        "question_count": question_count,
        "questions": questions,
    }
