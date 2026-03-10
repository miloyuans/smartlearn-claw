from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import os
from typing import Any, Dict

import jwt


PBKDF2_ALGORITHM = "sha256"
PBKDF2_ROUNDS = 120000



def _b64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")



def _b64_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value.encode("ascii"))



def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt,
        PBKDF2_ROUNDS,
    )
    return f"pbkdf2_{PBKDF2_ALGORITHM}${PBKDF2_ROUNDS}${_b64_encode(salt)}${_b64_encode(digest)}"



def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, rounds_text, salt_text, digest_text = password_hash.split("$")
        if scheme != f"pbkdf2_{PBKDF2_ALGORITHM}":
            return False

        rounds = int(rounds_text)
        salt = _b64_decode(salt_text)
        expected = _b64_decode(digest_text)

        actual = hashlib.pbkdf2_hmac(
            PBKDF2_ALGORITHM,
            password.encode("utf-8"),
            salt,
            rounds,
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False



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
