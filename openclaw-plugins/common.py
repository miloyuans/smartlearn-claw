from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional


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


class _OpenClawMock:
    def __init__(self) -> None:
        self.db = _MemoryDB()

    @staticmethod
    def skill(name: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            setattr(func, "__skill_name__", name)
            return func

        return decorator

    @staticmethod
    def ocr_extract(file_path: str) -> str:
        return f"Mock OCR text from {file_path}"

    @staticmethod
    def llm_summarize(text: str, prompt: str) -> Dict[str, Any]:
        return {
            "summary": f"{prompt[:80]}...",
            "excerpt": text[:500],
            "tags": ["study", "smartlearn"],
        }

    @staticmethod
    def llm_integrate(data: Any, prompt: str) -> Dict[str, Any]:
        return {
            "summary": f"{prompt[:80]}...",
            "integrated": data,
        }

    @staticmethod
    def llm_generate(prompt: str, model: str = "deepseek-v3") -> str:
        return f"[{model}] {prompt[:300]}"

    @staticmethod
    def llm_analyze(prompt: str) -> Dict[str, Any]:
        return {
            "insights": "Keep daily reflection concise and include one specific improvement action.",
            "raw": prompt[:300],
        }


openclaw = _openclaw if _openclaw is not None else _OpenClawMock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_fields(payload: Dict[str, Any], *fields: str) -> None:
    missing = [name for name in fields if payload.get(name) in (None, "")]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")


def _resolve_collection(db: Any, collection: str) -> Any:
    if hasattr(db, "collection") and callable(db.collection):
        return db.collection(collection)
    if hasattr(db, "__getitem__"):
        return db[collection]
    return None


def db_insert(collection: str, document: Dict[str, Any]) -> Any:
    db = getattr(openclaw, "db", None)
    if db is None:
        raise RuntimeError("OpenClaw db is not available")

    if hasattr(db, "insert") and callable(db.insert):
        return db.insert(collection, document)

    coll = _resolve_collection(db, collection)
    if coll is not None and hasattr(coll, "insert_one"):
        return coll.insert_one(document)

    raise RuntimeError("Unsupported OpenClaw db insert interface")


def db_update(collection: str, query: Dict[str, Any], update_doc: Dict[str, Any]) -> Any:
    db = getattr(openclaw, "db", None)
    if db is None:
        raise RuntimeError("OpenClaw db is not available")

    if hasattr(db, "update") and callable(db.update):
        return db.update(collection, query, update_doc)

    coll = _resolve_collection(db, collection)
    if coll is not None and hasattr(coll, "update_many"):
        return coll.update_many(query, update_doc)

    raise RuntimeError("Unsupported OpenClaw db update interface")


def db_query(collection: str, query: Optional[Dict[str, Any]] = None, limit: int = 0) -> List[Dict[str, Any]]:
    db = getattr(openclaw, "db", None)
    if db is None:
        raise RuntimeError("OpenClaw db is not available")

    query = query or {}

    if hasattr(db, "query") and callable(db.query):
        rows = db.query(collection, query)
        return rows[:limit] if limit > 0 else rows

    coll = _resolve_collection(db, collection)
    if coll is not None and hasattr(coll, "find"):
        cursor = coll.find(query)
        if limit > 0 and hasattr(cursor, "limit"):
            cursor = cursor.limit(limit)
        return list(cursor)

    raise RuntimeError("Unsupported OpenClaw db query interface")


def db_get(collection: str, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    rows = db_query(collection, query, limit=1)
    if rows:
        return rows[0]
    return None
