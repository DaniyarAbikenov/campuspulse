from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from typing import Any
from uuid import UUID, uuid4

import jwt


class AccessTokenError(ValueError):
    pass


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: UUID
    token_id: UUID


def create_access_token(
    user_id: UUID,
    *,
    secret: str,
    issuer: str,
    audience: str,
    ttl_minutes: int,
) -> tuple[str, int]:
    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=ttl_minutes)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "jti": str(uuid4()),
            "typ": "access",
            "iss": issuer,
            "aud": audience,
            "iat": issued_at,
            "exp": expires_at,
        },
        secret,
        algorithm="HS256",
    )
    return token, int((expires_at - issued_at).total_seconds())


def decode_access_token(
    token: str, *, secret: str, issuer: str, audience: str
) -> AccessTokenClaims:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            issuer=issuer,
            audience=audience,
            options={"require": ["sub", "jti", "typ", "iat", "exp", "iss", "aud"]},
        )
        if payload["typ"] != "access":
            raise AccessTokenError("Unexpected token type")
        return AccessTokenClaims(user_id=UUID(payload["sub"]), token_id=UUID(payload["jti"]))
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as error:
        raise AccessTokenError("Access token is invalid or expired") from error


def generate_refresh_token() -> tuple[str, str]:
    raw_token = token_urlsafe(48)
    return raw_token, hash_refresh_token(raw_token)


def hash_refresh_token(raw_token: str) -> str:
    return sha256(raw_token.encode()).hexdigest()
