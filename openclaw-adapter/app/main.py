from __future__ import annotations

import asyncio
import datetime as dt
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any, Dict
from urllib.parse import quote
from uuid import uuid4

import requests
import socketio
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from .services.auth_service import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from .services.plugin_manager import PluginManager
from .settings import Settings, get_settings


settings: Settings = get_settings()
mongo_client = MongoClient(settings.db_url)
db = mongo_client[settings.db_name]
users = db["users"]

allow_all_origins = settings.cors_allow_all or "*" in settings.cors_origins
cors_origins = ["*"] if allow_all_origins else settings.cors_origins
socket_cors_origins: list[str] | str = "*" if allow_all_origins else settings.cors_origins

bearer = HTTPBearer(auto_error=False)
plugin_manager = PluginManager(settings.plugin_dir, db)



def _safe_user_id(username: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", username.strip().lower()).strip("-")
    if not normalized:
        normalized = f"student-{uuid4().hex[:8]}"
    return normalized


def _username_is_admin(username: Any) -> bool:
    if not isinstance(username, str):
        return False
    return username.strip().lower() in settings.admin_usernames


def _resolve_role(doc: Dict[str, Any]) -> str:
    role = str(doc.get("role", "")).strip().lower()
    if role in {"admin", "student"}:
        return role
    if _username_is_admin(doc.get("username")):
        return "admin"
    return "student"



def _public_user(doc: Dict[str, Any]) -> Dict[str, Any]:
    role = _resolve_role(doc)
    return {
        "user_id": doc.get("_id"),
        "username": doc.get("username"),
        "points": int(doc.get("points", 0)),
        "role": role,
        "created_at": doc.get("created_at"),
    }



def _decode_token_user(token: str) -> Dict[str, Any]:
    try:
        payload = decode_access_token(token, settings.jwt_secret, settings.jwt_algorithm)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user



def _wait_for_mongo(max_attempts: int = 30, delay_seconds: float = 2.0) -> None:
    for _ in range(max_attempts):
        try:
            mongo_client.admin.command("ping")
            return
        except Exception:
            time.sleep(delay_seconds)
    raise RuntimeError("MongoDB is not reachable after retries")


def _remote_skill_urls(skill_name: str) -> list[str]:
    base = settings.openclaw_native_url.rstrip("/")
    encoded_skill = quote(skill_name, safe="")
    return [
        f"{base}/api/skills/{encoded_skill}",
        f"{base}/skills/{encoded_skill}",
        f"{base}/api/skill/{encoded_skill}",
    ]


def _remote_http_headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.openclaw_native_token:
        headers["Authorization"] = f"Bearer {settings.openclaw_native_token}"
        headers["X-OpenClaw-Token"] = settings.openclaw_native_token
    return headers


def _normalize_remote_response(data: Any) -> Dict[str, Any]:
    if isinstance(data, dict):
        result = dict(data)
        result.pop("requestId", None)
        return result
    return {"result": data}


async def _execute_remote_skill_http(skill_name: str, payload: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    errors: list[str] = []
    urls = _remote_skill_urls(skill_name)
    headers = _remote_http_headers()

    body_candidates = [
        {"payload": payload, "requestId": request_id},
        {"skill": skill_name, "payload": payload, "requestId": request_id},
        payload,
    ]

    for url in urls:
        for body in body_candidates:
            try:
                response = await asyncio.to_thread(
                    requests.post,
                    url,
                    json=body,
                    headers=headers,
                    timeout=settings.remote_timeout_seconds,
                )
            except Exception as exc:
                errors.append(f"{url} -> request error: {exc}")
                continue

            if response.status_code >= 400:
                excerpt = response.text.strip()[:180]
                errors.append(f"{url} -> HTTP {response.status_code}: {excerpt}")
                continue

            try:
                return _normalize_remote_response(response.json())
            except ValueError:
                return {"response": response.text}

    raise RuntimeError("; ".join(errors[-6:]) if errors else "No HTTP endpoint accepted the skill request")


async def _execute_remote_skill(skill_name: str, payload: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    client = socketio.AsyncClient(reconnection=False)
    response_future: asyncio.Future[Dict[str, Any]] = asyncio.get_event_loop().create_future()

    @client.event
    async def connect() -> None:  # type: ignore[no-redef]
        await client.emit(
            "trigger_skill",
            {
                "requestId": request_id,
                "skill": skill_name,
                "payload": payload,
            },
        )

    @client.on("skill_response")
    async def on_skill_response(data: Dict[str, Any]) -> None:  # type: ignore[no-redef]
        if data.get("requestId") != request_id:
            return
        if not response_future.done():
            result = dict(data)
            result.pop("requestId", None)
            response_future.set_result(result)

    @client.on("skill_error")
    async def on_skill_error(data: Dict[str, Any]) -> None:  # type: ignore[no-redef]
        rid = data.get("requestId")
        if rid and rid != request_id:
            return
        if not response_future.done():
            response_future.set_exception(RuntimeError(data.get("message", "Remote skill execution failed")))

    auth_payload = {"token": settings.openclaw_native_token} if settings.openclaw_native_token else None

    socket_error: Exception | None = None
    try:
        await client.connect(
            settings.openclaw_native_url,
            socketio_path="socket.io",
            auth=auth_payload,
            wait_timeout=settings.remote_timeout_seconds,
        )
        result = await asyncio.wait_for(response_future, timeout=settings.remote_timeout_seconds)
        return result
    except Exception as exc:
        socket_error = exc
    finally:
        if client.connected:
            await client.disconnect()

    try:
        return await _execute_remote_skill_http(skill_name, payload, request_id)
    except Exception as http_exc:
        raise RuntimeError(
            f"OpenClaw remote execution failed via websocket ({socket_error}) and http ({http_exc})"
        ) from http_exc


async def _execute_skill(skill_name: str, payload: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    if settings.skill_backend == "local":
        return await asyncio.to_thread(plugin_manager.execute, skill_name, payload)

    return await _execute_remote_skill(skill_name, payload, request_id)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> Dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return _decode_token_user(credentials.credentials)


async def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if _resolve_role(current_user) != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    return current_user


def _migrate_user_roles() -> None:
    if not settings.admin_usernames:
        return

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    role_missing_filter = {
        "$or": [
            {"role": {"$exists": False}},
            {"role": None},
            {"role": ""},
            {"role": {"$nin": ["admin", "student"]}},
        ]
    }

    for admin_username in settings.admin_usernames:
        users.update_many(
            {
                "username": {
                    "$regex": f"^{re.escape(admin_username)}$",
                    "$options": "i",
                },
                **role_missing_filter,
            },
            {
                "$set": {
                    "role": "admin",
                    "updated_at": now,
                }
            },
        )


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class SkillRequest(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)


http_app = FastAPI(title="SmartLearn Gateway", version="0.3.0")
http_app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=".*" if allow_all_origins else None,
    allow_credentials=False if allow_all_origins else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=socket_cors_origins)
app = socketio.ASGIApp(sio, other_asgi_app=http_app)


@http_app.on_event("startup")
def startup() -> None:
    _wait_for_mongo()
    users.create_index("username", unique=True)
    _migrate_user_roles()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    if settings.skill_backend == "local":
        plugin_manager.load()


@http_app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "time": dt.datetime.now(dt.timezone.utc).isoformat(),
        "skills": plugin_manager.list_skills() if settings.skill_backend == "local" else [],
        "cors": {
            "allow_all": allow_all_origins,
            "origins": cors_origins,
        },
        "llm": {
            "provider": os.getenv("LLM_PROVIDER", "mock"),
            "model": os.getenv("QWEN_MODEL", os.getenv("MODEL", "qwen-plus")),
            "qwen_key_set": bool(os.getenv("QWEN_API_KEY")),
        },
        "backend": {
            "skill_backend": settings.skill_backend,
            "openclaw_native_url": settings.openclaw_native_url,
        },
    }


@http_app.post("/auth/register")
def register(request: RegisterRequest) -> Dict[str, Any]:
    username = request.username.strip()
    existing = users.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    user_id = _safe_user_id(username)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    role = "admin" if username.lower() in settings.admin_usernames else "student"
    document = {
        "_id": user_id,
        "username": username,
        "password_hash": hash_password(request.password),
        "points": 0,
        "role": role,
        "created_at": now,
        "updated_at": now,
    }

    try:
        users.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Username already exists") from exc

    return {"ok": True, "user": _public_user(document)}


@http_app.post("/auth/login")
def login(request: LoginRequest) -> Dict[str, Any]:
    username = request.username.strip()
    user = users.find_one({"username": username})
    if not user or not verify_password(request.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(
        user_id=user["_id"],
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        expires_minutes=settings.jwt_exp_minutes,
    )

    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_minutes": settings.jwt_exp_minutes,
        "user": _public_user(user),
    }


@http_app.get("/auth/me")
def me(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {"user": _public_user(current_user)}


@http_app.get("/admin/overview")
def admin_overview(_: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    return {
        "users": users.count_documents({}),
        "materials": db["materials"].count_documents({}),
        "diaries": db["diaries"].count_documents({}),
        "wishes": db["wishes"].count_documents({}),
    }


@http_app.get("/admin/users")
def admin_users(limit: int = 50, _: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    rows = list(users.find({}, {"password_hash": 0}).limit(max(1, min(limit, 200))))
    return {"items": rows}


@http_app.post("/api/skills/{skill_name}")
async def run_skill(
    skill_name: str,
    request: SkillRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    request_id = str(uuid4())
    payload = dict(request.payload)
    payload["user_id"] = current_user["_id"]

    try:
        result = await _execute_skill(skill_name, payload, request_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "requestId": request_id,
        **result,
    }


@http_app.post("/api/upload")
async def upload_material(
    file: UploadFile = File(...),
    subject: str = Form("general"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    user_id = current_user["_id"]
    user_dir = Path(settings.upload_dir) / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    original_name = file.filename or "material.bin"
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", original_name)
    target_name = f"{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d%H%M%S')}_{safe_name}"
    target_path = user_dir / target_name

    with target_path.open("wb") as output:
        shutil.copyfileobj(file.file, output)

    payload = {
        "user_id": user_id,
        "subject": subject,
        "file_path": str(target_path),
    }

    try:
        result = await _execute_skill("analyze_material", payload, str(uuid4()))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload analysis failed: {exc}") from exc

    return {
        "file": {
            "name": original_name,
            "stored_path": str(target_path),
            "subject": subject,
        },
        "analysis": result,
    }


@sio.event
async def connect(sid: str, environ: Dict[str, Any], auth: Dict[str, Any] | None) -> bool:
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")

    if not token:
        raise ConnectionRefusedError("Missing auth token")

    try:
        user = _decode_token_user(token)
    except HTTPException as exc:
        raise ConnectionRefusedError(exc.detail) from exc

    await sio.save_session(sid, {"user_id": user["_id"]})
    return True


@sio.event
async def disconnect(sid: str) -> None:
    return None


@sio.on("trigger_skill")
async def trigger_skill(sid: str, data: Dict[str, Any]) -> None:
    request_id = data.get("requestId") or str(uuid4())

    try:
        skill_name = data.get("skill")
        payload = data.get("payload") or {}

        if not skill_name:
            raise ValueError("Missing skill name")

        session = await sio.get_session(sid)
        user_id = session.get("user_id")
        if not user_id:
            raise ValueError("Unauthorized socket session")

        payload["user_id"] = user_id
        result = await _execute_skill(skill_name, payload, request_id)

        await sio.emit(
            "skill_response",
            {
                "requestId": request_id,
                **result,
            },
            to=sid,
        )
    except Exception as exc:
        await sio.emit(
            "skill_error",
            {
                "requestId": request_id,
                "message": str(exc),
            },
            to=sid,
        )

