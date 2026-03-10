from __future__ import annotations

from typing import Any, Dict

from common import db_update, openclaw, require_fields


@openclaw.skill(name="tutor_subject")
def tutor_subject(payload: Dict[str, Any]) -> Dict[str, Any]:
    require_fields(payload, "user_id", "question")

    context = payload.get("context", "")
    model = payload.get("model", "deepseek-v3")

    prompt = (
        "You are a patient K-12 tutor. Provide step-by-step guidance, ask one reflective "
        "question, and keep explanations age-appropriate.\n"
        f"Question: {payload['question']}\n"
        f"Context: {context}"
    )

    response = openclaw.llm_generate(prompt=prompt, model=model)

    db_update(
        "users",
        {"_id": payload["user_id"]},
        {"$inc": {"points": 10}},
    )

    return {"response": response, "points_awarded": 10}
