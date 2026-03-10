from __future__ import annotations

from typing import Any, Dict

from common import db_query, openclaw, require_fields


@openclaw.skill(name="review_plan")
def review_plan(payload: Dict[str, Any]) -> Dict[str, Any]:
    require_fields(payload, "user_id", "subject")

    materials = db_query(
        "materials",
        {"user_id": payload["user_id"], "subject": payload["subject"]},
        limit=50,
    )

    prompt = (
        "Generate a 7-day review plan with daily goals, spaced repetition blocks, "
        "and one self-check question per day.\n"
        f"Subject: {payload['subject']}\n"
        f"History: {materials}"
    )

    plan = openclaw.llm_generate(prompt=prompt, model=payload.get("model", "deepseek-v3"))
    return {"plan": plan, "material_count": len(materials)}
