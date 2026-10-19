"""Rules every study session must obey, whoever creates it (the student, an insight, the
agent or the planner): no overlap, the daily study limit and the task's own estimate."""

from collections import defaultdict
from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.service import AuthenticatedUser
from app.db import models
from app.product import service

TOLERANCE_HOURS = 0.01
PAST_GRACE = timedelta(minutes=2)


def _hours(start: datetime, end: datetime) -> float:
    return (service._aware(end) - service._aware(start)).total_seconds() / 3600


def booked_hours_by_task(session: Session, user_id: UUID) -> dict[UUID, float]:
    """Hours already booked per task over the whole calendar, not just one week."""
    booked: dict[UUID, float] = defaultdict(float)
    for event in session.scalars(
        select(models.ScheduleEvent).where(
            models.ScheduleEvent.user_id == user_id,
            models.ScheduleEvent.kind == models.ScheduleEventKind.study_session,
            models.ScheduleEvent.task_id.is_not(None),
        )
    ):
        if event.task_id is not None:
            booked[event.task_id] += _hours(event.starts_at, event.ends_at)
    return booked


def check_no_overlap(
    session: Session,
    actor: AuthenticatedUser,
    starts_at: datetime,
    ends_at: datetime,
    exclude_event_id: UUID | None = None,
) -> None:
    clash = session.scalar(
        select(models.ScheduleEvent).where(
            models.ScheduleEvent.user_id == actor.user.id,
            models.ScheduleEvent.starts_at < ends_at,
            models.ScheduleEvent.ends_at > starts_at,
            models.ScheduleEvent.id != exclude_event_id
            if exclude_event_id
            else models.ScheduleEvent.id.is_not(None),
        )
    )
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"That time overlaps “{clash.title}”",
        )


def check_study_session(
    session: Session,
    actor: AuthenticatedUser,
    *,
    starts_at: datetime,
    ends_at: datetime,
    task_id: UUID | None,
    exclude_event_id: UUID | None = None,
    allow_past: bool = False,
) -> None:
    """Raise 409 with a plain explanation unless the session fits the student's limits."""
    if not allow_past and service._aware(starts_at) < service.now_utc() - PAST_GRACE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That time has already passed. Pick a time from now on.",
        )
    check_no_overlap(session, actor, starts_at, ends_at, exclude_event_id)
    settings = service.get_settings_model(session, actor.user.id)
    zone = service._user_timezone(session, actor.user)
    day: date = service._aware(starts_at).astimezone(zone).date()
    new_hours = _hours(starts_at, ends_at)
    same_day = 0.0
    for event in session.scalars(
        select(models.ScheduleEvent).where(
            models.ScheduleEvent.user_id == actor.user.id,
            models.ScheduleEvent.kind == models.ScheduleEventKind.study_session,
        )
    ):
        if event.id != exclude_event_id and (
            service._aware(event.starts_at).astimezone(zone).date() == day
        ):
            same_day += _hours(event.starts_at, event.ends_at)
    limit = settings.max_study_hours_per_day
    if same_day + new_hours > limit + TOLERANCE_HOURS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"That would make {round(same_day + new_hours, 2):g}h of study on "
                f"{day.isoformat()}; your limit is {limit:g}h a day (Settings)"
            ),
        )
    if task_id is not None:
        task = session.get(models.Task, task_id)
        if task is not None:
            booked = booked_hours_by_task(session, actor.user.id)[task_id]
            if exclude_event_id is not None:
                current = session.get(models.ScheduleEvent, exclude_event_id)
                if current is not None and current.task_id == task_id:
                    booked -= _hours(current.starts_at, current.ends_at)
            if booked + new_hours > task.estimated_hours + TOLERANCE_HOURS:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"“{task.title}” already has {round(booked, 2):g}h of "
                        f"{task.estimated_hours:g}h scheduled"
                    ),
                )
