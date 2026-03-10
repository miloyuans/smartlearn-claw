from __future__ import annotations

import datetime as dt
from typing import Any, Dict

import jwt
from passlib.context import CryptContext


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")



def hash_password(password: str) -> str:
    return pwd_context.hash(password)



def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)



def create_access_token(
    user_id: str,
    secret: str,
    algorithm: str,
    expires_minutes: int,
) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload: Dict[str, Any] = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=algorithm)



def decode_access_token(token: str, secret: str, algorithm: str) -> Dict[str, Any]:
    return jwt.decode(token, secret, algorithms=[algorithm])
