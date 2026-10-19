from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
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
    authenticate_demo,
    authenticate_google,
    complete_onboarding,
    get_authenticated_user,
    refresh_session,
    revoke_session,
)
from app.auth.tokens import AccessTokenError, decode_access_token
from app.core.config import settings
from app.db import models
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


@router.post("/demo", response_model=schemas.TokenPairRead, include_in_schema=False)
def demo_login(session: SessionDep) -> schemas.TokenPairRead:
    if not settings.enable_demo_auth:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    try:
        token_pair = authenticate_demo(
            session,
            settings.demo_user_email,
            secret=get_jwt_secret(),
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            access_ttl_minutes=settings.access_token_ttl_minutes,
            refresh_ttl_days=settings.refresh_token_ttl_days,
        )
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
def me(current: CurrentUserDep, session: SessionDep) -> schemas.AuthUserRead:
    return _profile(session, current.user, current.roles)


@router.get("/onboarding/options", response_model=schemas.OnboardingOptionsRead)
def onboarding_options(
    current: CurrentUserDep, session: SessionDep
) -> schemas.OnboardingOptionsRead:
    """Institutions and the courses of their latest semester, for a student who is joining."""
    if current.user.institution_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Onboarding has already been completed"
        )
    institutions = []
    for institution in session.scalars(
        select(models.Institution).order_by(models.Institution.name)
    ).all():
        semester = session.scalar(
            select(models.Semester)
            .where(models.Semester.institution_id == institution.id)
            .order_by(models.Semester.starts_on.desc())
        )
        courses = (
            session.scalars(
                select(models.Course)
                .where(models.Course.semester_id == semester.id)
                .order_by(models.Course.code)
            ).all()
            if semester
            else []
        )
        institutions.append(
            schemas.OnboardingInstitutionRead(
                id=institution.id,
                name=institution.name,
                short_name=institution.short_name,
                courses=[
                    schemas.OnboardingCourseRead(id=c.id, code=c.code, name=c.name) for c in courses
                ],
            )
        )
    return schemas.OnboardingOptionsRead(institutions=institutions)


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
            group_name=payload.group_name,
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
    return _profile(session, completed.user, completed.roles)


def _profile(session: Session, user: models.User, roles: list[str]) -> schemas.AuthUserRead:
    """The signed-in user with the names the interface shows (university and current semester)."""
    institution = (
        session.get(models.Institution, user.institution_id) if user.institution_id else None
    )
    semester = (
        session.scalars(
            select(models.Semester)
            .where(models.Semester.institution_id == user.institution_id)
            .order_by(models.Semester.starts_on.desc())
        ).first()
        if institution
        else None
    )
    return schemas.AuthUserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        institution_id=user.institution_id,
        roles=roles,
        institution_name=institution.name if institution else None,
        semester_name=semester.name if semester else None,
    )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )
