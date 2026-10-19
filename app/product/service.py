from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read, require_write
from app.auth.service import AuthenticatedUser
from app.db import models


def remaining_hours(assignment: models.Assignment) -> float:
    if assignment.status in models.INACTIVE_ASSIGNMENT_STATUSES:
        return 0.0
    return round(assignment.estimated_hours * (100 - assignment.progress) / 100, 2)


def course_summaries(
    session: Session,
    actor: AuthenticatedUser,
    *,
    query: str | None,
    semester_id: UUID | None,
    has_open_assignments: bool | None,
) -> list[schemas.CourseSummaryRead]:
    courses = [
        course
        for course in session.scalars(select(models.Course).order_by(models.Course.code)).all()
        if can_read(session, actor, course)
    ]
    normalized_query = query.casefold().strip() if query else None
    result: list[schemas.CourseSummaryRead] = []
    for course in courses:
        if semester_id is not None and course.semester_id != semester_id:
            continue
        if (
            normalized_query
            and normalized_query
            not in f"{course.code} {course.name} {course.instructor_name or ''}".casefold()
        ):
            continue
        assignments = list(
            session.scalars(
                select(models.Assignment).where(
                    models.Assignment.course_id == course.id,
                    models.Assignment.owner_user_id == actor.user.id,
                )
            ).all()
        )
        open_assignments = [
            assignment
            for assignment in assignments
            if assignment.status not in models.INACTIVE_ASSIGNMENT_STATUSES
        ]
        if has_open_assignments is not None and bool(open_assignments) != has_open_assignments:
            continue
        completed_count = len(assignments) - len(open_assignments)
        result.append(
            schemas.CourseSummaryRead(
                **schemas.CourseRead.model_validate(course).model_dump(),
                assignment_count=len(assignments),
                completed_assignment_count=completed_count,
                completion_percent=round(completed_count / len(assignments) * 100)
                if assignments
                else 0,
                remaining_hours=float(
                    round(sum(remaining_hours(item) for item in open_assignments), 2)
                ),
                next_due_at=min((item.due_at for item in open_assignments), default=None),
            )
        )
    return result


def assignment_summaries(
    session: Session,
    actor: AuthenticatedUser,
    *,
    query: str | None = None,
    course_id: UUID | None = None,
    statuses: list[models.AssignmentStatus] | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
) -> list[schemas.AssignmentSummaryRead]:
    normalized_query = query.casefold().strip() if query else None
    # "My" views: even an administrator sees only their own assignments here. Faculty-wide
    # numbers come from the anonymised admin overview, never from individual records.
    assignments = [
        item
        for item in session.scalars(
            select(models.Assignment)
            .where(models.Assignment.owner_user_id == actor.user.id)
            .order_by(models.Assignment.due_at)
        ).all()
        if can_read(session, actor, item)
    ]
    result: list[schemas.AssignmentSummaryRead] = []
    for assignment in assignments:
        if course_id is not None and assignment.course_id != course_id:
            continue
        if statuses and assignment.status not in statuses:
            continue
        if due_from is not None and _aware(assignment.due_at) < _aware(due_from):
            continue
        if due_to is not None and _aware(assignment.due_at) > _aware(due_to):
            continue
        course = session.get(models.Course, assignment.course_id)
        if course is None:
            continue
        if (
            normalized_query
            and normalized_query not in f"{assignment.title} {course.code} {course.name}".casefold()
        ):
            continue
        tasks = list(
            session.scalars(
                select(models.Task).where(models.Task.assignment_id == assignment.id)
            ).all()
        )
        document_count = len(
            session.scalars(
                select(models.Document.id).where(models.Document.assignment_id == assignment.id)
            ).all()
        )
        result.append(
            schemas.AssignmentSummaryRead(
                **schemas.AssignmentRead.model_validate(assignment).model_dump(),
                course_code=course.code,
                course_name=course.name,
                task_count=len(tasks),
                completed_task_count=sum(
                    task.status == models.TaskStatus.completed for task in tasks
                ),
                document_count=document_count,
                remaining_hours=float(remaining_hours(assignment)),
            )
        )
    return result


def schedule_week(
    session: Session,
    actor: AuthenticatedUser,
    week_start: date | None,
) -> schemas.ScheduleWeekRead:
    start_date = week_start or date.today() - timedelta(days=date.today().weekday())
    end_date = start_date + timedelta(days=6)
    timezone = _user_timezone(session, actor.user)
    start_at = datetime.combine(start_date, time.min, timezone)
    end_at = datetime.combine(end_date + timedelta(days=1), time.min, timezone)
    events = [
        event
        for event in session.scalars(
            select(models.ScheduleEvent)
            .where(
                models.ScheduleEvent.user_id == actor.user.id,
                models.ScheduleEvent.starts_at < end_at,
                models.ScheduleEvent.ends_at > start_at,
            )
            .order_by(models.ScheduleEvent.starts_at)
        ).all()
        if can_read(session, actor, event)
    ]
    settings = get_settings_model(session, actor.user.id)
    slots = _free_slots(start_date, events, settings, timezone)
    scheduled_study = sum(
        (_aware(event.ends_at) - _aware(event.starts_at)).total_seconds() / 3600
        for event in events
        if event.kind == models.ScheduleEventKind.study_session
    )
    due_assignments = [
        item
        for item in session.scalars(
            select(models.Assignment).where(
                models.Assignment.owner_user_id == actor.user.id,
                models.Assignment.due_at >= start_at,
                models.Assignment.due_at < end_at,
                models.Assignment.status.not_in(models.INACTIVE_ASSIGNMENT_STATUSES),
            )
        ).all()
        if can_read(session, actor, item)
    ]
    required = sum(remaining_hours(item) for item in due_assignments)
    return schemas.ScheduleWeekRead(
        week_start=start_date,
        week_end=end_date,
        events=[schemas.ScheduleEventRead.model_validate(item) for item in events],
        free_time=slots,
        scheduled_study_hours=float(round(scheduled_study, 2)),
        free_hours=float(round(sum(slot.duration_hours for slot in slots), 2)),
        unscheduled_work_hours=float(round(max(required - scheduled_study, 0), 2)),
    )


def kanban_board(
    session: Session,
    actor: AuthenticatedUser,
    *,
    query: str | None,
    course_id: UUID | None,
    assignment_id: UUID | None,
    priority: models.Priority | None,
    include_completed: bool,
) -> schemas.KanbanBoardRead:
    normalized_query = query.casefold().strip() if query else None
    tasks: list[models.Task] = []
    course_by_task: dict[UUID, UUID] = {}
    for task in session.scalars(select(models.Task).order_by(models.Task.created_at)).all():
        if not can_read(session, actor, task):
            continue
        assignment = session.get(models.Assignment, task.assignment_id)
        if assignment is None or assignment.owner_user_id != actor.user.id:
            continue
        if course_id is not None and assignment.course_id != course_id:
            continue
        if assignment_id is not None and task.assignment_id != assignment_id:
            continue
        if priority is not None and task.priority != priority:
            continue
        if not include_completed and task.status == models.TaskStatus.completed:
            continue
        if (
            normalized_query
            and normalized_query not in f"{task.title} {task.description or ''}".casefold()
        ):
            continue
        tasks.append(task)
        course_by_task[task.id] = assignment.course_id
    columns: list[schemas.KanbanColumnRead] = []
    for column_status in models.TaskStatus:
        column_tasks = [task for task in tasks if task.status == column_status]
        columns.append(
            schemas.KanbanColumnRead(
                status=column_status,
                task_count=len(column_tasks),
                estimated_hours=float(round(sum(task.estimated_hours for task in column_tasks), 2)),
                tasks=[
                    schemas.KanbanTaskRead.model_validate(
                        {
                            **schemas.TaskRead.model_validate(task).model_dump(),
                            "course_id": course_by_task[task.id],
                        }
                    )
                    for task in column_tasks
                ],
            )
        )
    open_tasks = [task for task in tasks if task.status != models.TaskStatus.completed]
    return schemas.KanbanBoardRead(
        total_tasks=len(tasks),
        open_tasks=len(open_tasks),
        open_estimated_hours=float(round(sum(task.estimated_hours for task in open_tasks), 2)),
        columns=columns,
    )


def workload(
    session: Session, actor: AuthenticatedUser, week_start: date | None
) -> schemas.WorkloadRead:
    schedule = schedule_week(session, actor, week_start)
    timezone = _user_timezone(session, actor.user)
    start_at = datetime.combine(schedule.week_start, time.min, timezone)
    end_at = datetime.combine(schedule.week_end + timedelta(days=1), time.min, timezone)
    assignments = [
        item
        for item in session.scalars(
            select(models.Assignment).where(
                models.Assignment.owner_user_id == actor.user.id,
                models.Assignment.status.not_in(models.INACTIVE_ASSIGNMENT_STATUSES),
            )
        ).all()
        if can_read(session, actor, item)
    ]
    due_this_week = [item for item in assignments if start_at <= _aware(item.due_at) < end_at]
    course_hours: dict[UUID, float] = defaultdict(float)
    for assignment in assignments:
        course_hours[assignment.course_id] += remaining_hours(assignment)
    by_course: list[schemas.WorkloadCourseRead] = []
    for course_id, hours in course_hours.items():
        course = session.get(models.Course, course_id)
        if course is not None:
            by_course.append(
                schemas.WorkloadCourseRead(
                    course_id=course.id,
                    course_code=course.code,
                    course_name=course.name,
                    remaining_hours=float(round(hours, 2)),
                )
            )
    by_course.sort(key=lambda item: item.remaining_hours, reverse=True)
    day_required: dict[date, float] = defaultdict(float)
    for assignment in due_this_week:
        day_required[_aware(assignment.due_at).astimezone(timezone).date()] += remaining_hours(
            assignment
        )
    day_available: dict[date, float] = defaultdict(float)
    for slot in schedule.free_time:
        day_available[slot.starts_at.astimezone(timezone).date()] += slot.duration_hours
    by_day = [
        schemas.WorkloadDayRead(
            day=day,
            required_hours=float(round(day_required[day], 2)),
            available_hours=float(round(day_available[day], 2)),
            overload_hours=float(round(max(day_required[day] - day_available[day], 0), 2)),
        )
        for day in (schedule.week_start + timedelta(days=index) for index in range(7))
    ]
    required = round(sum(remaining_hours(item) for item in due_this_week), 2)
    peak = max(by_day, key=lambda item: item.required_hours, default=None)
    return schemas.WorkloadRead(
        week_start=schedule.week_start,
        week_end=schedule.week_end,
        required_hours=float(required),
        available_hours=schedule.free_hours,
        overload_hours=float(round(max(required - schedule.free_hours, 0), 2)),
        scheduled_study_hours=schedule.scheduled_study_hours,
        unscheduled_hours=float(round(max(required - schedule.scheduled_study_hours, 0), 2)),
        peak_day=peak.day if peak and peak.required_hours > 0 else None,
        by_course=by_course,
        by_day=by_day,
    )


def study_statistics(session: Session, actor: AuthenticatedUser) -> schemas.StudyStatisticsRead:
    assignments = [
        item
        for item in session.scalars(
            select(models.Assignment).where(
                models.Assignment.owner_user_id == actor.user.id,
                models.Assignment.status == models.AssignmentStatus.completed,
            )
        ).all()
        if can_read(session, actor, item)
    ]
    completed: list[schemas.CompletedAssignmentStatRead] = []
    for assignment in assignments:
        course = session.get(models.Course, assignment.course_id)
        actual = assignment.actual_hours or assignment.estimated_hours
        completed.append(
            schemas.CompletedAssignmentStatRead(
                assignment_id=assignment.id,
                title=assignment.title,
                course_name=course.name if course else "Unknown course",
                estimated_hours=float(assignment.estimated_hours),
                actual_hours=float(actual),
                delta_hours=float(round(actual - assignment.estimated_hours, 2)),
            )
        )
    total_actual = sum(item.actual_hours or item.estimated_hours for item in assignments)
    error = sum(
        abs((item.actual_hours or item.estimated_hours) - item.estimated_hours)
        for item in assignments
    )
    accuracy = round(max(0, 100 - error / total_actual * 100)) if total_actual else 100
    everything = [
        item
        for item in session.scalars(
            select(models.Assignment).where(models.Assignment.owner_user_id == actor.user.id)
        ).all()
        if can_read(session, actor, item)
    ]
    return schemas.StudyStatisticsRead(
        reported_study_hours=float(round(total_actual, 2)),
        estimate_accuracy_percent=accuracy,
        completed_assignments=len(assignments),
        completed=completed,
        weekly=_weekly_stats(everything, _user_timezone(session, actor.user)),
        by_course=_course_stats(session, assignments),
    )


def _weekly_stats(
    assignments: list[models.Assignment], timezone: ZoneInfo, weeks: int = 8
) -> list[schemas.WeeklyStatRead]:
    """Planned vs reported hours by the week each assignment was due (no activity log exists)."""
    today = datetime.now(timezone).date()
    current = today - timedelta(days=today.weekday())
    starts = [current - timedelta(weeks=offset) for offset in range(weeks - 1, -1, -1)]
    planned: dict[date, float] = defaultdict(float)
    actual: dict[date, float] = defaultdict(float)
    for item in assignments:
        due = _aware(item.due_at).astimezone(timezone).date()
        week = due - timedelta(days=due.weekday())
        planned[week] += item.estimated_hours
        if item.status == models.AssignmentStatus.completed:
            actual[week] += item.actual_hours or item.estimated_hours
    return [
        schemas.WeeklyStatRead(
            week_start=start,
            planned_hours=float(round(planned[start], 2)),
            actual_hours=float(round(actual[start], 2)),
        )
        for start in starts
    ]


def _course_stats(
    session: Session, completed: list[models.Assignment]
) -> list[schemas.CourseStatRead]:
    grouped: dict[UUID, list[models.Assignment]] = defaultdict(list)
    for item in completed:
        grouped[item.course_id].append(item)
    result: list[schemas.CourseStatRead] = []
    for course_id, items in grouped.items():
        course = session.get(models.Course, course_id)
        estimated = sum(item.estimated_hours for item in items)
        actual = sum(item.actual_hours or item.estimated_hours for item in items)
        error = sum(
            abs((item.actual_hours or item.estimated_hours) - item.estimated_hours)
            for item in items
        )
        result.append(
            schemas.CourseStatRead(
                course_id=course_id,
                course_name=course.name if course else "Unknown course",
                completed_assignments=len(items),
                estimated_hours=float(round(estimated, 2)),
                actual_hours=float(round(actual, 2)),
                estimate_accuracy_percent=round(max(0, 100 - error / actual * 100))
                if actual
                else None,
            )
        )
    return result


def get_settings_model(session: Session, user_id: UUID) -> models.UserSettings:
    existing = session.get(models.UserSettings, user_id)
    if existing is not None:
        return existing
    settings = models.UserSettings(
        user_id=user_id,
        interface_language="en",
        max_study_hours_per_day=4.0,
        earliest_start=time(8, 0),
        latest_end=time(20, 0),
        proactive_insights=True,
        automatic_task_generation=True,
        share_anonymized_completion_times=False,
        deadline_reminders=True,
        daily_briefing=True,
        event_suggestions=True,
    )
    session.add(settings)
    session.flush()
    return settings


def settings_read(session: Session, actor: AuthenticatedUser) -> schemas.SettingsRead:
    settings = get_settings_model(session, actor.user.id)
    return schemas.SettingsRead(
        full_name=actor.user.full_name,
        program=actor.user.program,
        group_name=settings.group_name,
        interface_language=settings.interface_language,
        max_study_hours_per_day=float(settings.max_study_hours_per_day),
        earliest_start=settings.earliest_start,
        latest_end=settings.latest_end,
        proactive_insights=settings.proactive_insights,
        automatic_task_generation=settings.automatic_task_generation,
        share_anonymized_completion_times=settings.share_anonymized_completion_times,
        deadline_reminders=settings.deadline_reminders,
        daily_briefing=settings.daily_briefing,
        event_suggestions=settings.event_suggestions,
    )


def update_settings(
    session: Session, actor: AuthenticatedUser, payload: schemas.SettingsUpdate
) -> schemas.SettingsRead:
    settings = session.get(models.UserSettings, actor.user.id)
    if settings is None:
        settings = models.UserSettings(user_id=actor.user.id)
        session.add(settings)
    changes = payload.model_dump(exclude_unset=True)
    for profile_field in ("full_name", "program"):
        if profile_field in changes:
            setattr(actor.user, profile_field, changes.pop(profile_field))
    for field, value in changes.items():
        setattr(settings, field, value)
    if settings.latest_end <= settings.earliest_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="latest_end must be after earliest_start",
        )
    session.commit()
    session.refresh(settings)
    return settings_read(session, actor)


def list_insights(
    session: Session,
    actor: AuthenticatedUser,
    insight_status: models.InsightStatus | None,
) -> list[models.Insight]:
    statement = select(models.Insight).where(models.Insight.user_id == actor.user.id)
    if insight_status is not None:
        statement = statement.where(models.Insight.status == insight_status)
    return list(session.scalars(statement.order_by(models.Insight.created_at.desc())).all())


def create_insight(
    session: Session, actor: AuthenticatedUser, payload: schemas.InsightCreate
) -> models.Insight:
    target = session.get(models.User, payload.user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Target user not found")
    is_platform_admin = "platform_admin" in actor.roles
    is_matching_admin = (
        "academic_admin" in actor.roles
        and actor.user.institution_id is not None
        and target.institution_id == actor.user.institution_id
    )
    if not (is_platform_admin or is_matching_admin):
        raise HTTPException(status_code=403, detail="Only an administrator can create insights")
    values = payload.model_dump()
    values["cta"] = payload.cta.model_dump()
    insight = models.Insight(**values)
    session.add(insight)
    session.commit()
    session.refresh(insight)
    return insight


def update_insight_status(
    session: Session,
    actor: AuthenticatedUser,
    insight_id: UUID,
    payload: schemas.InsightStatusUpdate,
) -> models.Insight:
    insight = _owned_insight(session, actor, insight_id)
    if payload.status == models.InsightStatus.applied:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Use the apply endpoint to apply an insight",
        )
    insight.status = payload.status
    insight.snoozed_until = (
        payload.snoozed_until if payload.status == models.InsightStatus.snoozed else None
    )
    session.commit()
    session.refresh(insight)
    return insight


def apply_insight(
    session: Session, actor: AuthenticatedUser, insight_id: UUID
) -> schemas.InsightApplyRead:
    insight = _owned_insight(session, actor, insight_id)
    if insight.status == models.InsightStatus.applied:
        return schemas.InsightApplyRead(insight=schemas.InsightRead.model_validate(insight))
    payload = insight.action_payload or {}
    created_ids: list[UUID] = []
    resource_type: str | None = None
    if insight.action_type == models.InsightActionType.create_study_session:
        event_payload = schemas.ScheduleEventCreate.model_validate(
            {**payload, "user_id": actor.user.id, "kind": "study_session"}
        )
        event = models.ScheduleEvent(**event_payload.model_dump())
        require_write(session, actor, event)
        from app.product import scheduling  # imported here: scheduling depends on this module

        scheduling.check_study_session(
            session,
            actor,
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            task_id=event.task_id,
        )
        session.add(event)
        session.flush()
        created_ids.append(event.id)
        resource_type = "schedule_event"
    elif insight.action_type == models.InsightActionType.import_tasks:
        assignment_id = UUID(str(payload.get("assignment_id")))
        assignment = session.get(models.Assignment, assignment_id)
        if assignment is None:
            raise HTTPException(status_code=404, detail="Assignment not found")
        require_write(session, actor, assignment)
        raw_tasks = payload.get("tasks")
        if not isinstance(raw_tasks, list):
            raise HTTPException(status_code=422, detail="Insight task payload is invalid")
        for raw_task in raw_tasks:
            if not isinstance(raw_task, dict):
                raise HTTPException(status_code=422, detail="Insight task payload is invalid")
            task_payload = schemas.TaskCreate.model_validate(
                {**raw_task, "assignment_id": assignment_id}
            )
            task = models.Task(**task_payload.model_dump())
            session.add(task)
            session.flush()
            created_ids.append(task.id)
        resource_type = "task"
    elif insight.action_type == models.InsightActionType.update_assignment:
        assignment_id = UUID(str(payload.get("assignment_id")))
        assignment = session.get(models.Assignment, assignment_id)
        if assignment is None:
            raise HTTPException(status_code=404, detail="Assignment not found")
        require_write(session, actor, assignment)
        changes = payload.get("changes")
        if not isinstance(changes, dict):
            raise HTTPException(status_code=422, detail="Insight assignment payload is invalid")
        validated = schemas.AssignmentUpdate.model_validate(changes)
        for field, value in validated.model_dump(exclude_unset=True).items():
            setattr(assignment, field, value)
        created_ids.append(assignment.id)
        resource_type = "assignment"
    else:
        raise HTTPException(status_code=422, detail="This insight has no applicable action")
    insight.status = models.InsightStatus.applied
    insight.applied_at = datetime.now(UTC)
    session.add(
        models.AuditEvent(
            actor_user_id=actor.user.id,
            action="insight.apply",
            resource_type="insight",
            resource_id=insight.id,
            context_data={"created_resource_ids": [str(item) for item in created_ids]},
        )
    )
    session.commit()
    session.refresh(insight)
    return schemas.InsightApplyRead(
        insight=schemas.InsightRead.model_validate(insight),
        created_resource_type=resource_type,
        created_resource_ids=created_ids,
    )


def _owned_insight(session: Session, actor: AuthenticatedUser, insight_id: UUID) -> models.Insight:
    insight = session.get(models.Insight, insight_id)
    if insight is None or insight.user_id != actor.user.id:
        raise HTTPException(status_code=404, detail="Insight not found")
    return insight


def _free_slots(
    start_date: date,
    events: list[models.ScheduleEvent],
    settings: models.UserSettings,
    timezone: ZoneInfo,
) -> list[schemas.FreeTimeSlotRead]:
    result: list[schemas.FreeTimeSlotRead] = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        cursor = datetime.combine(day, settings.earliest_start, timezone)
        day_end = datetime.combine(day, settings.latest_end, timezone)
        day_events = sorted(
            (
                (
                    _aware(event.starts_at).astimezone(timezone),
                    _aware(event.ends_at).astimezone(timezone),
                )
                for event in events
                if _aware(event.starts_at).astimezone(timezone).date() == day
            ),
            key=lambda item: item[0],
        )
        # Study already booked that day uses up part of the daily limit.
        remaining_capacity = settings.max_study_hours_per_day - sum(
            (_aware(event.ends_at) - _aware(event.starts_at)).total_seconds() / 3600
            for event in events
            if event.kind == models.ScheduleEventKind.study_session
            and _aware(event.starts_at).astimezone(timezone).date() == day
        )
        for event_start, event_end in [*day_events, (day_end, day_end)]:
            gap_end = min(event_start, day_end)
            if gap_end > cursor and remaining_capacity > 0:
                duration = min((gap_end - cursor).total_seconds() / 3600, remaining_capacity)
                if duration >= 0.5:
                    slot_end = cursor + timedelta(hours=duration)
                    result.append(
                        schemas.FreeTimeSlotRead(
                            starts_at=cursor,
                            ends_at=slot_end,
                            duration_hours=float(round(duration, 2)),
                        )
                    )
                    remaining_capacity -= duration
            cursor = max(cursor, event_end)
            if cursor >= day_end:
                break
    return result


def _user_timezone(session: Session, user: models.User) -> ZoneInfo:
    timezone_name = "UTC"
    if user.institution_id is not None:
        institution = session.get(models.Institution, user.institution_id)
        if institution is not None:
            timezone_name = institution.timezone_name
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value
