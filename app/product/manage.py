"""Create, edit and remove what students own: assignments, repeating schedule series,
campus events and study materials."""

from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read, require_read, require_write
from app.auth.service import AuthenticatedUser
from app.core.config import settings
from app.db import models
from app.documents import service as documents_service
from app.documents.extract import PageText
from app.product.service import _user_timezone

MAX_SERIES_OCCURRENCES = 400
DEFAULT_SERIES_WEEKS = 16


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _remove_file(storage_key: str | None) -> None:
    if storage_key:
        (Path(settings.upload_directory) / storage_key).unlink(missing_ok=True)


# --- assignments -------------------------------------------------------------------------


def _owned_assignment(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID
) -> models.Assignment:
    assignment = session.get(models.Assignment, assignment_id)
    if assignment is None:
        raise _not_found("Assignment")
    require_read(session, actor, assignment)
    require_write(session, actor, assignment)
    return assignment


def _drop_tasks(
    session: Session,
    assignment_id: UUID,
    *,
    only_open: bool,
    sessions_from: datetime | None,
) -> tuple[int, int]:
    """Remove an assignment's tasks and the study sessions booked for them."""
    query = select(models.Task).where(models.Task.assignment_id == assignment_id)
    if only_open:
        query = query.where(models.Task.status != models.TaskStatus.completed)
    tasks = session.scalars(query).all()
    task_ids = [task.id for task in tasks]
    sessions_removed = 0
    if task_ids:
        events = session.scalars(
            select(models.ScheduleEvent).where(models.ScheduleEvent.task_id.in_(task_ids))
        ).all()
        for event in events:
            if sessions_from is None or _aware(event.starts_at) >= sessions_from:
                session.delete(event)
                sessions_removed += 1
    for task in tasks:
        session.delete(task)
    return len(tasks), sessions_removed


def drop_task_sessions(session: Session, task_id: UUID) -> int:
    """Delete the future study sessions booked for a task (past ones stay as history)."""
    now = models.utc_now()
    removed = 0
    for event in session.scalars(
        select(models.ScheduleEvent).where(models.ScheduleEvent.task_id == task_id)
    ):
        if _aware(event.starts_at) >= now:
            session.delete(event)
            removed += 1
    return removed


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=models.utc_now().tzinfo)


def _dismiss_pending_plans(session: Session, assignment_id: UUID) -> None:
    for plan in session.scalars(
        select(models.TaskPlan).where(
            models.TaskPlan.assignment_id == assignment_id,
            models.TaskPlan.status == models.PlanStatus.pending,
        )
    ):
        plan.status = models.PlanStatus.dismissed


def cancel_assignment(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID
) -> schemas.AssignmentChangeRead:
    """Mark it cancelled; its unfinished tasks and their study sessions disappear."""
    assignment = _owned_assignment(session, actor, assignment_id)
    tasks = sessions = 0
    if assignment.status != models.AssignmentStatus.cancelled:
        assignment.status = models.AssignmentStatus.cancelled
        tasks, sessions = _drop_tasks(session, assignment.id, only_open=True, sessions_from=None)
        _dismiss_pending_plans(session, assignment.id)
        session.commit()
        session.refresh(assignment)
    return schemas.AssignmentChangeRead(
        assignment=schemas.AssignmentRead.model_validate(assignment),
        removed_tasks=tasks,
        removed_sessions=sessions,
    )


def reopen_assignment(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID
) -> schemas.AssignmentChangeRead:
    assignment = _owned_assignment(session, actor, assignment_id)
    if assignment.status == models.AssignmentStatus.cancelled:
        assignment.status = models.AssignmentStatus.todo
        session.commit()
        session.refresh(assignment)
    return schemas.AssignmentChangeRead(
        assignment=schemas.AssignmentRead.model_validate(assignment),
        removed_tasks=0,
        removed_sessions=0,
    )


def delete_assignment(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID
) -> schemas.AssignmentChangeRead:
    """Remove the assignment with its tasks, study sessions, plans and uploaded brief."""
    assignment = _owned_assignment(session, actor, assignment_id)
    tasks, sessions = _drop_tasks(session, assignment.id, only_open=False, sessions_from=None)
    session.flush()  # remove the tasks first, so the database cascade does not race the ORM
    keys = []
    for document in session.scalars(
        select(models.Document).where(models.Document.assignment_id == assignment.id)
    ):
        keys.append(document.storage_key)
        session.delete(document)
    snapshot = schemas.AssignmentRead.model_validate(assignment)
    session.execute(delete(models.TaskPlan).where(models.TaskPlan.assignment_id == assignment.id))
    session.delete(assignment)
    session.commit()
    for key in keys:
        _remove_file(key)
    return schemas.AssignmentChangeRead(
        assignment=snapshot, removed_tasks=tasks, removed_sessions=sessions
    )


# --- repeating schedule series ------------------------------------------------------------


def _clock(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def _semester_end(session: Session, actor: AuthenticatedUser, day: date) -> date | None:
    if actor.user.institution_id is None:
        return None
    semesters = session.scalars(
        select(models.Semester)
        .where(
            models.Semester.institution_id == actor.user.institution_id,
            models.Semester.ends_on >= day,
        )
        .order_by(models.Semester.starts_on)
    ).all()
    current = next((item for item in semesters if item.starts_on <= day), None)
    chosen = current or (semesters[0] if semesters else None)
    return chosen.ends_on if chosen is not None else None


def _series_read(session: Session, series: models.ScheduleSeries) -> schemas.ScheduleSeriesRead:
    count = len(
        session.scalars(
            select(models.ScheduleEvent.id).where(models.ScheduleEvent.series_id == series.id)
        ).all()
    )
    return schemas.ScheduleSeriesRead(
        id=series.id,
        title=series.title,
        kind=series.kind,
        weekdays=list(series.weekdays),
        start=_clock(series.start_minute),
        end=_clock(series.end_minute),
        starts_on=series.starts_on,
        ends_on=series.ends_on,
        location=series.location,
        course_id=series.course_id,
        occurrences=count,
    )


def create_series(
    session: Session, actor: AuthenticatedUser, payload: schemas.ScheduleSeriesCreate
) -> schemas.ScheduleSeriesRead:
    ends_on = (
        payload.ends_on
        or _semester_end(session, actor, payload.starts_on)
        or payload.starts_on + timedelta(weeks=DEFAULT_SERIES_WEEKS)
    )
    if ends_on < payload.starts_on:
        raise HTTPException(status_code=422, detail="The series ends before it starts")
    zone = _user_timezone(session, actor.user)
    series = models.ScheduleSeries(
        user_id=actor.user.id,
        course_id=payload.course_id,
        title=payload.title,
        kind=models.ScheduleEventKind(payload.kind),
        weekdays=sorted(set(payload.weekdays)),
        start_minute=_minutes(payload.start),
        end_minute=_minutes(payload.end),
        starts_on=payload.starts_on,
        ends_on=ends_on,
        location=payload.location,
    )
    events: list[models.ScheduleEvent] = []
    day = payload.starts_on
    while day <= ends_on:
        if day.weekday() in series.weekdays:
            events.append(
                models.ScheduleEvent(
                    user_id=actor.user.id,
                    course_id=payload.course_id,
                    title=payload.title,
                    kind=series.kind,
                    starts_at=datetime.combine(
                        day, time(series.start_minute // 60, series.start_minute % 60), zone
                    ),
                    ends_at=datetime.combine(
                        day, time(series.end_minute // 60, series.end_minute % 60), zone
                    ),
                    location=payload.location,
                )
            )
        day += timedelta(days=1)
    if not events:
        raise HTTPException(status_code=422, detail="No matching days between the start and end")
    if len(events) > MAX_SERIES_OCCURRENCES:
        raise HTTPException(
            status_code=422,
            detail=f"That repeats {len(events)} times; the limit is {MAX_SERIES_OCCURRENCES}",
        )
    require_write(session, actor, events[0])
    session.add(series)
    session.flush()
    for event in events:
        event.series_id = series.id
    session.add_all(events)
    session.commit()
    return _series_read(session, series)


def list_series(session: Session, actor: AuthenticatedUser) -> list[schemas.ScheduleSeriesRead]:
    return [
        _series_read(session, item)
        for item in session.scalars(
            select(models.ScheduleSeries)
            .where(models.ScheduleSeries.user_id == actor.user.id)
            .order_by(models.ScheduleSeries.title)
        )
    ]


def delete_series(session: Session, actor: AuthenticatedUser, series_id: UUID) -> int:
    series = session.get(models.ScheduleSeries, series_id)
    if series is None or series.user_id != actor.user.id:
        raise _not_found("Series")
    removed = len(
        session.scalars(
            select(models.ScheduleEvent.id).where(models.ScheduleEvent.series_id == series.id)
        ).all()
    )
    session.execute(delete(models.ScheduleEvent).where(models.ScheduleEvent.series_id == series.id))
    session.delete(series)
    session.commit()
    return removed


# --- campus events -------------------------------------------------------------------------


def can_manage_event(actor: AuthenticatedUser, event: models.CampusEvent) -> bool:
    if "platform_admin" in actor.roles:
        return True
    if "academic_admin" in actor.roles and event.institution_id == actor.user.institution_id:
        return True
    return event.created_by_user_id == actor.user.id


def _event_for_management(
    session: Session, actor: AuthenticatedUser, event_id: UUID
) -> models.CampusEvent:
    event = session.get(models.CampusEvent, event_id)
    if event is None or (
        event.institution_id != actor.user.institution_id and "platform_admin" not in actor.roles
    ):
        raise _not_found("Event")
    if not can_manage_event(actor, event):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the person who added this event or an administrator can change it",
        )
    return event


def create_campus_event(
    session: Session, actor: AuthenticatedUser, payload: schemas.CampusEventCreate
) -> models.CampusEvent:
    if actor.user.institution_id is None:
        raise HTTPException(status_code=422, detail="Finish onboarding before adding events")
    event = models.CampusEvent(
        institution_id=actor.user.institution_id,
        created_by_user_id=actor.user.id,
        **payload.model_dump(),
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def update_campus_event(
    session: Session,
    actor: AuthenticatedUser,
    event_id: UUID,
    payload: schemas.CampusEventUpdate,
) -> models.CampusEvent:
    event = _event_for_management(session, actor, event_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is None and field != "description":
            continue
        setattr(event, field, value)
    if _aware(event.ends_at) <= _aware(event.starts_at):
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")
    session.commit()
    session.refresh(event)
    return event


def delete_campus_event(session: Session, actor: AuthenticatedUser, event_id: UUID) -> None:
    event = _event_for_management(session, actor, event_id)
    session.delete(event)
    session.commit()


# --- study materials -------------------------------------------------------------------------


def create_material(
    session: Session,
    actor: AuthenticatedUser,
    *,
    course_id: UUID,
    kind: models.DocumentKind,
    name: str,
    storage_key: str,
    pages: list[PageText],
) -> models.Document:
    document = models.Document(
        course_id=course_id,
        assignment_id=None,
        name=name,
        kind=kind,
        page_count=len(pages),
        storage_key=storage_key,
    )
    require_write(session, actor, document)
    session.add(document)
    session.flush()
    session.add_all(documents_service.fragments_for(document, pages))
    session.commit()
    session.refresh(document)
    return document


def _material(session: Session, actor: AuthenticatedUser, document_id: UUID) -> models.Document:
    document = session.get(models.Document, document_id)
    if document is None or not can_read(session, actor, document):
        raise _not_found("Material")
    return document


def update_material(
    session: Session,
    actor: AuthenticatedUser,
    document_id: UUID,
    payload: schemas.MaterialUpdate,
) -> models.Document:
    document = _material(session, actor, document_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is not None:
            setattr(document, field, value)
    require_write(session, actor, document)
    session.commit()
    session.refresh(document)
    return document


def delete_material(session: Session, actor: AuthenticatedUser, document_id: UUID) -> None:
    document = _material(session, actor, document_id)
    require_write(session, actor, document)
    key = document.storage_key
    session.delete(document)
    session.commit()
    _remove_file(key)
