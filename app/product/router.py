from datetime import date, datetime
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import can_read, require_write
from app.auth.router import CurrentUserDep
from app.core.config import settings
from app.db import models
from app.db.session import get_session
from app.product import service

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/courses/overview", response_model=list[schemas.CourseSummaryRead], tags=["courses"])
def courses_overview(
    current: CurrentUserDep,
    session: SessionDep,
    q: str | None = Query(default=None, max_length=200),
    semester_id: UUID | None = None,
    has_open_assignments: bool | None = None,
) -> list[schemas.CourseSummaryRead]:
    return service.course_summaries(
        session,
        current,
        query=q,
        semester_id=semester_id,
        has_open_assignments=has_open_assignments,
    )


@router.get(
    "/assignments/overview",
    response_model=schemas.AssignmentOverviewPageRead,
    tags=["assignments"],
)
def assignments_overview(
    current: CurrentUserDep,
    session: SessionDep,
    q: str | None = Query(default=None, max_length=200),
    course_id: UUID | None = None,
    assignment_status: Annotated[list[models.AssignmentStatus] | None, Query()] = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
) -> schemas.AssignmentOverviewPageRead:
    all_items = service.assignment_summaries(
        session,
        current,
        query=None,
    )
    filtered = service.assignment_summaries(
        session,
        current,
        query=q,
        course_id=course_id,
        statuses=assignment_status,
        due_from=due_from,
        due_to=due_to,
    )
    return schemas.AssignmentOverviewPageRead(
        total=len(all_items),
        status_counts={
            item_status: sum(item.status == item_status for item in all_items)
            for item_status in models.AssignmentStatus
        },
        items=filtered,
    )


@router.post(
    "/assignments/upload",
    response_model=schemas.AssignmentUploadRead,
    status_code=status.HTTP_201_CREATED,
    tags=["assignments"],
)
async def upload_assignment(
    current: CurrentUserDep,
    session: SessionDep,
    file: Annotated[UploadFile, File()],
    course_id: Annotated[UUID, Form()],
    title: Annotated[str, Form(min_length=1, max_length=240)],
    due_at: Annotated[datetime, Form()],
    description: Annotated[str | None, Form()] = None,
    estimated_hours: Annotated[float, Form(ge=0, le=10_000)] = 0,
) -> schemas.AssignmentUploadRead:
    if file.content_type not in {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    }:
        raise HTTPException(status_code=415, detail="Supported files are PDF, DOCX and TXT")
    assignment = models.Assignment(
        course_id=course_id,
        owner_user_id=current.user.id,
        title=title,
        description=description,
        due_at=due_at,
        estimated_hours=estimated_hours,
    )
    require_write(session, current, assignment)

    safe_name = Path(file.filename or "assignment").name
    relative_path = Path(str(current.user.id)) / f"{uuid4()}-{safe_name}"
    destination = Path(settings.upload_directory) / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="File exceeds the 20 MB limit")
                output.write(chunk)
        session.add(assignment)
        session.flush()
        document = models.Document(
            course_id=course_id,
            assignment_id=assignment.id,
            name=safe_name,
            kind=models.DocumentKind.assignment,
            storage_key=relative_path.as_posix(),
        )
        require_write(session, current, document)
        session.add(document)
        session.commit()
        session.refresh(assignment)
        session.refresh(document)
    except Exception:
        session.rollback()
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    return schemas.AssignmentUploadRead(
        assignment=schemas.AssignmentRead.model_validate(assignment),
        document=schemas.DocumentRead.model_validate(document),
    )


@router.get("/documents/{document_id}/download", tags=["documents"])
def download_document(
    document_id: UUID, current: CurrentUserDep, session: SessionDep
) -> FileResponse:
    document = session.get(models.Document, document_id)
    if document is None or not can_read(session, current, document):
        raise HTTPException(status_code=404, detail="Document not found")
    if document.storage_key is None:
        raise HTTPException(status_code=404, detail="Document file is not available")
    path = Path(settings.upload_directory) / document.storage_key
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Document file is not available")
    return FileResponse(path=path, filename=document.name)


@router.get("/schedule", response_model=schemas.ScheduleWeekRead, tags=["schedule"])
def my_schedule(
    current: CurrentUserDep,
    session: SessionDep,
    week_start: date | None = None,
) -> schemas.ScheduleWeekRead:
    return service.schedule_week(session, current, week_start)


@router.get("/schedule/free-time", response_model=list[schemas.FreeTimeSlotRead], tags=["schedule"])
def free_time(
    current: CurrentUserDep,
    session: SessionDep,
    week_start: date | None = None,
) -> list[schemas.FreeTimeSlotRead]:
    return service.schedule_week(session, current, week_start).free_time


@router.get("/kanban", response_model=schemas.KanbanBoardRead, tags=["kanban"])
def kanban(
    current: CurrentUserDep,
    session: SessionDep,
    q: str | None = Query(default=None, max_length=200),
    course_id: UUID | None = None,
    assignment_id: UUID | None = None,
    priority: models.Priority | None = None,
    include_completed: bool = True,
) -> schemas.KanbanBoardRead:
    return service.kanban_board(
        session,
        current,
        query=q,
        course_id=course_id,
        assignment_id=assignment_id,
        priority=priority,
        include_completed=include_completed,
    )


@router.patch("/kanban/tasks/{task_id}/move", response_model=schemas.TaskRead, tags=["kanban"])
def move_kanban_task(
    task_id: UUID,
    payload: schemas.KanbanMoveRequest,
    current: CurrentUserDep,
    session: SessionDep,
) -> models.Task:
    task = session.get(models.Task, task_id)
    if task is None or not can_read(session, current, task):
        raise HTTPException(status_code=404, detail="Task not found")
    require_write(session, current, task)
    task.status = payload.status
    session.commit()
    session.refresh(task)
    return task


@router.get("/workload", response_model=schemas.WorkloadRead, tags=["analytics"])
def my_workload(
    current: CurrentUserDep,
    session: SessionDep,
    week_start: date | None = None,
) -> schemas.WorkloadRead:
    return service.workload(session, current, week_start)


@router.get("/statistics", response_model=schemas.StudyStatisticsRead, tags=["analytics"])
def statistics(current: CurrentUserDep, session: SessionDep) -> schemas.StudyStatisticsRead:
    return service.study_statistics(session, current)


@router.get("/settings", response_model=schemas.SettingsRead, tags=["settings"])
def get_settings(current: CurrentUserDep, session: SessionDep) -> schemas.SettingsRead:
    return service.settings_read(session, current)


@router.patch("/settings", response_model=schemas.SettingsRead, tags=["settings"])
def patch_settings(
    payload: schemas.SettingsUpdate,
    current: CurrentUserDep,
    session: SessionDep,
) -> schemas.SettingsRead:
    return service.update_settings(session, current, payload)


@router.get("/insights", response_model=list[schemas.InsightRead], tags=["insights"])
def insights(
    current: CurrentUserDep,
    session: SessionDep,
    insight_status: models.InsightStatus | None = None,
) -> list[models.Insight]:
    return service.list_insights(session, current, insight_status)


@router.post(
    "/insights",
    response_model=schemas.InsightRead,
    status_code=status.HTTP_201_CREATED,
    tags=["insights"],
)
def create_insight(
    payload: schemas.InsightCreate,
    current: CurrentUserDep,
    session: SessionDep,
) -> models.Insight:
    return service.create_insight(session, current, payload)


@router.patch("/insights/{insight_id}", response_model=schemas.InsightRead, tags=["insights"])
def change_insight_status(
    insight_id: UUID,
    payload: schemas.InsightStatusUpdate,
    current: CurrentUserDep,
    session: SessionDep,
) -> models.Insight:
    return service.update_insight_status(session, current, insight_id, payload)


@router.post(
    "/insights/{insight_id}/apply",
    response_model=schemas.InsightApplyRead,
    tags=["insights"],
)
def apply_insight(
    insight_id: UUID, current: CurrentUserDep, session: SessionDep
) -> schemas.InsightApplyRead:
    return service.apply_insight(session, current, insight_id)
