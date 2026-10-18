from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.service import AuthenticatedUser
from app.db import models

ACTOR_SESSION_KEY = "campuspulse_actor"


def set_actor(session: Session, actor: AuthenticatedUser) -> None:
    session.info[ACTOR_SESSION_KEY] = actor


def get_actor(session: Session) -> AuthenticatedUser:
    actor = session.info.get(ACTOR_SESSION_KEY)
    if not isinstance(actor, AuthenticatedUser):
        raise RuntimeError("Authenticated actor is missing from the database session")
    return actor


def require_create(session: Session, actor: AuthenticatedUser, entity: models.Base) -> None:
    if not can_write(session, actor, entity):
        raise _forbidden()


def require_read(session: Session, actor: AuthenticatedUser, entity: models.Base) -> None:
    if not can_read(session, actor, entity):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")


def require_write(session: Session, actor: AuthenticatedUser, entity: models.Base) -> None:
    if not can_write(session, actor, entity):
        raise _forbidden()


def can_read(session: Session, actor: AuthenticatedUser, entity: models.Base) -> bool:
    if _has_role(actor, "platform_admin"):
        return True
    if isinstance(entity, models.Institution):
        return True
    if isinstance(entity, models.User):
        return entity.id == actor.user.id or _admin_matches(actor, entity.institution_id)
    if isinstance(entity, models.Semester):
        if _is_academic_admin(actor):
            return entity.institution_id == actor.user.institution_id
        return _is_enrolled_in_semester(session, actor.user.id, entity.id)
    if isinstance(entity, models.Course):
        if _is_academic_admin(actor):
            return _course_institution_id(session, entity.id) == actor.user.institution_id
        return _is_enrolled(session, actor.user.id, entity.id)
    if isinstance(entity, models.Enrollment):
        if entity.user_id == actor.user.id:
            return True
        return _admin_matches(actor, _course_institution_id(session, entity.course_id))
    if isinstance(entity, models.Assignment):
        if entity.owner_user_id == actor.user.id:
            return _is_enrolled(session, actor.user.id, entity.course_id)
        return _admin_matches(actor, _course_institution_id(session, entity.course_id))
    if isinstance(entity, models.AssignmentRelation):
        source = session.get(models.Assignment, entity.source_assignment_id)
        target = session.get(models.Assignment, entity.target_assignment_id)
        return (
            source is not None
            and target is not None
            and can_read(session, actor, source)
            and can_read(session, actor, target)
        )
    if isinstance(entity, models.Task):
        assignment = session.get(models.Assignment, entity.assignment_id)
        return assignment is not None and can_read(session, actor, assignment)
    if isinstance(entity, models.Document):
        if _is_academic_admin(actor):
            return _course_institution_id(session, entity.course_id) == actor.user.institution_id
        if not _is_enrolled(session, actor.user.id, entity.course_id):
            return False
        if entity.assignment_id is None:
            return True
        assignment = session.get(models.Assignment, entity.assignment_id)
        return assignment is not None and can_read(session, actor, assignment)
    if isinstance(entity, models.ScheduleEvent):
        if entity.user_id == actor.user.id:
            return True
        return _admin_matches(actor, _user_institution_id(session, entity.user_id))
    return False


def can_write(session: Session, actor: AuthenticatedUser, entity: models.Base) -> bool:
    if _has_role(actor, "platform_admin"):
        return True
    if isinstance(entity, models.Institution):
        return False
    if isinstance(entity, models.User):
        return _admin_matches(actor, entity.institution_id)
    if isinstance(entity, models.Semester):
        return _admin_matches(actor, entity.institution_id)
    if isinstance(entity, models.Course):
        return _admin_matches(actor, _semester_institution_id(session, entity.semester_id))
    if isinstance(entity, models.Enrollment):
        course_institution_id = _course_institution_id(session, entity.course_id)
        return _admin_matches(actor, course_institution_id) and (
            _user_institution_id(session, entity.user_id) == course_institution_id
        )
    if isinstance(entity, models.Assignment):
        if entity.owner_user_id == actor.user.id:
            return _is_enrolled(session, actor.user.id, entity.course_id)
        if not _admin_matches(actor, _course_institution_id(session, entity.course_id)):
            return False
        return entity.owner_user_id is None or _admin_matches(
            actor, _user_institution_id(session, entity.owner_user_id)
        )
    if isinstance(entity, models.AssignmentRelation):
        source = session.get(models.Assignment, entity.source_assignment_id)
        target = session.get(models.Assignment, entity.target_assignment_id)
        return (
            source is not None
            and target is not None
            and can_write(session, actor, source)
            and can_write(session, actor, target)
        )
    if isinstance(entity, models.Task):
        assignment = session.get(models.Assignment, entity.assignment_id)
        return assignment is not None and can_write(session, actor, assignment)
    if isinstance(entity, models.Document):
        assignment = (
            session.get(models.Assignment, entity.assignment_id)
            if entity.assignment_id is not None
            else None
        )
        if assignment is not None and assignment.course_id != entity.course_id:
            return False
        if _is_academic_admin(actor):
            return _course_institution_id(session, entity.course_id) == actor.user.institution_id
        if not _is_enrolled(session, actor.user.id, entity.course_id):
            return False
        if entity.assignment_id is None:
            return True
        return assignment is not None and assignment.owner_user_id == actor.user.id
    if isinstance(entity, models.ScheduleEvent):
        course_allowed = entity.course_id is None or (
            _course_institution_id(session, entity.course_id) == actor.user.institution_id
            if _is_academic_admin(actor)
            else _is_enrolled(session, actor.user.id, entity.course_id)
        )
        if entity.user_id == actor.user.id:
            return course_allowed
        return course_allowed and _admin_matches(
            actor, _user_institution_id(session, entity.user_id)
        )
    return False


def _has_role(actor: AuthenticatedUser, role: str) -> bool:
    return role in actor.roles


def _is_academic_admin(actor: AuthenticatedUser) -> bool:
    return _has_role(actor, "academic_admin") and actor.user.institution_id is not None


def _admin_matches(actor: AuthenticatedUser, institution_id: UUID | None) -> bool:
    return _is_academic_admin(actor) and institution_id == actor.user.institution_id


def _is_enrolled(session: Session, user_id: UUID, course_id: UUID) -> bool:
    return (
        session.scalar(
            select(models.Enrollment.id).where(
                models.Enrollment.user_id == user_id,
                models.Enrollment.course_id == course_id,
            )
        )
        is not None
    )


def _is_enrolled_in_semester(session: Session, user_id: UUID, semester_id: UUID) -> bool:
    return (
        session.scalar(
            select(models.Enrollment.id)
            .join(models.Course, models.Course.id == models.Enrollment.course_id)
            .where(
                models.Enrollment.user_id == user_id,
                models.Course.semester_id == semester_id,
            )
        )
        is not None
    )


def _course_institution_id(session: Session, course_id: UUID) -> UUID | None:
    return session.scalar(
        select(models.Semester.institution_id)
        .join(models.Course, models.Course.semester_id == models.Semester.id)
        .where(models.Course.id == course_id)
    )


def _semester_institution_id(session: Session, semester_id: UUID) -> UUID | None:
    return session.scalar(
        select(models.Semester.institution_id).where(models.Semester.id == semester_id)
    )


def _user_institution_id(session: Session, user_id: UUID) -> UUID | None:
    return session.scalar(select(models.User.institution_id).where(models.User.id == user_id))


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to perform this action",
    )
