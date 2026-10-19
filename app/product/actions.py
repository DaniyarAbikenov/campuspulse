"""Changes the agent proposes in chat. They are stored as pending actions; the student sees
an "Apply …" window and nothing changes until they confirm."""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read, require_write
from app.auth.service import AuthenticatedUser
from app.db import models
from app.product import manage, scheduling, service

PENDING_LIMIT = 20


def _read(action: models.AgentAction) -> schemas.AgentActionRead:
    return schemas.AgentActionRead(
        id=action.id,
        kind=action.kind,
        title=action.title,
        summary=action.summary,
        payload=dict(action.payload),
        status=action.status,
        created_at=action.created_at,
    )


def _uuid(value: Any, label: str) -> UUID:
    try:
        return UUID(str(value))
    except ValueError as error:
        raise ValueError(f"{label} is not a valid id") from error


def _owned_assignment(session: Session, actor: AuthenticatedUser, value: Any) -> models.Assignment:
    assignment = session.get(models.Assignment, _uuid(value, "assignment_id"))
    if assignment is None or not can_read(session, actor, assignment):
        raise ValueError("That assignment does not exist")
    if assignment.owner_user_id != actor.user.id:
        raise ValueError("That assignment is not yours")
    return assignment


def _owned_task(session: Session, actor: AuthenticatedUser, value: Any) -> models.Task:
    task = session.get(models.Task, _uuid(value, "task_id"))
    if task is None or not can_read(session, actor, task):
        raise ValueError("That task does not exist")
    _owned_assignment(session, actor, task.assignment_id)
    return task


def _event_fields(payload: dict[str, Any], kind: models.ScheduleEventKind) -> dict[str, Any]:
    return schemas.ScheduleEventCreate.model_validate(
        {
            **{key: payload[key] for key in ("title", "starts_at", "ends_at") if key in payload},
            **{key: payload[key] for key in ("location", "course_id", "task_id") if key in payload},
            "user_id": UUID(int=0),
            "kind": kind,
        }
    ).model_dump(mode="json", exclude={"user_id", "kind"}, exclude_none=True)


def normalize(
    session: Session,
    actor: AuthenticatedUser,
    kind: models.AgentActionKind,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Check a proposal against the student's real data; return the stored payload or raise."""
    if kind == models.AgentActionKind.create_study_session:
        fields = _event_fields(payload, models.ScheduleEventKind.study_session)
        if "task_id" in fields:
            _owned_task(session, actor, fields["task_id"])
        return fields
    if kind == models.AgentActionKind.create_calendar_activity:
        return _event_fields(payload, models.ScheduleEventKind.personal)
    if kind == models.AgentActionKind.create_task:
        assignment = _owned_assignment(session, actor, payload.get("assignment_id"))
        draft = schemas.TaskCreate.model_validate(
            {
                "assignment_id": assignment.id,
                "title": payload.get("title"),
                "description": payload.get("description"),
                "estimated_hours": float(payload.get("estimated_hours", 1)),
                "priority": payload.get("priority", "medium"),
                "status": "todo",
            }
        )
        return draft.model_dump(mode="json", exclude_none=True)
    if kind == models.AgentActionKind.update_task_status:
        target = _owned_task(session, actor, payload.get("task_id"))
        new_status = models.TaskStatus(str(payload.get("status")))
        return {"task_id": str(target.id), "status": new_status.value}
    if kind == models.AgentActionKind.cancel_assignment:
        assignment = _owned_assignment(session, actor, payload.get("assignment_id"))
        return {"assignment_id": str(assignment.id)}
    raise ValueError("Unsupported action")


def propose(
    session: Session, actor: AuthenticatedUser, batch: schemas.AgentActionBatch
) -> schemas.AgentActionResult:
    pending = len(
        session.scalars(
            select(models.AgentAction.id).where(
                models.AgentAction.user_id == actor.user.id,
                models.AgentAction.status == models.PlanStatus.pending,
            )
        ).all()
    )
    created: list[models.AgentAction] = []
    rejected: list[schemas.AgentActionRejected] = []
    for item in batch.actions:
        try:
            if pending + len(created) >= PENDING_LIMIT:
                raise ValueError("Too many pending actions; answer the earlier ones first")
            payload = normalize(session, actor, item.kind, item.payload)
        except (ValueError, ValidationError, TypeError) as error:
            rejected.append(schemas.AgentActionRejected(title=item.title, reason=str(error)[:300]))
            continue
        created.append(
            models.AgentAction(
                user_id=actor.user.id,
                kind=item.kind,
                title=item.title,
                summary=item.summary,
                payload=payload,
            )
        )
    session.add_all(created)
    session.commit()
    return schemas.AgentActionResult(created=[_read(item) for item in created], rejected=rejected)


def pending_since(
    session: Session, actor: AuthenticatedUser, since: datetime
) -> list[schemas.AgentActionRead]:
    return [
        _read(item)
        for item in session.scalars(
            select(models.AgentAction)
            .where(
                models.AgentAction.user_id == actor.user.id,
                models.AgentAction.status == models.PlanStatus.pending,
            )
            .order_by(models.AgentAction.created_at)
        )
        if manage._aware(item.created_at) >= since
    ]


def list_pending(session: Session, actor: AuthenticatedUser) -> list[schemas.AgentActionRead]:
    return [
        _read(item)
        for item in session.scalars(
            select(models.AgentAction)
            .where(
                models.AgentAction.user_id == actor.user.id,
                models.AgentAction.status == models.PlanStatus.pending,
            )
            .order_by(models.AgentAction.created_at)
        )
    ]


def _own_action(session: Session, actor: AuthenticatedUser, action_id: UUID) -> models.AgentAction:
    action = session.get(models.AgentAction, action_id)
    if action is None or action.user_id != actor.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    return action


def dismiss(session: Session, actor: AuthenticatedUser, action_id: UUID) -> schemas.AgentActionRead:
    action = _own_action(session, actor, action_id)
    if action.status == models.PlanStatus.pending:
        action.status = models.PlanStatus.dismissed
        session.commit()
    return _read(action)


def apply(
    session: Session, actor: AuthenticatedUser, action_id: UUID
) -> schemas.AgentActionApplyRead:
    action = _own_action(session, actor, action_id)
    if action.status == models.PlanStatus.applied:
        return schemas.AgentActionApplyRead(action=_read(action), detail="Already applied")
    if action.status == models.PlanStatus.dismissed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Action was dismissed")
    try:
        payload = normalize(session, actor, action.kind, dict(action.payload))
    except (ValueError, ValidationError, TypeError) as error:
        raise HTTPException(
            status_code=422, detail=f"No longer valid: {str(error)[:200]}"
        ) from error
    detail = _execute(session, actor, action.kind, payload)
    action.status = models.PlanStatus.applied
    action.applied_at = models.utc_now()
    session.commit()
    return schemas.AgentActionApplyRead(action=_read(action), detail=detail)


def _execute(
    session: Session,
    actor: AuthenticatedUser,
    kind: models.AgentActionKind,
    payload: dict[str, Any],
) -> str:
    if kind in (
        models.AgentActionKind.create_study_session,
        models.AgentActionKind.create_calendar_activity,
    ):
        event_kind = (
            models.ScheduleEventKind.study_session
            if kind == models.AgentActionKind.create_study_session
            else models.ScheduleEventKind.personal
        )
        event = models.ScheduleEvent(
            **schemas.ScheduleEventCreate.model_validate(
                {**payload, "user_id": actor.user.id, "kind": event_kind}
            ).model_dump()
        )
        require_write(session, actor, event)
        if kind == models.AgentActionKind.create_study_session:
            scheduling.check_study_session(
                session,
                actor,
                starts_at=event.starts_at,
                ends_at=event.ends_at,
                task_id=event.task_id,
            )
        else:
            scheduling.check_no_overlap(session, actor, event.starts_at, event.ends_at)
        session.add(event)
        return "Added to your calendar"
    if kind == models.AgentActionKind.create_task:
        task = models.Task(**schemas.TaskCreate.model_validate(payload).model_dump())
        task.is_ai_generated = True
        session.add(task)
        session.flush()
        service.sync_assignment_progress(session, task.assignment_id)
        return "Task added to your board"
    if kind == models.AgentActionKind.update_task_status:
        target = session.get(models.Task, UUID(payload["task_id"]))
        assert target is not None
        target.status = models.TaskStatus(payload["status"])
        session.flush()
        service.sync_assignment_progress(session, target.assignment_id)
        return "Task updated"
    assignment_id = UUID(payload["assignment_id"])
    session.commit()
    result = manage.cancel_assignment(session, actor, assignment_id)
    return f"Assignment cancelled; {result.removed_tasks} open tasks removed"
