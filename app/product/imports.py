from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read, require_write
from app.auth.service import AuthenticatedUser
from app.db import models

DEFAULT_ESTIMATE_HOURS = 2.0


def create_proposal(
    session: Session, actor: AuthenticatedUser, payload: schemas.ImportProposalCreate
) -> schemas.ImportProposalResult:
    known = set(
        session.scalars(
            select(models.Assignment.external_ref).where(
                models.Assignment.owner_user_id == actor.user.id,
                models.Assignment.external_ref.is_not(None),
            )
        )
    )
    fresh: dict[str, schemas.ImportItemCreate] = {}
    for item in payload.items:
        ref = _external_ref(payload.source, item.external_id)
        if ref not in known:
            fresh.setdefault(item.external_id, item)
    skipped = len(payload.items) - len(fresh)
    if not fresh:
        return schemas.ImportProposalResult(proposal=None, skipped_existing=skipped)
    courses_by_code = {
        course.code.casefold(): course.id
        for course in session.scalars(select(models.Course)).all()
        if can_read(session, actor, course)
    }
    proposal = models.ImportProposal(user_id=actor.user.id, source=payload.source)
    session.add(proposal)
    session.flush()
    session.add_all(
        models.ImportItem(
            proposal_id=proposal.id,
            course_id=courses_by_code.get(item.external_course_code.casefold()),
            estimated_hours=DEFAULT_ESTIMATE_HOURS,
            **item.model_dump(),
        )
        for item in fresh.values()
    )
    session.commit()
    return schemas.ImportProposalResult(proposal=_read(session, proposal), skipped_existing=skipped)


def list_proposals(
    session: Session, actor: AuthenticatedUser, status_filter: models.ImportStatus | None
) -> list[schemas.ImportProposalRead]:
    query = (
        select(models.ImportProposal)
        .where(models.ImportProposal.user_id == actor.user.id)
        .order_by(models.ImportProposal.created_at.desc())
    )
    if status_filter is not None:
        query = query.where(models.ImportProposal.status == status_filter)
    return [_read(session, proposal) for proposal in session.scalars(query).all()]


def update_item(
    session: Session,
    actor: AuthenticatedUser,
    proposal_id: UUID,
    item_id: UUID,
    payload: schemas.ImportItemUpdate,
) -> schemas.ImportProposalRead:
    proposal = _pending(session, actor, proposal_id)
    item = session.get(models.ImportItem, item_id)
    if item is None or item.proposal_id != proposal.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    changes = payload.model_dump(exclude_unset=True)
    if "course_id" in changes and changes["course_id"] is not None:
        course = session.get(models.Course, changes["course_id"])
        if course is None or not can_read(session, actor, course):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    for field, value in changes.items():
        if value is None and field != "course_id":
            continue
        setattr(item, field, value)
    session.commit()
    return _read(session, proposal)


def dismiss(
    session: Session, actor: AuthenticatedUser, proposal_id: UUID
) -> schemas.ImportProposalRead:
    proposal = _owned(session, actor, proposal_id)
    if proposal.status == models.ImportStatus.applied:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Proposal already applied")
    proposal.status = models.ImportStatus.dismissed
    session.commit()
    return _read(session, proposal)


def apply(session: Session, actor: AuthenticatedUser, proposal_id: UUID) -> schemas.ImportApplyRead:
    proposal = _owned(session, actor, proposal_id)
    if proposal.status == models.ImportStatus.dismissed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Proposal was dismissed")
    items = _items(session, proposal)
    if proposal.status == models.ImportStatus.applied:
        return schemas.ImportApplyRead(
            proposal=_read(session, proposal),
            created=0,
            already_imported=sum(item.assignment_id is not None for item in items),
        )
    chosen = [item for item in items if item.selected]
    missing = [item.title for item in chosen if item.course_id is None]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Choose a course for: {', '.join(missing)}",
        )
    created = 0
    already = 0
    for item in chosen:
        ref = _external_ref(proposal.source, item.external_id)
        existing = session.scalar(
            select(models.Assignment).where(
                models.Assignment.owner_user_id == actor.user.id,
                models.Assignment.external_ref == ref,
            )
        )
        if existing is not None:
            item.assignment_id = existing.id
            already += 1
            continue
        assert item.course_id is not None
        assignment = models.Assignment(
            course_id=item.course_id,
            owner_user_id=actor.user.id,
            title=item.title,
            description=item.description,
            due_at=item.due_at,
            estimated_hours=item.estimated_hours,
            external_ref=ref,
        )
        require_write(session, actor, assignment)
        session.add(assignment)
        session.flush()
        item.assignment_id = assignment.id
        created += 1
    proposal.status = models.ImportStatus.applied
    proposal.applied_at = models.utc_now()
    session.commit()
    return schemas.ImportApplyRead(
        proposal=_read(session, proposal), created=created, already_imported=already
    )


def _external_ref(source: str, external_id: str) -> str:
    return f"{source}:{external_id}"


def _owned(session: Session, actor: AuthenticatedUser, proposal_id: UUID) -> models.ImportProposal:
    proposal = session.get(models.ImportProposal, proposal_id)
    if proposal is None or proposal.user_id != actor.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    return proposal


def _pending(
    session: Session, actor: AuthenticatedUser, proposal_id: UUID
) -> models.ImportProposal:
    proposal = _owned(session, actor, proposal_id)
    if proposal.status != models.ImportStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Proposal is closed")
    return proposal


def _items(session: Session, proposal: models.ImportProposal) -> list[models.ImportItem]:
    return list(
        session.scalars(
            select(models.ImportItem)
            .where(models.ImportItem.proposal_id == proposal.id)
            .order_by(models.ImportItem.due_at, models.ImportItem.title)
        )
    )


def _read(session: Session, proposal: models.ImportProposal) -> schemas.ImportProposalRead:
    return schemas.ImportProposalRead(
        id=proposal.id,
        source=proposal.source,
        status=proposal.status,
        created_at=proposal.created_at,
        applied_at=proposal.applied_at,
        items=[schemas.ImportItemRead.model_validate(item) for item in _items(session, proposal)],
    )
