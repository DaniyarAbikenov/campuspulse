import re
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read, require_write
from app.auth.service import AuthenticatedUser
from app.db import models

_NON_WORD = re.compile(r"\W+", re.UNICODE)


def _normalize(text: str) -> str:
    return _NON_WORD.sub(" ", text.casefold()).strip()


def _assignment(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID
) -> models.Assignment:
    assignment = session.get(models.Assignment, assignment_id)
    if assignment is None or not can_read(session, actor, assignment):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment


def _pages(session: Session, assignment_id: UUID) -> list[models.DocumentFragment]:
    return list(
        session.scalars(
            select(models.DocumentFragment)
            .join(models.Document, models.Document.id == models.DocumentFragment.document_id)
            .where(
                models.Document.assignment_id == assignment_id,
                models.Document.kind == models.DocumentKind.assignment,
            )
            .order_by(models.DocumentFragment.document_id, models.DocumentFragment.page)
        )
    )


def assignment_text(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID
) -> schemas.AssignmentTextRead:
    assignment = _assignment(session, actor, assignment_id)
    course = session.get(models.Course, assignment.course_id)
    pages = _pages(session, assignment_id)
    if not pages:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This assignment has no extracted text; upload a PDF, DOCX or TXT brief",
        )
    return schemas.AssignmentTextRead(
        assignment_id=assignment.id,
        title=assignment.title,
        course_name=course.name if course else "",
        due_at=assignment.due_at,
        pages=_merge_pages(pages),
    )


def _merge_pages(fragments: list[models.DocumentFragment]) -> list[schemas.AssignmentPageRead]:
    """Several fragments may share a page (seed data); readers get one entry per page."""
    merged: dict[int, list[str]] = {}
    for item in fragments:
        merged.setdefault(item.page, []).append(item.text)
    return [
        schemas.AssignmentPageRead(page=page, text="\n\n".join(texts))
        for page, texts in sorted(merged.items())
    ]


def create_plan(
    session: Session, actor: AuthenticatedUser, payload: schemas.TaskPlanCreate
) -> schemas.TaskPlanRead:
    assignment = _assignment(session, actor, payload.assignment_id)
    require_write(session, actor, assignment)
    related = None
    if payload.related_assignment_id is not None:
        if payload.related_assignment_id == assignment.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="An assignment cannot relate to itself",
            )
        related = _assignment(session, actor, payload.related_assignment_id)
    pages = _pages(session, assignment.id)
    if not pages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The assignment has no extracted text to ground a plan in",
        )
    normalized = {item.page: _normalize(item.text) for item in pages}

    for stale in session.scalars(
        select(models.TaskPlan).where(
            models.TaskPlan.assignment_id == assignment.id,
            models.TaskPlan.user_id == actor.user.id,
            models.TaskPlan.status == models.PlanStatus.pending,
        )
    ):
        session.delete(stale)
    session.flush()

    plan = models.TaskPlan(
        user_id=actor.user.id,
        assignment_id=assignment.id,
        summary=payload.summary,
        related_assignment_id=related.id if related else None,
        relation_type=payload.relation_type if related else None,
    )
    session.add(plan)
    session.flush()
    for position, item in enumerate(payload.items):
        quote = _normalize(item.quote)
        # A citation counts as verified only if the quoted words really appear in the document.
        # The page is corrected to where the quote was found.
        found_page = (
            item.page
            if quote and quote in normalized.get(item.page, "")
            else next(
                (number for number, text in normalized.items() if quote and quote in text), None
            )
        )
        session.add(
            models.TaskPlanItem(
                plan_id=plan.id,
                position=position,
                requirement_id=item.requirement_id,
                requirement_text=item.requirement_text,
                quote=item.quote,
                page=found_page or item.page,
                quote_verified=found_page is not None,
                title=item.title,
                description=item.description,
                estimated_hours=item.estimated_hours,
                priority=item.priority,
            )
        )
    session.commit()
    return _read(session, plan)


def latest_plan(
    session: Session, actor: AuthenticatedUser, assignment_id: UUID, *, applied: bool = False
) -> schemas.TaskPlanRead:
    """The newest open plan; with `applied`, the newest plan whose tasks are on the board."""
    _assignment(session, actor, assignment_id)
    plan = session.scalar(
        select(models.TaskPlan)
        .where(
            models.TaskPlan.assignment_id == assignment_id,
            models.TaskPlan.user_id == actor.user.id,
            models.TaskPlan.status == models.PlanStatus.applied
            if applied
            else models.TaskPlan.status != models.PlanStatus.dismissed,
        )
        .order_by(models.TaskPlan.created_at.desc())
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No task plan yet")
    return _read(session, plan)


def update_item(
    session: Session,
    actor: AuthenticatedUser,
    plan_id: UUID,
    item_id: UUID,
    payload: schemas.TaskPlanItemUpdate,
) -> schemas.TaskPlanRead:
    plan = _pending(session, actor, plan_id)
    item = session.get(models.TaskPlanItem, item_id)
    if item is None or item.plan_id != plan.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, field, value)
    session.commit()
    return _read(session, plan)


def dismiss(session: Session, actor: AuthenticatedUser, plan_id: UUID) -> schemas.TaskPlanRead:
    plan = _owned(session, actor, plan_id)
    if plan.status == models.PlanStatus.applied:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Plan already applied")
    plan.status = models.PlanStatus.dismissed
    session.commit()
    return _read(session, plan)


def apply(session: Session, actor: AuthenticatedUser, plan_id: UUID) -> schemas.TaskPlanApplyRead:
    plan = _owned(session, actor, plan_id)
    if plan.status == models.PlanStatus.dismissed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Plan was dismissed")
    if plan.status == models.PlanStatus.applied:
        return schemas.TaskPlanApplyRead(plan=_read(session, plan), created=0)
    assignment = _assignment(session, actor, plan.assignment_id)
    require_write(session, actor, assignment)
    chosen = [item for item in _items(session, plan) if item.selected]
    if not chosen:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select at least one task"
        )
    replaced = _replace_earlier_tasks(session, assignment.id)
    for item in chosen:
        task = models.Task(
            assignment_id=assignment.id,
            title=item.title,
            description=(
                f"{item.description}\n\nSource: page {item.page} — “{item.quote}”"
            ).strip(),
            status=models.TaskStatus.todo,
            priority=item.priority,
            estimated_hours=item.estimated_hours,
            due_at=assignment.due_at,
            is_ai_generated=True,
            source_requirement=item.requirement_id,
        )
        require_write(session, actor, task)
        session.add(task)
        session.flush()
        item.task_id = task.id
    session.flush()
    # The assignment's estimate is the sum of everything on its board, kept tasks included.
    assignment.estimated_hours = round(
        sum(
            task.estimated_hours
            for task in session.scalars(
                select(models.Task).where(models.Task.assignment_id == assignment.id)
            )
        ),
        2,
    )
    if assignment.status == models.AssignmentStatus.upcoming:
        assignment.status = models.AssignmentStatus.todo
    if plan.related_assignment_id and plan.relation_type:
        exists = session.scalar(
            select(models.AssignmentRelation).where(
                models.AssignmentRelation.source_assignment_id == assignment.id,
                models.AssignmentRelation.target_assignment_id == plan.related_assignment_id,
                models.AssignmentRelation.relation_type == plan.relation_type,
            )
        )
        if exists is None:
            session.add(
                models.AssignmentRelation(
                    source_assignment_id=assignment.id,
                    target_assignment_id=plan.related_assignment_id,
                    relation_type=plan.relation_type,
                )
            )
    plan.status = models.PlanStatus.applied
    plan.applied_at = models.utc_now()
    session.commit()
    return schemas.TaskPlanApplyRead(
        plan=_read(session, plan), created=len(chosen), replaced=replaced
    )


def _replace_earlier_tasks(session: Session, assignment_id: UUID) -> int:
    """A new plan supersedes the unstarted tasks of an earlier one, so the board never mixes two
    analyses. Tasks the student started or finished stay."""
    old = session.scalars(
        select(models.Task).where(
            models.Task.assignment_id == assignment_id,
            models.Task.is_ai_generated.is_(True),
            models.Task.status.in_([models.TaskStatus.backlog, models.TaskStatus.todo]),
        )
    ).all()
    now = models.utc_now()
    for task in old:
        for event in session.scalars(
            select(models.ScheduleEvent).where(models.ScheduleEvent.task_id == task.id)
        ):
            starts = (
                event.starts_at
                if event.starts_at.tzinfo
                else event.starts_at.replace(tzinfo=now.tzinfo)
            )
            if starts >= now:
                session.delete(event)
        session.delete(task)
    return len(old)


def _owned(session: Session, actor: AuthenticatedUser, plan_id: UUID) -> models.TaskPlan:
    plan = session.get(models.TaskPlan, plan_id)
    if plan is None or plan.user_id != actor.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return plan


def _pending(session: Session, actor: AuthenticatedUser, plan_id: UUID) -> models.TaskPlan:
    plan = _owned(session, actor, plan_id)
    if plan.status != models.PlanStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Plan is closed")
    return plan


def _items(session: Session, plan: models.TaskPlan) -> list[models.TaskPlanItem]:
    return list(
        session.scalars(
            select(models.TaskPlanItem)
            .where(models.TaskPlanItem.plan_id == plan.id)
            .order_by(models.TaskPlanItem.position)
        )
    )


def _read(session: Session, plan: models.TaskPlan) -> schemas.TaskPlanRead:
    related = (
        session.get(models.Assignment, plan.related_assignment_id)
        if plan.related_assignment_id
        else None
    )
    return schemas.TaskPlanRead(
        id=plan.id,
        assignment_id=plan.assignment_id,
        status=plan.status,
        summary=plan.summary,
        related_assignment_id=plan.related_assignment_id,
        related_assignment_title=related.title if related else None,
        relation_type=plan.relation_type,
        created_at=plan.created_at,
        applied_at=plan.applied_at,
        items=[schemas.TaskPlanItemRead.model_validate(item) for item in _items(session, plan)],
    )
