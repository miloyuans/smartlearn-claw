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



def _split_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]



def get_settings() -> Settings:
    cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return Settings(
        db_url=os.getenv("DB_URL", "mongodb://db:27017/smartlearn"),
        db_name=os.getenv("DB_NAME", "smartlearn"),
        jwt_secret=os.getenv("JWT_SECRET", "change-me-in-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_exp_minutes=int(os.getenv("JWT_EXP_MINUTES", "10080")),
        plugin_dir=os.getenv("PLUGIN_DIR", "/plugins"),
        upload_dir=os.getenv("UPLOAD_DIR", "/data/uploads"),
        cors_origins=_split_csv(cors_raw),
    )
