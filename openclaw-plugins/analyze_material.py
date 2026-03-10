from __future__ import annotations

from typing import Any, Dict

import requests

from common import db_insert, now_iso, openclaw, require_fields


@openclaw.skill(name="analyze_material")
def analyze_material(payload: Dict[str, Any]) -> Dict[str, Any]:
    require_fields(payload, "user_id")

    file_path = payload.get("file_path")
    query = payload.get("query")

    if file_path:
        raw_text = openclaw.ocr_extract(file_path)
        summary = openclaw.llm_summarize(
            raw_text,
            prompt=(
                "Extract educational concepts, infer subject and grade level, "
                "generate tags, and propose a short quiz."
            ),
        )
        source_type = "upload"
    elif query:
        search_payload: Dict[str, Any] = {"query": query, "results": []}
        try:
            resp = requests.get(
                "https://api.eduresource.com/search",
                params={"q": query},
                timeout=8,
            )
            if resp.ok:
                search_payload = resp.json()
        except requests.RequestException:
            pass

        summary = openclaw.llm_integrate(
            search_payload,
            prompt="Integrate educational resources into structured notes and checkpoints.",
        )
        source_type = "search"
    else:
        raise ValueError("Either file_path or query is required")

    document = {
        "user_id": payload["user_id"],
        "source_type": source_type,
        "subject": payload.get("subject", "general"),
        "content": summary,
        "created_at": now_iso(),
    }
    db_insert("materials", document)

    return {"status": "success", "data": summary}
