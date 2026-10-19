import asyncio
import json
from collections.abc import AsyncIterator
from datetime import date, datetime
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import schemas
from app.agent import service as agent_service
from app.agent.gateway import AgentGateway, AgentUnavailableError, build_gateway
from app.auth.authorization import can_read, require_write
from app.auth.router import CurrentUserDep, get_jwt_secret
from app.core.config import settings
from app.db import models
from app.db.session import get_session
from app.documents import service as documents_service
from app.product import admin, campus, imports, insight_agent, planner, plans, service

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
        extraction, pages = await asyncio.to_thread(
            documents_service.extract, destination, file.content_type or ""
        )
        session.add(assignment)
        session.flush()
        document = models.Document(
            course_id=course_id,
            assignment_id=assignment.id,
            name=safe_name,
            kind=models.DocumentKind.assignment,
            page_count=len(pages),
            storage_key=relative_path.as_posix(),
        )
        require_write(session, current, document)
        session.add(document)
        session.flush()
        session.add_all(documents_service.fragments_for(document, pages))
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
        extraction=extraction,
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


@router.get("/knowledge", response_model=schemas.KnowledgeBaseRead, tags=["knowledge"])
def knowledge(
    current: CurrentUserDep, session: SessionDep, course_id: UUID | None = None
) -> schemas.KnowledgeBaseRead:
    return campus.knowledge_base(session, current, course_id=course_id)


@router.get("/campus-events", response_model=list[schemas.CampusEventRead], tags=["events"])
def campus_events(current: CurrentUserDep, session: SessionDep) -> list[schemas.CampusEventRead]:
    return campus.campus_events(session, current)


@router.patch(
    "/campus-events/{event_id}/save", response_model=schemas.CampusEventRead, tags=["events"]
)
def save_campus_event(
    event_id: UUID,
    payload: schemas.CampusEventSaveRequest,
    current: CurrentUserDep,
    session: SessionDep,
) -> schemas.CampusEventRead:
    return campus.save_campus_event(session, current, event_id, payload.saved)


@router.get("/agent/activity", response_model=schemas.AgentActivityRead, tags=["agent"])
def agent_activity(
    current: CurrentUserDep, session: SessionDep, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> schemas.AgentActivityRead:
    return campus.agent_activity(session, current, limit=limit)


@router.post(
    "/agent/runs",
    response_model=schemas.AgentRunRead,
    status_code=status.HTTP_201_CREATED,
    tags=["agent"],
)
def record_agent_run(
    payload: schemas.AgentRunCreate, current: CurrentUserDep, session: SessionDep
) -> schemas.AgentRunRead:
    return campus.record_agent_run(session, current, payload)


@router.post(
    "/imports/proposals",
    response_model=schemas.ImportProposalResult,
    status_code=status.HTTP_201_CREATED,
    tags=["imports"],
)
def create_import_proposal(
    payload: schemas.ImportProposalCreate, current: CurrentUserDep, session: SessionDep
) -> schemas.ImportProposalResult:
    return imports.create_proposal(session, current, payload)


@router.get("/imports/proposals", response_model=list[schemas.ImportProposalRead], tags=["imports"])
def list_import_proposals(
    current: CurrentUserDep,
    session: SessionDep,
    proposal_status: models.ImportStatus | None = None,
) -> list[schemas.ImportProposalRead]:
    return imports.list_proposals(session, current, proposal_status)


@router.patch(
    "/imports/proposals/{proposal_id}/items/{item_id}",
    response_model=schemas.ImportProposalRead,
    tags=["imports"],
)
def update_import_item(
    proposal_id: UUID,
    item_id: UUID,
    payload: schemas.ImportItemUpdate,
    current: CurrentUserDep,
    session: SessionDep,
) -> schemas.ImportProposalRead:
    return imports.update_item(session, current, proposal_id, item_id, payload)


@router.post(
    "/imports/proposals/{proposal_id}/dismiss",
    response_model=schemas.ImportProposalRead,
    tags=["imports"],
)
def dismiss_import_proposal(
    proposal_id: UUID, current: CurrentUserDep, session: SessionDep
) -> schemas.ImportProposalRead:
    return imports.dismiss(session, current, proposal_id)


@router.post(
    "/imports/proposals/{proposal_id}/apply",
    response_model=schemas.ImportApplyRead,
    tags=["imports"],
)
def apply_import_proposal(
    proposal_id: UUID, current: CurrentUserDep, session: SessionDep
) -> schemas.ImportApplyRead:
    return imports.apply(session, current, proposal_id)


_gateway_cache: dict[str, AgentGateway | None] = {}


def get_agent_gateway() -> AgentGateway | None:
    key = f"{settings.agent_mode}|{settings.agent_resource}|{settings.agent_adk_url}"
    if key not in _gateway_cache:
        _gateway_cache[key] = build_gateway(settings)
    return _gateway_cache[key]


AgentGatewayDep = Annotated[AgentGateway | None, Depends(get_agent_gateway)]


@router.get("/agent/status", response_model=schemas.AgentStatusRead, tags=["agent"])
def agent_status(current: CurrentUserDep, gateway: AgentGatewayDep) -> schemas.AgentStatusRead:
    return schemas.AgentStatusRead(enabled=gateway is not None, mode=settings.agent_mode)


@router.post("/agent/chat", response_model=schemas.AgentChatRead, tags=["agent"])
async def agent_chat(
    payload: schemas.AgentChatRequest,
    current: CurrentUserDep,
    session: SessionDep,
    gateway: AgentGatewayDep,
) -> schemas.AgentChatRead:
    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Agent is not configured"
        )
    try:
        return await agent_service.chat(
            session,
            current,
            gateway,
            payload,
            settings=settings,
            secret=get_jwt_secret(),
        )
    except AgentUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


def _require_gateway(gateway: AgentGateway | None) -> AgentGateway:
    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Agent is not configured"
        )
    return gateway


def _event(name: str, data: object) -> str:
    payload = data.model_dump_json() if isinstance(data, BaseModel) else json.dumps(data)
    return f"event: {name}\ndata: {payload}\n\n"


def _event_stream(results: AsyncIterator[BaseModel], final: type[BaseModel]) -> StreamingResponse:
    """Server-sent events: one `step` per reasoning step as it happens, then `done` or `error`."""

    async def generate() -> AsyncIterator[str]:
        try:
            async for item in results:
                yield _event("done" if isinstance(item, final) else "step", item)
        except AgentUnavailableError as error:
            yield _event("error", {"status": status.HTTP_502_BAD_GATEWAY, "detail": str(error)})
        except HTTPException as error:
            yield _event("error", {"status": error.status_code, "detail": error.detail})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/agent/chat/stream", tags=["agent"])
async def agent_chat_stream(
    payload: schemas.AgentChatRequest,
    current: CurrentUserDep,
    session: SessionDep,
    gateway: AgentGatewayDep,
) -> StreamingResponse:
    return _event_stream(
        agent_service.stream_chat(
            session,
            current,
            _require_gateway(gateway),
            payload,
            settings=settings,
            secret=get_jwt_secret(),
        ),
        schemas.AgentChatRead,
    )


@router.get(
    "/assignments/{assignment_id}/text",
    response_model=schemas.AssignmentTextRead,
    tags=["analysis"],
)
def assignment_text(
    assignment_id: UUID, current: CurrentUserDep, session: SessionDep
) -> schemas.AssignmentTextRead:
    return plans.assignment_text(session, current, assignment_id)


@router.post(
    "/task-plans",
    response_model=schemas.TaskPlanRead,
    status_code=status.HTTP_201_CREATED,
    tags=["analysis"],
)
def create_task_plan(
    payload: schemas.TaskPlanCreate, current: CurrentUserDep, session: SessionDep
) -> schemas.TaskPlanRead:
    return plans.create_plan(session, current, payload)


@router.get(
    "/assignments/{assignment_id}/task-plan", response_model=schemas.TaskPlanRead, tags=["analysis"]
)
def latest_task_plan(
    assignment_id: UUID, current: CurrentUserDep, session: SessionDep
) -> schemas.TaskPlanRead:
    return plans.latest_plan(session, current, assignment_id)


@router.patch(
    "/task-plans/{plan_id}/items/{item_id}",
    response_model=schemas.TaskPlanRead,
    tags=["analysis"],
)
def update_task_plan_item(
    plan_id: UUID,
    item_id: UUID,
    payload: schemas.TaskPlanItemUpdate,
    current: CurrentUserDep,
    session: SessionDep,
) -> schemas.TaskPlanRead:
    return plans.update_item(session, current, plan_id, item_id, payload)


@router.post(
    "/task-plans/{plan_id}/apply", response_model=schemas.TaskPlanApplyRead, tags=["analysis"]
)
def apply_task_plan(
    plan_id: UUID, current: CurrentUserDep, session: SessionDep
) -> schemas.TaskPlanApplyRead:
    return plans.apply(session, current, plan_id)


@router.post(
    "/task-plans/{plan_id}/dismiss", response_model=schemas.TaskPlanRead, tags=["analysis"]
)
def dismiss_task_plan(
    plan_id: UUID, current: CurrentUserDep, session: SessionDep
) -> schemas.TaskPlanRead:
    return plans.dismiss(session, current, plan_id)


@router.post(
    "/assignments/{assignment_id}/analysis",
    response_model=schemas.AssignmentAnalysisRead,
    tags=["analysis"],
)
async def analyze_assignment(
    assignment_id: UUID, current: CurrentUserDep, session: SessionDep, gateway: AgentGatewayDep
) -> schemas.AssignmentAnalysisRead:
    """Ask the agent to read the uploaded brief and propose a task plan for approval."""
    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Agent is not configured"
        )
    try:
        return await agent_service.analyze_assignment(
            session, current, gateway, assignment_id, settings=settings, secret=get_jwt_secret()
        )
    except AgentUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.post("/assignments/{assignment_id}/analysis/stream", tags=["analysis"])
async def analyze_assignment_stream(
    assignment_id: UUID, current: CurrentUserDep, session: SessionDep, gateway: AgentGatewayDep
) -> StreamingResponse:
    return _event_stream(
        agent_service.stream_analysis(
            session,
            current,
            _require_gateway(gateway),
            assignment_id,
            settings=settings,
            secret=get_jwt_secret(),
        ),
        schemas.AssignmentAnalysisRead,
    )


@router.get("/schedule/plan", response_model=schemas.StudyPlanRead, tags=["schedule"])
def study_plan(
    current: CurrentUserDep, session: SessionDep, week_start: date | None = None
) -> schemas.StudyPlanRead:
    """Preview: where the unscheduled work would go. Nothing is written."""
    return planner.plan_week(session, current, week_start)


@router.post("/schedule/plan/apply", response_model=schemas.StudyPlanApplyRead, tags=["schedule"])
def apply_study_plan(
    current: CurrentUserDep, session: SessionDep, week_start: date | None = None
) -> schemas.StudyPlanApplyRead:
    return planner.apply_plan(session, current, week_start)


@router.get("/admin/overview", response_model=schemas.AdminOverviewRead, tags=["admin"])
def admin_overview(
    current: CurrentUserDep, session: SessionDep, institution_id: UUID | None = None
) -> schemas.AdminOverviewRead:
    """Anonymised faculty aggregates; groups below the minimum cohort size are withheld."""
    return admin.overview(session, current, institution_id)


@router.post(
    "/agent/insights",
    response_model=schemas.AgentInsightResult,
    status_code=status.HTTP_201_CREATED,
    tags=["insights"],
)
def agent_insights(
    payload: schemas.AgentInsightBatch, current: CurrentUserDep, session: SessionDep
) -> schemas.AgentInsightResult:
    """Save insights proposed by the agent; unsupported or unverifiable ones are rejected."""
    return insight_agent.create_from_agent(session, current, payload)


@router.post("/insights/refresh", response_model=schemas.InsightRefreshRead, tags=["insights"])
async def refresh_insights(
    current: CurrentUserDep, session: SessionDep, gateway: AgentGatewayDep
) -> schemas.InsightRefreshRead:
    """Ask the agent to review deadlines, workload and free time and propose insights."""
    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Agent is not configured"
        )
    try:
        return await agent_service.refresh_insights(
            session, current, gateway, settings=settings, secret=get_jwt_secret()
        )
    except AgentUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.post("/insights/refresh/stream", tags=["insights"])
async def refresh_insights_stream(
    current: CurrentUserDep, session: SessionDep, gateway: AgentGatewayDep
) -> StreamingResponse:
    return _event_stream(
        agent_service.stream_insights(
            session,
            current,
            _require_gateway(gateway),
            settings=settings,
            secret=get_jwt_secret(),
        ),
        schemas.InsightRefreshRead,
    )
