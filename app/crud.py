from typing import Any, TypeVar
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.authorization import (
    can_read,
    get_actor,
    require_create,
    require_read,
    require_write,
)
from app.db import models
from app.db.models import Base

ModelT = TypeVar("ModelT", bound=Base)


def create_entity(session: Session, model: type[ModelT], payload: BaseModel) -> ModelT:
    actor = get_actor(session)
    values = payload.model_dump()
    if model is models.Assignment and values.get("owner_user_id") is None:
        is_student_only = "student" in actor.roles and not {
            "academic_admin",
            "platform_admin",
        }.intersection(actor.roles)
        if not is_student_only:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="owner_user_id is required when creating an assignment for another user",
            )
        values["owner_user_id"] = actor.user.id
    entity = model(**values)
    require_create(session, actor, entity)
    session.add(entity)
    _commit(session)
    session.refresh(entity)
    return entity


def list_entities(
    session: Session,
    model: type[ModelT],
    *,
    offset: int,
    limit: int,
) -> list[ModelT]:
    actor = get_actor(session)
    statement = select(model).order_by(model.created_at)  # type: ignore[attr-defined]
    visible = [
        entity for entity in session.scalars(statement).all() if can_read(session, actor, entity)
    ]
    return visible[offset : offset + limit]


def get_entity(session: Session, model: type[ModelT], entity_id: UUID) -> ModelT:
    entity = session.get(model, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    require_read(session, get_actor(session), entity)
    return entity


def update_entity(
    session: Session,
    model: type[ModelT],
    entity_id: UUID,
    payload: BaseModel,
) -> ModelT:
    entity = get_entity(session, model, entity_id)
    changes: dict[str, Any] = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(entity, field, value)
    require_write(session, get_actor(session), entity)
    _commit(session)
    session.refresh(entity)
    return entity


def delete_entity(session: Session, model: type[ModelT], entity_id: UUID) -> None:
    entity = get_entity(session, model, entity_id)
    require_write(session, get_actor(session), entity)
    session.delete(entity)
    _commit(session)


def _commit(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The resource conflicts with existing or referenced data",
        ) from error
