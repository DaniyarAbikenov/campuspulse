"""Insights written by the agent: grounded in the student's own data and verified before saving."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read
from app.auth.service import AuthenticatedUser
from app.db import models
from app.product import service

GENERATED_BY = "agent"
REVIEW_ROUTES = {
    "workload_warning": "/workload",
    "deadline_conflict": "/schedule",
    "schedule_opportunity": "/schedule",
    "study_preparation": "/knowledge",
    "assignment_analysis": "/assignments",
}


def _owned_assignment(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID
) -> models.Assignment | None:
    item = session.get(models.Assignment, assignment_id)
    if item is None or item.owner_user_id != actor.user.id or not can_read(session, actor, item):
        return None
    return item


def _verified_sources(
    session: Session, actor: AuthenticatedUser, sources: list[schemas.AgentInsightSource]
) -> tuple[list[schemas.InsightEvidence], models.Assignment | None]:
    """Keep only citations that point at the student's own records (or carry no reference)."""
    kept: list[schemas.InsightEvidence] = []
    first_assignment: models.Assignment | None = None
    for source in sources:
        if source.kind in {"workload", "free_time"}:
            kept.append(schemas.InsightEvidence(kind=source.kind, label=source.label))
            continue
        if source.ref_id is None:
            continue  # a record citation must say which record
        if source.kind == "assignment":
            assignment = _owned_assignment(session, actor, source.ref_id)
            if assignment is None:
                continue
            first_assignment = first_assignment or assignment
        elif source.kind == "task":
            task = session.get(models.Task, source.ref_id)
            assignment = _owned_assignment(session, actor, task.assignment_id) if task else None
            if assignment is None:
                continue
            first_assignment = first_assignment or assignment
        else:  # document
            document = session.get(models.Document, source.ref_id)
            if document is None or not can_read(session, actor, document):
                continue
        kept.append(
            schemas.InsightEvidence(kind=source.kind, label=source.label, ref_id=source.ref_id)
        )
    return kept, first_assignment


def _fits_free_time(
    session: Session, actor: AuthenticatedUser, proposed: schemas.AgentStudySession
) -> bool:
    """The session must sit inside a free window the backend itself computed, right now."""
    start = (
        proposed.starts_at if proposed.starts_at.tzinfo else proposed.starts_at.replace(tzinfo=UTC)
    )
    end = proposed.ends_at if proposed.ends_at.tzinfo else proposed.ends_at.replace(tzinfo=UTC)
    if end <= start or end - start > timedelta(hours=6) or start < datetime.now(UTC):
        return False
    monday: date = start.date() - timedelta(days=start.weekday())
    week = service.schedule_week(session, actor, monday)
    return any(slot.starts_at <= start and end <= slot.ends_at for slot in week.free_time) or any(
        slot.starts_at <= start and end <= slot.ends_at
        for slot in service.schedule_week(session, actor, monday - timedelta(days=7)).free_time
    )


def create_from_agent(
    session: Session, actor: AuthenticatedUser, batch: schemas.AgentInsightBatch
) -> schemas.AgentInsightResult:
    created: list[models.Insight] = []
    rejected: list[schemas.RejectedInsightRead] = []
    # A new analysis replaces the previous unanswered suggestions; answered ones stay as history.
    session.execute(
        delete(models.Insight).where(
            models.Insight.user_id == actor.user.id,
            models.Insight.generated_by == GENERATED_BY,
            models.Insight.status == models.InsightStatus.new,
        )
    )
    for item in batch.insights:
        evidence, assignment = _verified_sources(session, actor, item.sources)
        if not evidence:
            rejected.append(
                schemas.RejectedInsightRead(title=item.title, reason="No verifiable source")
            )
            continue
        action_type = models.InsightActionType.none
        payload: dict[str, object] | None = None
        cta = {"label": "Review", "action": REVIEW_ROUTES[item.category], "style": "primary"}
        if item.study_session is not None and _fits_free_time(session, actor, item.study_session):
            course_id = item.study_session.course_id or (
                assignment.course_id if assignment else None
            )
            action_type = models.InsightActionType.create_study_session
            payload = {
                "title": item.study_session.title,
                "starts_at": item.study_session.starts_at.isoformat(),
                "ends_at": item.study_session.ends_at.isoformat(),
                **({"course_id": str(course_id)} if course_id else {}),
                **(
                    {"task_id": str(item.study_session.task_id)}
                    if item.study_session.task_id
                    else {}
                ),
            }
            cta = {"label": "Add to calendar", "action": "apply", "style": "primary"}
        insight = models.Insight(
            user_id=actor.user.id,
            course_id=assignment.course_id if assignment else None,
            assignment_id=assignment.id if assignment else None,
            category=item.category,
            title=item.title,
            summary=item.summary,
            reasoning=item.reasoning,
            suggestion=item.suggestion,
            confidence=item.confidence,
            severity=item.severity,
            status=models.InsightStatus.new,
            cta=cta,
            action_type=action_type,
            action_payload=payload,
            evidence=[entry.model_dump(mode="json") for entry in evidence],
            generated_by=GENERATED_BY,
        )
        session.add(insight)
        created.append(insight)
    session.commit()
    for insight in created:
        session.refresh(insight)
    return schemas.AgentInsightResult(
        created=[schemas.InsightRead.model_validate(item) for item in created], rejected=rejected
    )


def today_prompt_context(session: Session, actor: AuthenticatedUser) -> str:
    timezone = service._user_timezone(session, actor.user)
    now = datetime.now(timezone)
    monday = now.date() - timedelta(days=now.weekday())
    return (
        f"Today is {now.date().isoformat()} ({now.strftime('%A')}); "
        f"this week starts on {monday.isoformat()}."
    )


__all__ = ["create_from_agent", "today_prompt_context"]
