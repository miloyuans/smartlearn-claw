from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import requests


try:
    import openclaw as _openclaw  # type: ignore
except ImportError:
    _openclaw = None


class _MemoryDB:
    def __init__(self) -> None:
        self._store: Dict[str, List[Dict[str, Any]]] = {}

    def insert(self, collection: str, document: Dict[str, Any]) -> Dict[str, Any]:
        self._store.setdefault(collection, []).append(document)
        return document

    def update(self, collection: str, query: Dict[str, Any], update_doc: Dict[str, Any]) -> int:
        count = 0
        for row in self._store.get(collection, []):
            if _matches(row, query):
                _apply_update(row, update_doc)
                count += 1
        return count

    def query(self, collection: str, query: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        query = query or {}
        return [row for row in self._store.get(collection, []) if _matches(row, query)]

    def get(self, collection: str, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for row in self._store.get(collection, []):
            if _matches(row, query):
                return row
        return None


def _matches(row: Dict[str, Any], query: Dict[str, Any]) -> bool:
    return all(row.get(key) == value for key, value in query.items())


def _apply_update(row: Dict[str, Any], update_doc: Dict[str, Any]) -> None:
    for op, payload in update_doc.items():
        if op == "$inc":
            for key, value in payload.items():
                row[key] = int(row.get(key, 0)) + int(value)
        elif op == "$set":
            for key, value in payload.items():
                row[key] = value


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 2:
            if lines[-1].strip() == "```":
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            return "\n".join(lines).strip()
    return cleaned


def _truncate(text: str, size: int) -> str:
    if len(text) <= size:
        return text
    return text[:size]


class _OpenClawMock:
    def __init__(self) -> None:
        self.db = _MemoryDB()
        self.provider = os.getenv("LLM_PROVIDER", "mock").strip().lower()
        self.default_model = os.getenv("QWEN_MODEL", os.getenv("MODEL", "qwen-plus")).strip() or "qwen-plus"
        self.qwen_api_key = os.getenv("QWEN_API_KEY", "").strip()
        base_url = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
        self.qwen_chat_url = f"{base_url.rstrip('/')}/chat/completions"
        self.timeout_seconds = int(os.getenv("LLM_TIMEOUT_SECONDS", "60"))

    @staticmethod
    def skill(name: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            setattr(func, "__skill_name__", name)
            return func

        return decorator

    @staticmethod
    def ocr_extract(file_path: str) -> str:
        try:
            raw = open(file_path, "rb").read()
        except OSError:
            return f"Mock OCR text from {file_path}"

        # Basic fallback extractor for txt/md/json uploads.
        for encoding in ("utf-8", "gbk", "latin-1"):
            try:
                text = raw.decode(encoding)
                return text[:20000]
            except UnicodeDecodeError:
                continue

        return f"Binary material uploaded: {file_path} ({len(raw)} bytes)"

    def _resolve_model(self, model: Optional[str]) -> str:
        if self.provider in {"qwen", "dashscope"}:
            if model and not model.lower().startswith("deepseek"):
                return model
            return self.default_model
        return model or self.default_model

    def _chat_completion(
        self,
        *,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: str = "You are a patient educational AI assistant.",
        temperature: float = 0.3,
        max_tokens: int = 1000,
    ) -> str:
        target_model = self._resolve_model(model)

        if self.provider in {"qwen", "dashscope"} and self.qwen_api_key:
            payload = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": _truncate(prompt, 16000)},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            headers = {
                "Authorization": f"Bearer {self.qwen_api_key}",
                "Content-Type": "application/json",
            }
            try:
                response = requests.post(
                    self.qwen_chat_url,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout_seconds,
                )
                response.raise_for_status()
                body = response.json()
                choices = body.get("choices") or []
                if choices:
                    message = choices[0].get("message") or {}
                    content = message.get("content")
                    if isinstance(content, str) and content.strip():
                        return content.strip()
                raise RuntimeError("Qwen response missing choices.message.content")
            except Exception as exc:
                return f"[qwen-error fallback] {exc}. Prompt excerpt: {_truncate(prompt, 220)}"

        # Default safe fallback for local development.
        return f"[mock:{target_model}] {_truncate(prompt, 320)}"

    def llm_summarize(self, text: str, prompt: str) -> Dict[str, Any]:
        instruction = (
            f"{prompt}\n\n"
            "Return strict JSON with keys: summary (string), tags (array of short strings), quiz (array of 3 short questions).\n"
            f"Source:\n{_truncate(text, 12000)}"
        )
        raw = self._chat_completion(
            prompt=instruction,
            system_prompt="You analyze educational materials for K-12 students.",
            temperature=0.2,
            max_tokens=900,
        )
        cleaned = _strip_code_fence(raw)
        try:
            parsed = json.loads(cleaned)
            summary = str(parsed.get("summary", "")).strip() or _truncate(raw, 800)
            tags = parsed.get("tags")
            quiz = parsed.get("quiz")
            if not isinstance(tags, list):
                tags = ["study", "smartlearn"]
            return {
                "summary": summary,
                "tags": [str(tag) for tag in tags][:10],
                "quiz": quiz if isinstance(quiz, list) else [],
                "excerpt": _truncate(text, 500),
            }
        except Exception:
            return {
                "summary": _truncate(raw, 800),
                "excerpt": _truncate(text, 500),
                "tags": ["study", "smartlearn"],
            }

    def llm_integrate(self, data: Any, prompt: str) -> Dict[str, Any]:
        raw = self._chat_completion(
            prompt=(
                f"{prompt}\n\n"
                "Integrate the following resource data into concise notes and action items for students:\n"
                f"{_truncate(json.dumps(data, ensure_ascii=False), 12000)}"
            ),
            system_prompt="You structure public educational resources into practical study notes.",
            temperature=0.2,
            max_tokens=900,
        )
        return {
            "summary": _truncate(raw, 1200),
            "integrated": data,
        }

    def llm_generate(self, prompt: str, model: str = "deepseek-v3") -> str:
        return self._chat_completion(
            prompt=prompt,
            model=model,
            system_prompt="You are an expert tutor. Be accurate, step-by-step, and encouraging.",
            temperature=0.4,
            max_tokens=1200,
        )

    def llm_analyze(self, prompt: str) -> Dict[str, Any]:
        raw = self._chat_completion(
            prompt=(
                "Analyze this diary entry and return strict JSON with keys: strengths (array), "
                "obstacles (array), next_actions (array of concise tasks).\n\n"
                f"{_truncate(prompt, 12000)}"
            ),
            system_prompt="You are a learning coach focusing on actionable advice.",
            temperature=0.2,
            max_tokens=800,
        )
        cleaned = _strip_code_fence(raw)
        try:
            parsed = json.loads(cleaned)
            return {
                "strengths": parsed.get("strengths", []),
                "obstacles": parsed.get("obstacles", []),
                "next_actions": parsed.get("next_actions", []),
                "raw": _truncate(raw, 1000),
            }
        except Exception:
            return {
                "insights": _truncate(raw, 1000),
                "raw": _truncate(raw, 1000),
            }


openclaw = _openclaw if _openclaw is not None else _OpenClawMock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_fields(payload: Dict[str, Any], *fields: str) -> None:
    missing = [name for name in fields if payload.get(name) in (None, "")]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")


def _has_real_method(obj: Any, method_name: str) -> bool:
    return callable(getattr(type(obj), method_name, None))


def _resolve_collection(db: Any, collection: str) -> Any:
    get_collection = getattr(db, "get_collection", None)
    if callable(get_collection):
        try:
            return get_collection(collection)
        except Exception:
            pass

    if hasattr(db, "__getitem__"):
        try:
            return db[collection]
        except Exception:
            return None

    return None


def db_insert(collection: str, document: Dict[str, Any]) -> Any:
    db = getattr(openclaw, "db", None)
    if db is None:
        raise RuntimeError("OpenClaw db is not available")

    coll = _resolve_collection(db, collection)
    if coll is not None and callable(getattr(coll, "insert_one", None)):
        return coll.insert_one(document)

    if _has_real_method(db, "insert"):
        return db.insert(collection, document)

    raise RuntimeError("Unsupported OpenClaw db insert interface")


def db_update(collection: str, query: Dict[str, Any], update_doc: Dict[str, Any]) -> Any:
    db = getattr(openclaw, "db", None)
    if db is None:
        raise RuntimeError("OpenClaw db is not available")

    coll = _resolve_collection(db, collection)
    if coll is not None and callable(getattr(coll, "update_many", None)):
        return coll.update_many(query, update_doc)

    if _has_real_method(db, "update"):
        return db.update(collection, query, update_doc)

    raise RuntimeError("Unsupported OpenClaw db update interface")


def db_query(collection: str, query: Optional[Dict[str, Any]] = None, limit: int = 0) -> List[Dict[str, Any]]:
    db = getattr(openclaw, "db", None)
    if db is None:
        raise RuntimeError("OpenClaw db is not available")

    query = query or {}

    coll = _resolve_collection(db, collection)
    if coll is not None and callable(getattr(coll, "find", None)):
        cursor = coll.find(query)
        if limit > 0 and hasattr(cursor, "limit"):
            cursor = cursor.limit(limit)
        return list(cursor)

    if _has_real_method(db, "query"):
        rows = db.query(collection, query)
        return rows[:limit] if limit > 0 else rows

    raise RuntimeError("Unsupported OpenClaw db query interface")


def db_get(collection: str, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    rows = db_query(collection, query, limit=1)
    if rows:
        return rows[0]
    return None
