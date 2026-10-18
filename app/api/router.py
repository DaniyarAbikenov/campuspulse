from datetime import UTC, datetime
from typing import Annotated, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import schemas
from app.auth.authorization import set_actor
from app.auth.router import CurrentUserDep
from app.auth.router import router as auth_router
from app.crud import create_entity, delete_entity, get_entity, list_entities, update_entity
from app.db import models
from app.db.session import get_session
from app.product.router import router as product_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(product_router)
RawSessionDep = Annotated[Session, Depends(get_session)]


def get_authorized_session(current: CurrentUserDep, session: RawSessionDep) -> Session:
    set_actor(session, current)
    return session


SessionDep = Annotated[Session, Depends(get_authorized_session)]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=200)]
SchemaT = TypeVar("SchemaT", bound=BaseModel)


@router.get("/institutions", response_model=list[schemas.InstitutionRead])
def list_institutions(
    session: SessionDep, offset: Offset = 0, limit: Limit = 50
) -> list[models.Institution]:
    return list_entities(session, models.Institution, offset=offset, limit=limit)


@router.post(
    "/institutions", response_model=schemas.InstitutionRead, status_code=status.HTTP_201_CREATED
)
def create_institution(
    payload: schemas.InstitutionCreate, session: SessionDep
) -> models.Institution:
    return create_entity(session, models.Institution, payload)


@router.get("/institutions/{entity_id}", response_model=schemas.InstitutionRead)
def get_institution(entity_id: UUID, session: SessionDep) -> models.Institution:
    return get_entity(session, models.Institution, entity_id)


@router.patch("/institutions/{entity_id}", response_model=schemas.InstitutionRead)
def update_institution(
    entity_id: UUID, payload: schemas.InstitutionUpdate, session: SessionDep
) -> models.Institution:
    return update_entity(session, models.Institution, entity_id, payload)


@router.delete("/institutions/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_institution(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.Institution, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[schemas.UserRead])
def list_users(session: SessionDep, offset: Offset = 0, limit: Limit = 50) -> list[models.User]:
    return list_entities(session, models.User, offset=offset, limit=limit)


@router.post("/users", response_model=schemas.UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: schemas.UserCreate, session: SessionDep) -> models.User:
    return create_entity(session, models.User, payload)


@router.get("/users/{entity_id}", response_model=schemas.UserRead)
def get_user(entity_id: UUID, session: SessionDep) -> models.User:
    return get_entity(session, models.User, entity_id)


@router.patch("/users/{entity_id}", response_model=schemas.UserRead)
def update_user(entity_id: UUID, payload: schemas.UserUpdate, session: SessionDep) -> models.User:
    return update_entity(session, models.User, entity_id, payload)


@router.delete("/users/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.User, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/semesters", response_model=list[schemas.SemesterRead])
def list_semesters(
    session: SessionDep, offset: Offset = 0, limit: Limit = 50
) -> list[models.Semester]:
    return list_entities(session, models.Semester, offset=offset, limit=limit)


@router.post("/semesters", response_model=schemas.SemesterRead, status_code=status.HTTP_201_CREATED)
def create_semester(payload: schemas.SemesterCreate, session: SessionDep) -> models.Semester:
    return create_entity(session, models.Semester, payload)


@router.get("/semesters/{entity_id}", response_model=schemas.SemesterRead)
def get_semester(entity_id: UUID, session: SessionDep) -> models.Semester:
    return get_entity(session, models.Semester, entity_id)


@router.patch("/semesters/{entity_id}", response_model=schemas.SemesterRead)
def update_semester(
    entity_id: UUID, payload: schemas.SemesterUpdate, session: SessionDep
) -> models.Semester:
    return update_entity(session, models.Semester, entity_id, payload)


@router.delete("/semesters/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.Semester, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/courses", response_model=list[schemas.CourseRead])
def list_courses(
    session: SessionDep,
    offset: Offset = 0,
    limit: Limit = 50,
    q: str | None = Query(default=None, max_length=200),
    semester_id: UUID | None = None,
) -> list[models.Course]:
    courses = list_entities(session, models.Course, offset=0, limit=200)
    normalized_query = q.casefold().strip() if q else None
    filtered = [
        course
        for course in courses
        if (semester_id is None or course.semester_id == semester_id)
        and (
            normalized_query is None
            or normalized_query
            in f"{course.code} {course.name} {course.instructor_name or ''}".casefold()
        )
    ]
    return filtered[offset : offset + limit]


@router.post("/courses", response_model=schemas.CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(payload: schemas.CourseCreate, session: SessionDep) -> models.Course:
    return create_entity(session, models.Course, payload)


@router.get("/courses/{entity_id}", response_model=schemas.CourseRead)
def get_course(entity_id: UUID, session: SessionDep) -> models.Course:
    return get_entity(session, models.Course, entity_id)


@router.patch("/courses/{entity_id}", response_model=schemas.CourseRead)
def update_course(
    entity_id: UUID, payload: schemas.CourseUpdate, session: SessionDep
) -> models.Course:
    return update_entity(session, models.Course, entity_id, payload)


@router.delete("/courses/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.Course, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/enrollments", response_model=list[schemas.EnrollmentRead])
def list_enrollments(
    session: SessionDep, offset: Offset = 0, limit: Limit = 50
) -> list[models.Enrollment]:
    return list_entities(session, models.Enrollment, offset=offset, limit=limit)


@router.post(
    "/enrollments", response_model=schemas.EnrollmentRead, status_code=status.HTTP_201_CREATED
)
def create_enrollment(payload: schemas.EnrollmentCreate, session: SessionDep) -> models.Enrollment:
    return create_entity(session, models.Enrollment, payload)


@router.get("/enrollments/{entity_id}", response_model=schemas.EnrollmentRead)
def get_enrollment(entity_id: UUID, session: SessionDep) -> models.Enrollment:
    return get_entity(session, models.Enrollment, entity_id)


@router.patch("/enrollments/{entity_id}", response_model=schemas.EnrollmentRead)
def update_enrollment(
    entity_id: UUID, payload: schemas.EnrollmentUpdate, session: SessionDep
) -> models.Enrollment:
    return update_entity(session, models.Enrollment, entity_id, payload)


@router.delete("/enrollments/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enrollment(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.Enrollment, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/assignments", response_model=list[schemas.AssignmentRead])
def list_assignments(
    session: SessionDep,
    offset: Offset = 0,
    limit: Limit = 50,
    q: str | None = Query(default=None, max_length=200),
    course_id: UUID | None = None,
    assignment_status: Annotated[list[models.AssignmentStatus] | None, Query()] = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
) -> list[models.Assignment]:
    assignments = list_entities(session, models.Assignment, offset=0, limit=200)
    normalized_query = q.casefold().strip() if q else None
    filtered = [
        assignment
        for assignment in assignments
        if (course_id is None or assignment.course_id == course_id)
        and (not assignment_status or assignment.status in assignment_status)
        and (due_from is None or _aware(assignment.due_at) >= _aware(due_from))
        and (due_to is None or _aware(assignment.due_at) <= _aware(due_to))
        and (normalized_query is None or normalized_query in assignment.title.casefold())
    ]
    return filtered[offset : offset + limit]


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


@router.post(
    "/assignments", response_model=schemas.AssignmentRead, status_code=status.HTTP_201_CREATED
)
def create_assignment(payload: schemas.AssignmentCreate, session: SessionDep) -> models.Assignment:
    return create_entity(session, models.Assignment, payload)


@router.get("/assignments/{entity_id}", response_model=schemas.AssignmentRead)
def get_assignment(entity_id: UUID, session: SessionDep) -> models.Assignment:
    return get_entity(session, models.Assignment, entity_id)


@router.patch("/assignments/{entity_id}", response_model=schemas.AssignmentRead)
def update_assignment(
    entity_id: UUID, payload: schemas.AssignmentUpdate, session: SessionDep
) -> models.Assignment:
    return update_entity(session, models.Assignment, entity_id, payload)


@router.delete("/assignments/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.Assignment, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/assignment-relations", response_model=list[schemas.AssignmentRelationRead])
def list_assignment_relations(
    session: SessionDep, offset: Offset = 0, limit: Limit = 50
) -> list[models.AssignmentRelation]:
    return list_entities(session, models.AssignmentRelation, offset=offset, limit=limit)


@router.post(
    "/assignment-relations",
    response_model=schemas.AssignmentRelationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment_relation(
    payload: schemas.AssignmentRelationCreate, session: SessionDep
) -> models.AssignmentRelation:
    return create_entity(session, models.AssignmentRelation, payload)


@router.get("/assignment-relations/{entity_id}", response_model=schemas.AssignmentRelationRead)
def get_assignment_relation(entity_id: UUID, session: SessionDep) -> models.AssignmentRelation:
    return get_entity(session, models.AssignmentRelation, entity_id)


@router.patch("/assignment-relations/{entity_id}", response_model=schemas.AssignmentRelationRead)
def update_assignment_relation(
    entity_id: UUID, payload: schemas.AssignmentRelationUpdate, session: SessionDep
) -> models.AssignmentRelation:
    return update_entity(session, models.AssignmentRelation, entity_id, payload)


@router.delete("/assignment-relations/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment_relation(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.AssignmentRelation, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tasks", response_model=list[schemas.TaskRead])
def list_tasks(session: SessionDep, offset: Offset = 0, limit: Limit = 50) -> list[models.Task]:
    return list_entities(session, models.Task, offset=offset, limit=limit)


@router.post("/tasks", response_model=schemas.TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: schemas.TaskCreate, session: SessionDep) -> models.Task:
    return create_entity(session, models.Task, payload)


@router.get("/tasks/{entity_id}", response_model=schemas.TaskRead)
def get_task(entity_id: UUID, session: SessionDep) -> models.Task:
    return get_entity(session, models.Task, entity_id)


@router.patch("/tasks/{entity_id}", response_model=schemas.TaskRead)
def update_task(entity_id: UUID, payload: schemas.TaskUpdate, session: SessionDep) -> models.Task:
    return update_entity(session, models.Task, entity_id, payload)


@router.delete("/tasks/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.Task, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/documents", response_model=list[schemas.DocumentRead])
def list_documents(
    session: SessionDep, offset: Offset = 0, limit: Limit = 50
) -> list[models.Document]:
    return list_entities(session, models.Document, offset=offset, limit=limit)


@router.post("/documents", response_model=schemas.DocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(payload: schemas.DocumentCreate, session: SessionDep) -> models.Document:
    return create_entity(session, models.Document, payload)


@router.get("/documents/{entity_id}", response_model=schemas.DocumentRead)
def get_document(entity_id: UUID, session: SessionDep) -> models.Document:
    return get_entity(session, models.Document, entity_id)


@router.patch("/documents/{entity_id}", response_model=schemas.DocumentRead)
def update_document(
    entity_id: UUID, payload: schemas.DocumentUpdate, session: SessionDep
) -> models.Document:
    return update_entity(session, models.Document, entity_id, payload)


@router.delete("/documents/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.Document, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/schedule-events", response_model=list[schemas.ScheduleEventRead])
def list_schedule_events(
    session: SessionDep, offset: Offset = 0, limit: Limit = 50
) -> list[models.ScheduleEvent]:
    return list_entities(session, models.ScheduleEvent, offset=offset, limit=limit)


@router.post(
    "/schedule-events",
    response_model=schemas.ScheduleEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_schedule_event(
    payload: schemas.ScheduleEventCreate, session: SessionDep
) -> models.ScheduleEvent:
    return create_entity(session, models.ScheduleEvent, payload)


@router.get("/schedule-events/{entity_id}", response_model=schemas.ScheduleEventRead)
def get_schedule_event(entity_id: UUID, session: SessionDep) -> models.ScheduleEvent:
    return get_entity(session, models.ScheduleEvent, entity_id)


@router.patch("/schedule-events/{entity_id}", response_model=schemas.ScheduleEventRead)
def update_schedule_event(
    entity_id: UUID, payload: schemas.ScheduleEventUpdate, session: SessionDep
) -> models.ScheduleEvent:
    return update_entity(session, models.ScheduleEvent, entity_id, payload)


@router.delete("/schedule-events/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_event(entity_id: UUID, session: SessionDep) -> Response:
    delete_entity(session, models.ScheduleEvent, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
