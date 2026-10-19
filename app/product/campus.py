from collections import defaultdict
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read
from app.auth.service import AuthenticatedUser
from app.db import models


def knowledge_base(
    session: Session, actor: AuthenticatedUser, *, course_id: UUID | None = None
) -> schemas.KnowledgeBaseRead:
    documents = [
        document
        for document in session.scalars(
            select(models.Document).order_by(models.Document.created_at, models.Document.name)
        ).all()
        if (course_id is None or document.course_id == course_id)
        and can_read(session, actor, document)
        and _own_or_course_material(session, actor, document)
    ]
    readable_ids = {document.id for document in documents}
    fragments = [
        fragment
        for fragment in session.scalars(
            select(models.DocumentFragment).order_by(
                models.DocumentFragment.document_id,
                models.DocumentFragment.page,
                models.DocumentFragment.concept,
            )
        ).all()
        if fragment.document_id in readable_ids
    ]
    concepts: dict[UUID, list[str]] = defaultdict(list)
    for fragment in fragments:
        if fragment.concept not in concepts[fragment.document_id]:
            concepts[fragment.document_id].append(fragment.concept)
    return schemas.KnowledgeBaseRead(
        document_count=len(documents),
        page_count=sum(document.page_count for document in documents),
        documents=[
            schemas.KnowledgeDocumentRead(
                id=document.id,
                course_id=document.course_id,
                assignment_id=document.assignment_id,
                name=document.name,
                kind=document.kind,
                page_count=document.page_count,
                indexed_at=document.updated_at,
                concepts=concepts[document.id],
            )
            for document in documents
        ],
        fragments=[schemas.DocumentFragmentRead.model_validate(item) for item in fragments],
    )


def _own_or_course_material(
    session: Session, actor: AuthenticatedUser, document: models.Document
) -> bool:
    """Briefs belong to the student who uploaded them; administrators do not browse them."""
    if document.assignment_id is None:
        return True
    assignment = session.get(models.Assignment, document.assignment_id)
    return assignment is not None and assignment.owner_user_id == actor.user.id


def campus_events(session: Session, actor: AuthenticatedUser) -> list[schemas.CampusEventRead]:
    query = select(models.CampusEvent).order_by(
        models.CampusEvent.starts_at, models.CampusEvent.title
    )
    if not any(role == "platform_admin" for role in actor.roles):
        query = query.where(models.CampusEvent.institution_id == actor.user.institution_id)
    matches = {
        match.event_id: match
        for match in session.scalars(
            select(models.CampusEventMatch).where(models.CampusEventMatch.user_id == actor.user.id)
        ).all()
    }
    return [
        schemas.CampusEventRead(
            id=event.id,
            title=event.title,
            description=event.description,
            category=event.category,
            place=event.place,
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            match_percent=matches[event.id].match_percent if event.id in matches else None,
            reason=matches[event.id].reason if event.id in matches else None,
            is_saved=matches[event.id].is_saved if event.id in matches else False,
        )
        for event in session.scalars(query).all()
    ]


def save_campus_event(
    session: Session, actor: AuthenticatedUser, event_id: UUID, saved: bool
) -> schemas.CampusEventRead:
    match = session.scalar(
        select(models.CampusEventMatch).where(
            models.CampusEventMatch.event_id == event_id,
            models.CampusEventMatch.user_id == actor.user.id,
        )
    )
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    match.is_saved = saved
    session.commit()
    return next(item for item in campus_events(session, actor) if item.id == event_id)


def agent_activity(
    session: Session, actor: AuthenticatedUser, *, limit: int
) -> schemas.AgentActivityRead:
    total = session.scalar(
        select(func.count())
        .select_from(models.AgentRun)
        .where(models.AgentRun.user_id == actor.user.id)
    )
    runs = session.scalars(
        select(models.AgentRun)
        .where(models.AgentRun.user_id == actor.user.id)
        .order_by(models.AgentRun.started_at.desc(), models.AgentRun.created_at.desc())
        .limit(limit)
    ).all()
    calls: dict[UUID, list[models.AgentToolCall]] = defaultdict(list)
    for call in session.scalars(
        select(models.AgentToolCall)
        .where(models.AgentToolCall.run_id.in_([run.id for run in runs]))
        .order_by(models.AgentToolCall.position)
    ).all():
        calls[call.run_id].append(call)
    return schemas.AgentActivityRead(
        total=total or 0,
        tool_call_count=sum(len(items) for items in calls.values()),
        runs=[_run_read(run, calls[run.id]) for run in runs],
    )


def record_agent_run(
    session: Session, actor: AuthenticatedUser, payload: schemas.AgentRunCreate
) -> schemas.AgentRunRead:
    run = models.AgentRun(
        user_id=actor.user.id,
        kind=payload.kind,
        title=payload.title,
        detail=payload.detail,
        status=payload.status,
        finished_at=None if payload.status == models.AgentRunStatus.running else models.utc_now(),
    )
    session.add(run)
    session.flush()
    calls = [
        models.AgentToolCall(run_id=run.id, position=position, **call.model_dump())
        for position, call in enumerate(payload.tool_calls)
    ]
    session.add_all(calls)
    session.commit()
    return _run_read(run, calls)


def _run_read(run: models.AgentRun, calls: list[models.AgentToolCall]) -> schemas.AgentRunRead:
    return schemas.AgentRunRead(
        id=run.id,
        kind=run.kind,
        title=run.title,
        detail=run.detail,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        tool_calls=[schemas.AgentToolCallRead.model_validate(call) for call in calls],
    )
