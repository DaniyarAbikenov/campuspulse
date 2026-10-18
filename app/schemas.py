from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    model_validator,
)

from app.db.models import (
    AssignmentRelationType,
    AssignmentStatus,
    AuditOutcome,
    Difficulty,
    DocumentKind,
    Priority,
    ScheduleEventKind,
    TaskStatus,
)

ShortText = Annotated[str, Field(min_length=1, max_length=240)]
Hours = Annotated[StrictFloat, Field(ge=0, le=10_000)]
Progress = Annotated[StrictInt, Field(ge=0, le=100)]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class EntityRead(StrictSchema):
    id: UUID
    created_at: datetime
    updated_at: datetime


class InstitutionCreate(StrictSchema):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    short_name: Annotated[str, Field(min_length=1, max_length=32)]
    timezone_name: Annotated[str, Field(min_length=1, max_length=64)] = "UTC"


class InstitutionUpdate(StrictSchema):
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    short_name: Annotated[str, Field(min_length=1, max_length=32)] | None = None
    timezone_name: Annotated[str, Field(min_length=1, max_length=64)] | None = None


class InstitutionRead(InstitutionCreate, EntityRead):
    pass


class UserCreate(StrictSchema):
    institution_id: UUID | None = None
    email: EmailStr
    full_name: Annotated[str, Field(min_length=1, max_length=200)]
    student_number: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    program: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    is_active: StrictBool = True


class UserUpdate(StrictSchema):
    institution_id: UUID | None = None
    email: EmailStr | None = None
    full_name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    student_number: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    program: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    is_active: StrictBool | None = None


class UserRead(UserCreate, EntityRead):
    pass


class IdentityAccountCreate(StrictSchema):
    user_id: UUID
    provider: Annotated[str, Field(min_length=1, max_length=64)]
    subject: Annotated[str, Field(min_length=1, max_length=255)]
    provider_email: EmailStr | None = None
    last_login_at: datetime | None = None


class IdentityAccountUpdate(StrictSchema):
    provider_email: EmailStr | None = None
    last_login_at: datetime | None = None


class IdentityAccountRead(IdentityAccountCreate, EntityRead):
    pass


class RoleCreate(StrictSchema):
    code: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")]
    name: Annotated[str, Field(min_length=1, max_length=100)]
    description: str | None = None


class RoleUpdate(StrictSchema):
    name: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    description: str | None = None


class RoleRead(RoleCreate, EntityRead):
    pass


class UserRoleCreate(StrictSchema):
    user_id: UUID
    role_id: UUID


class UserRoleRead(UserRoleCreate, EntityRead):
    pass


class SemesterCreate(StrictSchema):
    institution_id: UUID
    name: Annotated[str, Field(min_length=1, max_length=100)]
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def validate_range(self) -> "SemesterCreate":
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must be on or after starts_on")
        return self


class SemesterUpdate(StrictSchema):
    institution_id: UUID | None = None
    name: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "SemesterUpdate":
        if (
            self.starts_on is not None
            and self.ends_on is not None
            and self.ends_on < self.starts_on
        ):
            raise ValueError("ends_on must be on or after starts_on")
        return self


class SemesterRead(SemesterCreate, EntityRead):
    pass


class CourseCreate(StrictSchema):
    semester_id: UUID
    code: Annotated[str, Field(min_length=1, max_length=32)]
    name: Annotated[str, Field(min_length=1, max_length=200)]
    instructor_name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    color: Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")] | None = None


class CourseUpdate(StrictSchema):
    semester_id: UUID | None = None
    code: Annotated[str, Field(min_length=1, max_length=32)] | None = None
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    instructor_name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    color: Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")] | None = None


class CourseRead(CourseCreate, EntityRead):
    pass


class EnrollmentCreate(StrictSchema):
    user_id: UUID
    course_id: UUID


class EnrollmentUpdate(StrictSchema):
    user_id: UUID | None = None
    course_id: UUID | None = None


class EnrollmentRead(EnrollmentCreate, EntityRead):
    pass


class AssignmentCreate(StrictSchema):
    course_id: UUID
    title: ShortText
    description: str | None = None
    due_at: datetime
    status: AssignmentStatus = AssignmentStatus.upcoming
    difficulty: Difficulty | None = None
    estimated_hours: Hours = 0
    actual_hours: Hours | None = None
    progress: Progress = 0


class AssignmentUpdate(StrictSchema):
    course_id: UUID | None = None
    title: ShortText | None = None
    description: str | None = None
    due_at: datetime | None = None
    status: AssignmentStatus | None = None
    difficulty: Difficulty | None = None
    estimated_hours: Hours | None = None
    actual_hours: Hours | None = None
    progress: Progress | None = None


class AssignmentRead(AssignmentCreate, EntityRead):
    pass


class AssignmentRelationCreate(StrictSchema):
    source_assignment_id: UUID
    target_assignment_id: UUID
    relation_type: AssignmentRelationType

    @model_validator(mode="after")
    def validate_distinct_assignments(self) -> "AssignmentRelationCreate":
        if self.source_assignment_id == self.target_assignment_id:
            raise ValueError("source_assignment_id and target_assignment_id must differ")
        return self


class AssignmentRelationUpdate(StrictSchema):
    relation_type: AssignmentRelationType | None = None


class AssignmentRelationRead(AssignmentRelationCreate, EntityRead):
    pass


class TaskCreate(StrictSchema):
    assignment_id: UUID
    title: ShortText
    description: str | None = None
    status: TaskStatus = TaskStatus.backlog
    priority: Priority = Priority.medium
    estimated_hours: Hours = 0
    due_at: datetime | None = None


class TaskUpdate(StrictSchema):
    assignment_id: UUID | None = None
    title: ShortText | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    estimated_hours: Hours | None = None
    due_at: datetime | None = None


class TaskRead(TaskCreate, EntityRead):
    pass


class DocumentCreate(StrictSchema):
    course_id: UUID
    assignment_id: UUID | None = None
    name: Annotated[str, Field(min_length=1, max_length=255)]
    kind: DocumentKind
    page_count: Annotated[StrictInt, Field(ge=0)] = 0
    storage_key: Annotated[str, Field(min_length=1, max_length=500)] | None = None


class DocumentUpdate(StrictSchema):
    course_id: UUID | None = None
    assignment_id: UUID | None = None
    name: Annotated[str, Field(min_length=1, max_length=255)] | None = None
    kind: DocumentKind | None = None
    page_count: Annotated[StrictInt, Field(ge=0)] | None = None
    storage_key: Annotated[str, Field(min_length=1, max_length=500)] | None = None


class DocumentRead(DocumentCreate, EntityRead):
    pass


class ScheduleEventCreate(StrictSchema):
    user_id: UUID
    course_id: UUID | None = None
    title: ShortText
    kind: ScheduleEventKind
    starts_at: datetime
    ends_at: datetime
    location: Annotated[str, Field(min_length=1, max_length=240)] | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "ScheduleEventCreate":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class ScheduleEventUpdate(StrictSchema):
    user_id: UUID | None = None
    course_id: UUID | None = None
    title: ShortText | None = None
    kind: ScheduleEventKind | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: Annotated[str, Field(min_length=1, max_length=240)] | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "ScheduleEventUpdate":
        if (
            self.starts_at is not None
            and self.ends_at is not None
            and self.ends_at <= self.starts_at
        ):
            raise ValueError("ends_at must be after starts_at")
        return self


class ScheduleEventRead(ScheduleEventCreate, EntityRead):
    pass


class AuditEventCreate(StrictSchema):
    actor_user_id: UUID | None = None
    action: Annotated[str, Field(min_length=1, max_length=100)]
    resource_type: Annotated[str, Field(min_length=1, max_length=100)]
    resource_id: UUID | None = None
    outcome: AuditOutcome = AuditOutcome.success
    request_id: UUID | None = None
    context_data: dict[str, object] | None = None


class AuditEventRead(AuditEventCreate):
    id: UUID
    occurred_at: datetime
