from __future__ import annotations

from typing import Any, Dict

from common import db_get, db_update, openclaw, require_fields


ACTION_POINTS = {
    "login": 2,
    "complete_exam": 20,
    "finish_review": 15,
    "ask_tutor": 10,
    "post_wish": 3,
    "write_diary": 5,
}


@openclaw.skill(name="award_points")
def award_points(payload: Dict[str, Any]) -> Dict[str, Any]:
    require_fields(payload, "user_id", "action")

    default_points = 0 if payload["action"] == "redeem" else ACTION_POINTS.get(payload["action"], 5)
    points = int(payload.get("points", default_points))

    db_update(
        "users",
        {"_id": payload["user_id"]},
        {"$inc": {"points": points}},
    )

    result: Dict[str, Any] = {
        "action": payload["action"],
        "points_awarded": points,
        "redeemed": False,
    }

    redeem_cost = payload.get("redeem_cost")
    if redeem_cost is not None:
        redeem_cost = int(redeem_cost)
        user = db_get("users", {"_id": payload["user_id"]}) or {}
        current_points = int(user.get("points", 0))
        if current_points >= redeem_cost:
            db_update(
                "users",
                {"_id": payload["user_id"]},
                {"$inc": {"points": -redeem_cost}},
            )
            result["redeemed"] = True
            result["redeem_cost"] = redeem_cost
        else:
            result["redeemed"] = False
            result["reason"] = "insufficient_points"

    latest_user = db_get("users", {"_id": payload["user_id"]}) or {}
    result["current_points"] = int(latest_user.get("points", 0))

    return result
