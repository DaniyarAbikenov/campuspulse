"""Fill the week's free time with study sessions for the work that is still unscheduled."""

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read, require_write
from app.auth.service import AuthenticatedUser
from app.db import models
from app.product import scheduling, service

MIN_CHUNK_HOURS = 0.25
PRIORITY_RANK = {models.Priority.high: 0, models.Priority.medium: 1, models.Priority.low: 2}
OPEN_STATUSES = (
    models.TaskStatus.backlog,
    models.TaskStatus.todo,
    models.TaskStatus.in_progress,
    models.TaskStatus.review,
)


def _hours(start: datetime, end: datetime) -> float:
    return (end - start).total_seconds() / 3600


def _floor_quarter(value: float) -> float:
    return int(value * 4) / 4


def plan_week(
    session: Session, actor: AuthenticatedUser, week_start: date | None
) -> schemas.StudyPlanRead:
    """Deterministic greedy plan: earliest deadline first, never past a task's deadline."""
    schedule = service.schedule_week(session, actor, week_start)
    # Hours already booked anywhere in the calendar count, not only those in the shown week.
    booked = scheduling.booked_hours_by_task(session, actor.user.id)

    rows = []
    for task in session.scalars(
        select(models.Task).where(models.Task.status.in_(OPEN_STATUSES))
    ).all():
        assignment = session.get(models.Assignment, task.assignment_id)
        if (
            assignment is None
            or assignment.owner_user_id != actor.user.id
            or assignment.status in models.INACTIVE_ASSIGNMENT_STATUSES
            or not can_read(session, actor, task)
        ):
            continue
        need = round(task.estimated_hours - booked.get(task.id, 0.0), 2)
        if need >= MIN_CHUNK_HOURS:
            rows.append((assignment, task, need))
    rows.sort(key=lambda row: (row[0].due_at, PRIORITY_RANK[row[1].priority], row[1].created_at))

    slots = [[slot.starts_at, slot.ends_at] for slot in schedule.free_time]
    sessions: list[schemas.PlannedSessionRead] = []
    unplaced: list[schemas.UnplacedTaskRead] = []
    for assignment, task, need in rows:
        due = service._aware(assignment.due_at)
        for slot in slots:
            if need < MIN_CHUNK_HOURS:
                break
            slot_end = min(slot[1], due)
            chunk = _floor_quarter(min(need, _hours(slot[0], slot_end)))
            if chunk < MIN_CHUNK_HOURS:
                continue
            end = slot[0] + timedelta(hours=chunk)
            sessions.append(
                schemas.PlannedSessionRead(
                    task_id=task.id,
                    task_title=task.title,
                    assignment_title=assignment.title,
                    course_id=assignment.course_id,
                    starts_at=slot[0],
                    ends_at=end,
                    hours=chunk,
                )
            )
            slot[0] = end
            need = round(need - chunk, 2)
        if need >= MIN_CHUNK_HOURS:
            unplaced.append(
                schemas.UnplacedTaskRead(
                    task_id=task.id,
                    task_title=task.title,
                    assignment_title=assignment.title,
                    due_at=due,
                    hours=float(need),
                )
            )
    sessions.sort(key=lambda item: item.starts_at)
    return schemas.StudyPlanRead(
        week_start=schedule.week_start,
        sessions=sessions,
        unplaced=unplaced,
        placed_hours=float(round(sum(item.hours for item in sessions), 2)),
        unplaced_hours=float(round(sum(item.hours for item in unplaced), 2)),
        free_hours=schedule.free_hours,
    )


def apply_plan(
    session: Session, actor: AuthenticatedUser, week_start: date | None
) -> schemas.StudyPlanApplyRead:
    """Create the proposed sessions. Re-planning afterwards finds nothing left to place."""
    plan = plan_week(session, actor, week_start)
    for item in plan.sessions:
        event = models.ScheduleEvent(
            user_id=actor.user.id,
            course_id=item.course_id,
            task_id=item.task_id,
            title=f"Study: {item.task_title}"[:240],
            kind=models.ScheduleEventKind.study_session,
            starts_at=item.starts_at,
            ends_at=item.ends_at,
        )
        require_write(session, actor, event)
        session.add(event)
    session.commit()
    return schemas.StudyPlanApplyRead(
        created=len(plan.sessions), plan=plan_week(session, actor, plan.week_start)
    )
