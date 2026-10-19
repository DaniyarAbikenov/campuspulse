"""Faculty-level aggregates for administrators.

Privacy: nothing here identifies a student. Every figure is computed over a group of distinct
students and is withheld (``None``) when the group is smaller than the minimum cohort size, so a
small course can never reveal one person's workload.
"""

from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from statistics import median
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.service import AuthenticatedUser
from app.core.config import settings
from app.db import models
from app.product import service

WEEKS = 8
ADMIN_ROLES = ("academic_admin", "platform_admin")
DEFAULT_DAILY_HOURS = 4.0


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _resolve_institution(
    session: Session, actor: AuthenticatedUser, institution_id: UUID | None
) -> models.Institution:
    if not any(role in actor.roles for role in ADMIN_ROLES):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Administrator access is required")
    wanted = actor.user.institution_id
    if "platform_admin" in actor.roles and institution_id is not None:
        wanted = institution_id
    institution = session.get(models.Institution, wanted) if wanted else None
    if institution is None and "platform_admin" in actor.roles:
        institution = session.scalars(
            select(models.Institution).order_by(models.Institution.name)
        ).first()
    if institution is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No institution to report on")
    return institution


def overview(
    session: Session, actor: AuthenticatedUser, institution_id: UUID | None = None
) -> schemas.AdminOverviewRead:
    k = settings.admin_min_cohort_size
    institution = _resolve_institution(session, actor, institution_id)
    semester = session.scalars(
        select(models.Semester)
        .where(models.Semester.institution_id == institution.id)
        .order_by(models.Semester.starts_on.desc())
    ).first()
    courses = (
        list(
            session.scalars(
                select(models.Course)
                .where(models.Course.semester_id == semester.id)
                .order_by(models.Course.code)
            )
        )
        if semester
        else []
    )
    course_ids = {course.id for course in courses}
    students_by_course: dict[UUID, set[UUID]] = defaultdict(set)
    for enrollment in session.scalars(
        select(models.Enrollment).where(
            models.Enrollment.course_id.in_(course_ids or {UUID(int=0)})
        )
    ):
        students_by_course[enrollment.course_id].add(enrollment.user_id)
    all_students = set().union(*students_by_course.values()) if students_by_course else set()

    assignments = list(
        session.scalars(
            select(models.Assignment).where(
                models.Assignment.course_id.in_(course_ids or {UUID(int=0)}),
                models.Assignment.owner_user_id.is_not(None),
            )
        )
    )
    daily = {
        row.user_id: row.max_study_hours_per_day
        for row in session.scalars(
            select(models.UserSettings).where(
                models.UserSettings.user_id.in_(all_students or {UUID(int=0)})
            )
        )
    }
    now = datetime.now(UTC)
    horizon = now + timedelta(days=7)

    rows: list[schemas.AdminCourseRead] = []
    for course in courses:
        students = students_by_course.get(course.id, set())
        mine = [
            item
            for item in assignments
            if item.course_id == course.id and item.owner_user_id in students
        ]
        open_items = [
            item for item in mine if item.status not in models.INACTIVE_ASSIGNMENT_STATUSES
        ]
        visible = len(students) >= k
        done = [item for item in mine if item.status == models.AssignmentStatus.completed]
        done_owners = {item.owner_user_id for item in done}
        reported_visible = len(done_owners) >= k
        error = sum(abs((i.actual_hours or i.estimated_hours) - i.estimated_hours) for i in done)
        actual_total = sum(i.actual_hours or i.estimated_hours for i in done)
        risk = _risk_percent(students, assignments, daily, now, horizon) if visible else None
        rows.append(
            schemas.AdminCourseRead(
                course_id=course.id,
                code=course.code,
                name=course.name,
                instructor_name=course.instructor_name,
                suppressed=not visible,
                enrolled_students=len(students) if visible else None,
                open_assignments=len(open_items),
                median_estimate_hours=float(median([i.estimated_hours for i in mine]))
                if visible and mine
                else None,
                median_reported_hours=float(
                    median([i.actual_hours or i.estimated_hours for i in done])
                )
                if reported_visible and done
                else None,
                estimate_accuracy_percent=round(max(0, 100 - error / actual_total * 100))
                if reported_visible and actual_total
                else None,
                overload_risk_percent=risk,
            )
        )

    weekly = _weekly(assignments, k)
    visible_weeks = [w for w in weekly if w.estimated_hours_per_student is not None]
    peak = max(visible_weeks, key=lambda w: w.estimated_hours_per_student or 0, default=None)
    risky = [row for row in rows if row.overload_risk_percent is not None]
    highest = max(risky, key=lambda row: row.overload_risk_percent or 0, default=None)
    return schemas.AdminOverviewRead(
        institution_name=institution.name,
        semester_name=semester.name if semester else None,
        min_cohort_size=k,
        totals=schemas.AdminTotalsRead(
            students=len(all_students) if len(all_students) >= k else None,
            enrolments=sum(len(s) for s in students_by_course.values())
            if len(all_students) >= k
            else None,
            courses=len(courses),
            open_assignments=sum(
                1 for item in assignments if item.status not in models.INACTIVE_ASSIGNMENT_STATUSES
            ),
        ),
        courses=rows,
        weekly=weekly,
        peak_week=peak.week_start if peak else None,
        peak_hours_per_student=peak.estimated_hours_per_student if peak else None,
        highest_risk_course=highest.name if highest else None,
        highest_risk_percent=highest.overload_risk_percent if highest else None,
        activity=_activity(session, all_students, k),
    )


def _risk_percent(
    students: set[UUID],
    assignments: list[models.Assignment],
    daily: dict[UUID, float],
    now: datetime,
    horizon: datetime,
) -> int:
    """Share of the students whose work due within a week exceeds a week of their study capacity."""
    over = 0
    for student in students:
        due = sum(
            service.remaining_hours(item)
            for item in assignments
            if item.owner_user_id == student
            and item.status not in models.INACTIVE_ASSIGNMENT_STATUSES
            and now <= _aware(item.due_at) < horizon
        )
        if due > daily.get(student, DEFAULT_DAILY_HOURS) * 7:
            over += 1
    return round(over / len(students) * 100) if students else 0


def _weekly(assignments: list[models.Assignment], k: int) -> list[schemas.AdminWeekRead]:
    today = datetime.now(UTC).date()
    current = today - timedelta(days=today.weekday())
    starts = [current - timedelta(weeks=offset) for offset in range(WEEKS - 1, -1, -1)]
    estimated: dict[date, float] = defaultdict(float)
    reported: dict[date, float] = defaultdict(float)
    owners: dict[date, set[UUID]] = defaultdict(set)
    for item in assignments:
        due = _aware(item.due_at).date()
        week = due - timedelta(days=due.weekday())
        estimated[week] += item.estimated_hours
        owners[week].add(item.owner_user_id)  # type: ignore[arg-type]
        if item.status == models.AssignmentStatus.completed:
            reported[week] += item.actual_hours or item.estimated_hours
    result = []
    for start in starts:
        n = len(owners[start])
        shown = n >= k
        result.append(
            schemas.AdminWeekRead(
                week_start=start,
                estimated_hours_per_student=float(round(estimated[start] / n, 2))
                if shown
                else None,
                reported_hours_per_student=float(round(reported[start] / n, 2)) if shown else None,
            )
        )
    return result


def _activity(session: Session, students: set[UUID], k: int) -> list[schemas.AdminActivityRead]:
    """Counts of what happened in the last 7 days, never who did it."""
    since = datetime.now(UTC) - timedelta(days=7)
    ids = students or {UUID(int=0)}

    def entry(kind: str, title: str, owners: Sequence[UUID]) -> schemas.AdminActivityRead:
        visible = len(set(owners)) >= k
        return schemas.AdminActivityRead(
            kind=kind, title=title, count=len(owners) if visible else None
        )

    plans = [
        (row.user_id, row.status)
        for row in session.scalars(
            select(models.TaskPlan).where(
                models.TaskPlan.user_id.in_(ids), models.TaskPlan.created_at >= since
            )
        )
    ]
    sessions_planned = session.scalars(
        select(models.ScheduleEvent.user_id).where(
            models.ScheduleEvent.user_id.in_(ids),
            models.ScheduleEvent.created_at >= since,
            models.ScheduleEvent.kind == models.ScheduleEventKind.study_session,
        )
    ).all()
    chats = session.scalars(
        select(models.AgentRun.user_id).where(
            models.AgentRun.user_id.in_(ids),
            models.AgentRun.created_at >= since,
            models.AgentRun.kind == models.AgentRunKind.chat,
        )
    ).all()
    imports = session.scalars(
        select(models.ImportProposal.user_id).where(
            models.ImportProposal.user_id.in_(ids),
            models.ImportProposal.created_at >= since,
            models.ImportProposal.status == models.ImportStatus.applied,
        )
    ).all()
    return [
        entry("analysis", "Assignment analyses proposed", [user for user, _ in plans]),
        entry(
            "task",
            "Task plans approved",
            [user for user, state in plans if state == models.PlanStatus.applied],
        ),
        entry("schedule", "Study sessions planned", sessions_planned),
        entry("insight", "Agent conversations", chats),
        entry("index", "Moodle imports approved", imports),
    ]
