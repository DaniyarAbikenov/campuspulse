from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.google import GoogleClaims
from app.auth.tokens import create_access_token, generate_refresh_token, hash_refresh_token
from app.db import models


class AuthenticationError(ValueError):
    pass


class AccountLinkRequiredError(AuthenticationError):
    pass


@dataclass(frozen=True)
class IssuedTokenPair:
    access_token: str
    refresh_token: str
    expires_in: int


@dataclass(frozen=True)
class AuthenticatedUser:
    user: models.User
    roles: list[str]


def authenticate_google(
    session: Session,
    claims: GoogleClaims,
    *,
    secret: str,
    issuer: str,
    audience: str,
    access_ttl_minutes: int,
    refresh_ttl_days: int,
) -> IssuedTokenPair:
    now = datetime.now(UTC)
    identity = session.scalar(
        select(models.IdentityAccount).where(
            models.IdentityAccount.provider == "google",
            models.IdentityAccount.subject == claims.subject,
        )
    )

    if identity is None:
        user = session.scalar(select(models.User).where(models.User.email == claims.email))
        if user is not None and not _google_is_authoritative_for_email(claims):
            raise AccountLinkRequiredError(
                "An account with this email already exists and requires explicit linking"
            )
        if user is None:
            user = models.User(
                email=claims.email,
                full_name=claims.full_name,
                institution_id=None,
                is_active=True,
            )
            session.add(user)
            session.flush()
        identity = models.IdentityAccount(
            user_id=user.id,
            provider="google",
            subject=claims.subject,
            provider_email=claims.email,
            last_login_at=now,
        )
        session.add(identity)
        _assign_student_role(session, user.id)
    else:
        user = session.get(models.User, identity.user_id)
        if user is None:
            raise AuthenticationError("Google identity is not linked to a user")
        identity.provider_email = claims.email
        identity.last_login_at = now

    if not user.is_active:
        raise AuthenticationError("User account is inactive")

    token_pair = _issue_session(
        session,
        user.id,
        secret=secret,
        issuer=issuer,
        audience=audience,
        access_ttl_minutes=access_ttl_minutes,
        refresh_ttl_days=refresh_ttl_days,
    )
    session.add(
        models.AuditEvent(
            actor_user_id=user.id,
            action="auth.google.login",
            resource_type="auth_session",
            outcome=models.AuditOutcome.success,
        )
    )
    session.commit()
    return token_pair


def refresh_session(
    session: Session,
    raw_refresh_token: str,
    *,
    secret: str,
    issuer: str,
    audience: str,
    access_ttl_minutes: int,
    refresh_ttl_days: int,
) -> IssuedTokenPair:
    now = datetime.now(UTC)
    auth_session = session.scalar(
        select(models.AuthSession).where(
            models.AuthSession.refresh_token_hash == hash_refresh_token(raw_refresh_token)
        )
    )
    if auth_session is None or auth_session.revoked_at is not None:
        raise AuthenticationError("Refresh token is invalid")
    if _as_utc(auth_session.expires_at) <= now:
        auth_session.revoked_at = now
        session.commit()
        raise AuthenticationError("Refresh token is expired")

    user = session.get(models.User, auth_session.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User account is inactive")

    new_refresh_token, new_refresh_hash = generate_refresh_token()
    auth_session.refresh_token_hash = new_refresh_hash
    auth_session.last_used_at = now
    auth_session.expires_at = now + timedelta(days=refresh_ttl_days)
    access_token, expires_in = create_access_token(
        user.id,
        secret=secret,
        issuer=issuer,
        audience=audience,
        ttl_minutes=access_ttl_minutes,
    )
    session.add(
        models.AuditEvent(
            actor_user_id=user.id,
            action="auth.session.refresh",
            resource_type="auth_session",
            resource_id=auth_session.id,
            outcome=models.AuditOutcome.success,
        )
    )
    session.commit()
    return IssuedTokenPair(access_token, new_refresh_token, expires_in)


def revoke_session(session: Session, raw_refresh_token: str) -> None:
    auth_session = session.scalar(
        select(models.AuthSession).where(
            models.AuthSession.refresh_token_hash == hash_refresh_token(raw_refresh_token)
        )
    )
    if auth_session is None or auth_session.revoked_at is not None:
        return
    auth_session.revoked_at = datetime.now(UTC)
    session.add(
        models.AuditEvent(
            actor_user_id=auth_session.user_id,
            action="auth.session.logout",
            resource_type="auth_session",
            resource_id=auth_session.id,
            outcome=models.AuditOutcome.success,
        )
    )
    session.commit()


def get_authenticated_user(session: Session, user_id: UUID) -> AuthenticatedUser:
    user = session.get(models.User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User account is inactive or missing")
    roles = list(
        session.scalars(
            select(models.Role.code)
            .join(models.UserRole, models.UserRole.role_id == models.Role.id)
            .where(models.UserRole.user_id == user.id)
            .order_by(models.Role.code)
        ).all()
    )
    return AuthenticatedUser(user=user, roles=roles)


def _issue_session(
    session: Session,
    user_id: UUID,
    *,
    secret: str,
    issuer: str,
    audience: str,
    access_ttl_minutes: int,
    refresh_ttl_days: int,
) -> IssuedTokenPair:
    raw_refresh_token, refresh_hash = generate_refresh_token()
    session.add(
        models.AuthSession(
            user_id=user_id,
            refresh_token_hash=refresh_hash,
            expires_at=datetime.now(UTC) + timedelta(days=refresh_ttl_days),
        )
    )
    access_token, expires_in = create_access_token(
        user_id,
        secret=secret,
        issuer=issuer,
        audience=audience,
        ttl_minutes=access_ttl_minutes,
    )
    return IssuedTokenPair(access_token, raw_refresh_token, expires_in)


def _assign_student_role(session: Session, user_id: UUID) -> None:
    role = session.scalar(select(models.Role).where(models.Role.code == "student"))
    if role is None:
        role = models.Role(code="student", name="Student")
        session.add(role)
        session.flush()
    assignment_id = session.scalar(
        select(models.UserRole.id).where(
            models.UserRole.user_id == user_id,
            models.UserRole.role_id == role.id,
        )
    )
    if assignment_id is None:
        session.add(models.UserRole(user_id=user_id, role_id=role.id))


def _google_is_authoritative_for_email(claims: GoogleClaims) -> bool:
    return claims.email.endswith("@gmail.com") or claims.hosted_domain is not None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
