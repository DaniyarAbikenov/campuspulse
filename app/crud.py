from typing import Any, TypeVar
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Base

ModelT = TypeVar("ModelT", bound=Base)


def create_entity(session: Session, model: type[ModelT], payload: BaseModel) -> ModelT:
    entity = model(**payload.model_dump())
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
    statement = select(model).order_by(model.created_at).offset(offset).limit(limit)  # type: ignore[attr-defined]
    return list(session.scalars(statement).all())


def get_entity(session: Session, model: type[ModelT], entity_id: UUID) -> ModelT:
    entity = session.get(model, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
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
    _commit(session)
    session.refresh(entity)
    return entity


def delete_entity(session: Session, model: type[ModelT], entity_id: UUID) -> None:
    entity = get_entity(session, model, entity_id)
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
