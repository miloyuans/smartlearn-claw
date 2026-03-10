from __future__ import annotations

from typing import Any, Dict

from common import db_insert, now_iso, openclaw, require_fields


@openclaw.skill(name="write_diary")
def write_diary(payload: Dict[str, Any]) -> Dict[str, Any]:
    require_fields(payload, "user_id", "entry")

    analysis = openclaw.llm_analyze(
        prompt=(
            "Analyze this learning diary entry, return strengths, obstacles, and next actions.\n"
            f"Entry: {payload['entry']}"
        )
    )

    db_insert(
        "diaries",
        {
            "user_id": payload["user_id"],
            "entry": payload["entry"],
            "analysis": analysis,
            "created_at": now_iso(),
        },
    )

    return {"saved": True, "suggestions": analysis}
