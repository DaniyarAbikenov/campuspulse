from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app import schemas
from app.auth.google import GoogleCredentialError, GoogleTokenVerifier
from app.auth.service import (
    AccountLinkRequiredError,
    AuthenticatedUser,
    AuthenticationError,
    OnboardingAlreadyCompletedError,
    OnboardingConflictError,
    OnboardingError,
    authenticate_google,
    complete_onboarding,
    get_authenticated_user,
    refresh_session,
    revoke_session,
)
from app.auth.tokens import AccessTokenError, decode_access_token
from app.core.config import settings
from app.db.session import get_session

router = APIRouter()
bearer = HTTPBearer(auto_error=False)
SessionDep = Annotated[Session, Depends(get_session)]


def get_google_verifier() -> GoogleTokenVerifier:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured",
        )
    return GoogleTokenVerifier(settings.google_client_id)


def get_jwt_secret() -> str:
    if settings.jwt_secret is None or not settings.jwt_secret.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CampusPulse session signing is not configured",
        )
    return settings.jwt_secret.get_secret_value()


GoogleVerifierDep = Annotated[GoogleTokenVerifier, Depends(get_google_verifier)]
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def get_current_user(
    credentials: BearerDep,
    session: SessionDep,
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Bearer access token is required")
    try:
        claims = decode_access_token(
            credentials.credentials,
            secret=get_jwt_secret(),
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        return get_authenticated_user(session, claims.user_id)
    except (AccessTokenError, AuthenticationError) as error:
        raise _unauthorized(str(error)) from error


CurrentUserDep = Annotated[AuthenticatedUser, Depends(get_current_user)]


@router.post("/google", response_model=schemas.TokenPairRead)
def google_login(
    payload: schemas.GoogleLoginRequest,
    session: SessionDep,
    verifier: GoogleVerifierDep,
) -> schemas.TokenPairRead:
    try:
        claims = verifier.verify(payload.credential)
        token_pair = authenticate_google(
            session,
            claims,
            secret=get_jwt_secret(),
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            access_ttl_minutes=settings.access_token_ttl_minutes,
            refresh_ttl_days=settings.refresh_token_ttl_days,
        )
    except GoogleCredentialError as error:
        raise _unauthorized(str(error)) from error
    except AccountLinkRequiredError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except AuthenticationError as error:
        raise _unauthorized(str(error)) from error
    return schemas.TokenPairRead(**token_pair.__dict__)


@router.post("/refresh", response_model=schemas.TokenPairRead)
def refresh(
    payload: schemas.RefreshTokenRequest,
    session: SessionDep,
) -> schemas.TokenPairRead:
    try:
        token_pair = refresh_session(
            session,
            payload.refresh_token,
            secret=get_jwt_secret(),
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            access_ttl_minutes=settings.access_token_ttl_minutes,
            refresh_ttl_days=settings.refresh_token_ttl_days,
        )
    except AuthenticationError as error:
        raise _unauthorized(str(error)) from error
    return schemas.TokenPairRead(**token_pair.__dict__)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: schemas.RefreshTokenRequest, session: SessionDep) -> Response:
    revoke_session(session, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=schemas.AuthUserRead)
def me(current: CurrentUserDep) -> schemas.AuthUserRead:
    return schemas.AuthUserRead(
        id=current.user.id,
        email=current.user.email,
        full_name=current.user.full_name,
        institution_id=current.user.institution_id,
        roles=current.roles,
    )


@router.post("/onboarding", response_model=schemas.AuthUserRead)
def onboarding(
    payload: schemas.OnboardingRequest,
    current: CurrentUserDep,
    session: SessionDep,
) -> schemas.AuthUserRead:
    try:
        completed = complete_onboarding(
            session,
            current,
            institution_id=payload.institution_id,
            student_number=payload.student_number,
            program=payload.program,
            course_ids=payload.course_ids,
        )
    except OnboardingAlreadyCompletedError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except OnboardingConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except OnboardingError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    return schemas.AuthUserRead(
        id=completed.user.id,
        email=completed.user.email,
        full_name=completed.user.full_name,
        institution_id=completed.user.institution_id,
        roles=completed.roles,
    )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )
