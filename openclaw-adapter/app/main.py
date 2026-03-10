from __future__ import annotations

import asyncio
import datetime as dt
import re
import shutil
import time
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

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


def _safe_user_id(username: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", username.strip().lower()).strip("-")
    if not normalized:
        normalized = f"student-{uuid4().hex[:8]}"
    return normalized


def _public_user(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": doc.get("_id"),
        "username": doc.get("username"),
        "points": int(doc.get("points", 0)),
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


bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> Dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return _decode_token_user(credentials.credentials)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class SkillRequest(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)


http_app = FastAPI(title="SmartLearn OpenClaw Adapter", version="0.2.0")
http_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=settings.cors_origins)
app = socketio.ASGIApp(sio, other_asgi_app=http_app)

plugin_manager = PluginManager(settings.plugin_dir, db)


@http_app.on_event("startup")
def startup() -> None:
    _wait_for_mongo()
    users.create_index("username", unique=True)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    plugin_manager.load()


@http_app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "time": dt.datetime.now(dt.timezone.utc).isoformat(),
        "skills": plugin_manager.list_skills(),
    }


@http_app.post("/auth/register")
def register(request: RegisterRequest) -> Dict[str, Any]:
    username = request.username.strip()
    existing = users.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    user_id = _safe_user_id(username)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    document = {
        "_id": user_id,
        "username": username,
        "password_hash": hash_password(request.password),
        "points": 0,
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


@http_app.post("/api/skills/{skill_name}")
def run_skill(
    skill_name: str,
    request: SkillRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    payload = dict(request.payload)
    payload["user_id"] = current_user["_id"]

    try:
        result = plugin_manager.execute(skill_name, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "requestId": str(uuid4()),
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
        result = await asyncio.to_thread(plugin_manager.execute, "analyze_material", payload)
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
    request_id = None
    try:
        request_id = data.get("requestId")
        skill_name = data.get("skill")
        payload = data.get("payload") or {}

        if not skill_name:
            raise ValueError("Missing skill name")

        session = await sio.get_session(sid)
        user_id = session.get("user_id")
        if not user_id:
            raise ValueError("Unauthorized socket session")

        payload["user_id"] = user_id
        result = await asyncio.to_thread(plugin_manager.execute, skill_name, payload)

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
