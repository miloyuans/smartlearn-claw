from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    db_url: str
    db_name: str
    jwt_secret: str
    jwt_algorithm: str
    jwt_exp_minutes: int
    plugin_dir: str
    upload_dir: str
    cors_origins: list[str]
    cors_allow_all: bool
    skill_backend: str
    openclaw_native_url: str
    openclaw_native_token: str
    remote_timeout_seconds: int
    admin_usernames: list[str]



def _split_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]



def _parse_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}



def get_settings() -> Settings:
    cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    admin_usernames = [name.lower() for name in _split_csv(os.getenv("ADMIN_USERNAMES", "admin"))]

    return Settings(
        db_url=os.getenv("DB_URL", "mongodb://db:27017/smartlearn"),
        db_name=os.getenv("DB_NAME", "smartlearn"),
        jwt_secret=os.getenv("JWT_SECRET", "change-me-in-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_exp_minutes=int(os.getenv("JWT_EXP_MINUTES", "10080")),
        plugin_dir=os.getenv("PLUGIN_DIR", "/plugins"),
        upload_dir=os.getenv("UPLOAD_DIR", "/data/uploads"),
        cors_origins=_split_csv(cors_raw),
        cors_allow_all=_parse_bool(os.getenv("CORS_ALLOW_ALL", "true"), default=True),
        skill_backend=os.getenv("SKILL_BACKEND", "openclaw").strip().lower(),
        openclaw_native_url=os.getenv("OPENCLAW_NATIVE_URL", "http://openclaw-native:18789").strip(),
        openclaw_native_token=os.getenv("OPENCLAW_NATIVE_TOKEN", "").strip(),
        remote_timeout_seconds=int(os.getenv("REMOTE_TIMEOUT_SECONDS", "25")),
        admin_usernames=admin_usernames,
    )
