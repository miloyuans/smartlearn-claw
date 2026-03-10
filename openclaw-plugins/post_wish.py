from __future__ import annotations

from typing import Any, Dict

from common import db_insert, now_iso, openclaw, require_fields


@openclaw.skill(name="post_wish")
def post_wish(payload: Dict[str, Any]) -> Dict[str, Any]:
    require_fields(payload, "user_id", "wish")

    document = {
        "user_id": payload["user_id"],
        "wish": payload["wish"],
        "likes": 0,
        "created_at": now_iso(),
    }
    db_insert("wishes", document)

    encouragement = openclaw.llm_generate(
        prompt=(
            "Generate a short, positive encouragement message for a student wish.\n"
            f"Wish: {payload['wish']}"
        ),
        model=payload.get("model", "deepseek-v3"),
    )

    return {"posted": True, "encouragement": encouragement}
