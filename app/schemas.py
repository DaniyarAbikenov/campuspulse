from datetime import date, datetime, time
from typing import Annotated, Literal
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
    AgentRunKind,
    AgentRunStatus,
    AssignmentRelationType,
    AssignmentStatus,
    AuditOutcome,
    CampusEventCategory,
    Difficulty,
    DocumentKind,
    ImportStatus,
    InsightActionType,
    InsightSeverity,
    InsightStatus,
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
    owner_user_id: UUID | None = None
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
    owner_user_id: UUID


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
    is_ai_generated: bool = False
    source_requirement: Annotated[str, Field(max_length=40)] | None = None


class TaskUpdate(StrictSchema):
    assignment_id: UUID | None = None
    title: ShortText | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    estimated_hours: Hours | None = None
    due_at: datetime | None = None
    is_ai_generated: bool | None = None
    source_requirement: Annotated[str, Field(max_length=40)] | None = None


class TaskRead(TaskCreate, EntityRead):
    pass


class KanbanTaskRead(TaskRead):
    course_id: UUID


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


class GoogleLoginRequest(StrictSchema):
    credential: Annotated[str, Field(min_length=20, max_length=10_000)]


class RefreshTokenRequest(StrictSchema):
    refresh_token: Annotated[str, Field(min_length=32, max_length=500)]


class TokenPairRead(StrictSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: StrictInt


class AuthUserRead(StrictSchema):
    id: UUID
    email: EmailStr
    full_name: str
    institution_id: UUID | None
    roles: list[str]


class OnboardingRequest(StrictSchema):
    institution_id: UUID
    student_number: Annotated[str, Field(min_length=1, max_length=64)]
    program: Annotated[str, Field(min_length=1, max_length=200)]
    course_ids: Annotated[list[UUID], Field(max_length=20)] = Field(default_factory=list)


class CourseSummaryRead(CourseRead):
    assignment_count: StrictInt
    completed_assignment_count: StrictInt
    completion_percent: StrictInt
    remaining_hours: StrictFloat
    next_due_at: datetime | None


class AssignmentSummaryRead(AssignmentRead):
    course_code: str
    course_name: str
    task_count: StrictInt
    completed_task_count: StrictInt
    document_count: StrictInt
    remaining_hours: StrictFloat


class AssignmentOverviewPageRead(StrictSchema):
    total: StrictInt
    status_counts: dict[AssignmentStatus, StrictInt]
    items: list[AssignmentSummaryRead]


class FreeTimeSlotRead(StrictSchema):
    starts_at: datetime
    ends_at: datetime
    duration_hours: StrictFloat


class ScheduleWeekRead(StrictSchema):
    week_start: date
    week_end: date
    events: list[ScheduleEventRead]
    free_time: list[FreeTimeSlotRead]
    scheduled_study_hours: StrictFloat
    free_hours: StrictFloat
    unscheduled_work_hours: StrictFloat


class KanbanColumnRead(StrictSchema):
    status: TaskStatus
    task_count: StrictInt
    estimated_hours: StrictFloat
    tasks: list[KanbanTaskRead]


class KanbanBoardRead(StrictSchema):
    total_tasks: StrictInt
    open_tasks: StrictInt
    open_estimated_hours: StrictFloat
    columns: list[KanbanColumnRead]


class KanbanMoveRequest(StrictSchema):
    status: TaskStatus


class WorkloadCourseRead(StrictSchema):
    course_id: UUID
    course_code: str
    course_name: str
    remaining_hours: StrictFloat


class WorkloadDayRead(StrictSchema):
    day: date
    required_hours: StrictFloat
    available_hours: StrictFloat
    overload_hours: StrictFloat


class WorkloadRead(StrictSchema):
    week_start: date
    week_end: date
    required_hours: StrictFloat
    available_hours: StrictFloat
    overload_hours: StrictFloat
    scheduled_study_hours: StrictFloat
    unscheduled_hours: StrictFloat
    peak_day: date | None
    by_course: list[WorkloadCourseRead]
    by_day: list[WorkloadDayRead]


class CompletedAssignmentStatRead(StrictSchema):
    assignment_id: UUID
    title: str
    course_name: str
    estimated_hours: StrictFloat
    actual_hours: StrictFloat
    delta_hours: StrictFloat


class StudyStatisticsRead(StrictSchema):
    reported_study_hours: StrictFloat
    estimate_accuracy_percent: StrictInt
    completed_assignments: StrictInt
    completed: list[CompletedAssignmentStatRead]


class SettingsRead(StrictSchema):
    full_name: str
    program: str | None
    group_name: str | None
    interface_language: str
    max_study_hours_per_day: StrictFloat
    earliest_start: time
    latest_end: time
    proactive_insights: StrictBool
    automatic_task_generation: StrictBool
    share_anonymized_completion_times: StrictBool
    deadline_reminders: StrictBool
    daily_briefing: StrictBool
    event_suggestions: StrictBool


class SettingsUpdate(StrictSchema):
    full_name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    program: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    group_name: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    interface_language: Annotated[str, Field(min_length=2, max_length=16)] | None = None
    max_study_hours_per_day: Annotated[StrictFloat, Field(gt=0, le=24)] | None = None
    earliest_start: time | None = None
    latest_end: time | None = None
    proactive_insights: StrictBool | None = None
    automatic_task_generation: StrictBool | None = None
    share_anonymized_completion_times: StrictBool | None = None
    deadline_reminders: StrictBool | None = None
    daily_briefing: StrictBool | None = None
    event_suggestions: StrictBool | None = None

    @model_validator(mode="after")
    def validate_availability(self) -> "SettingsUpdate":
        if (
            self.earliest_start is not None
            and self.latest_end is not None
            and self.latest_end <= self.earliest_start
        ):
            raise ValueError("latest_end must be after earliest_start")
        return self


class InsightCta(StrictSchema):
    label: Annotated[str, Field(min_length=1, max_length=100)]
    action: Annotated[str, Field(min_length=1, max_length=100)]
    style: Annotated[str, Field(min_length=1, max_length=32)] = "primary"


class InsightRead(EntityRead):
    user_id: UUID
    course_id: UUID | None
    assignment_id: UUID | None
    category: str
    title: str
    summary: str
    suggestion: str
    confidence: StrictInt
    severity: InsightSeverity
    status: InsightStatus
    cta: InsightCta
    action_type: InsightActionType
    action_payload: dict[str, object] | None
    snoozed_until: datetime | None
    applied_at: datetime | None


class InsightCreate(StrictSchema):
    user_id: UUID
    course_id: UUID | None = None
    assignment_id: UUID | None = None
    category: Annotated[str, Field(min_length=1, max_length=100)]
    title: ShortText
    summary: str
    suggestion: str
    confidence: Annotated[StrictInt, Field(ge=0, le=100)]
    severity: InsightSeverity
    cta: InsightCta
    action_type: InsightActionType = InsightActionType.none
    action_payload: dict[str, object] | None = None


class InsightStatusUpdate(StrictSchema):
    status: InsightStatus
    snoozed_until: datetime | None = None


class InsightApplyRead(StrictSchema):
    insight: InsightRead
    created_resource_type: str | None = None
    created_resource_ids: list[UUID] = Field(default_factory=list)


class AssignmentUploadRead(StrictSchema):
    assignment: AssignmentRead
    document: DocumentRead


class KnowledgeDocumentRead(StrictSchema):
    id: UUID
    course_id: UUID
    assignment_id: UUID | None
    name: str
    kind: DocumentKind
    page_count: StrictInt
    indexed_at: datetime
    concepts: list[str]


class DocumentFragmentRead(StrictSchema):
    id: UUID
    document_id: UUID
    assignment_id: UUID | None
    page: StrictInt
    concept: str
    text: str
    requirement_id: str | None


class KnowledgeBaseRead(StrictSchema):
    document_count: StrictInt
    page_count: StrictInt
    documents: list[KnowledgeDocumentRead]
    fragments: list[DocumentFragmentRead]


class CampusEventRead(StrictSchema):
    id: UUID
    title: str
    description: str | None
    category: CampusEventCategory
    place: str
    starts_at: datetime
    ends_at: datetime
    match_percent: StrictInt | None
    reason: str | None
    is_saved: StrictBool


class CampusEventSaveRequest(StrictSchema):
    saved: StrictBool


class AgentToolCallBase(StrictSchema):
    tool_name: Annotated[str, Field(min_length=1, max_length=120)]
    arguments: dict[str, object] = Field(default_factory=dict)
    result_summary: str | None = None
    status: AgentRunStatus = AgentRunStatus.success
    duration_ms: Annotated[StrictInt, Field(ge=0)] | None = None


class AgentToolCallCreate(AgentToolCallBase):
    pass


class AgentToolCallRead(AgentToolCallBase):
    id: UUID
    position: StrictInt


class AgentRunCreate(StrictSchema):
    kind: AgentRunKind
    title: ShortText
    detail: str = ""
    status: AgentRunStatus = AgentRunStatus.success
    tool_calls: list[AgentToolCallCreate] = Field(default_factory=list, max_length=50)


class AgentRunRead(StrictSchema):
    id: UUID
    kind: AgentRunKind
    title: str
    detail: str
    status: AgentRunStatus
    started_at: datetime
    finished_at: datetime | None
    tool_calls: list[AgentToolCallRead]


class AgentActivityRead(StrictSchema):
    total: StrictInt
    tool_call_count: StrictInt
    runs: list[AgentRunRead]


class ImportItemCreate(StrictSchema):
    external_id: Annotated[str, Field(min_length=1, max_length=255)]
    title: ShortText
    description: str | None = None
    due_at: datetime
    external_course_code: Annotated[str, Field(min_length=1, max_length=120)]
    external_course_name: Annotated[str, Field(min_length=1, max_length=240)]
    attachment_names: list[str] = Field(default_factory=list, max_length=20)


class ImportProposalCreate(StrictSchema):
    source: Annotated[str, Field(min_length=1, max_length=40)]
    items: Annotated[list[ImportItemCreate], Field(min_length=1, max_length=200)]


class ImportItemRead(StrictSchema):
    id: UUID
    external_id: str
    title: str
    description: str | None
    due_at: datetime
    external_course_code: str
    external_course_name: str
    course_id: UUID | None
    create_course: StrictBool
    estimated_hours: StrictFloat
    selected: StrictBool
    attachment_names: list[str]
    assignment_id: UUID | None


class ImportProposalRead(StrictSchema):
    id: UUID
    source: str
    status: ImportStatus
    created_at: datetime
    applied_at: datetime | None
    items: list[ImportItemRead]


class ImportProposalResult(StrictSchema):
    proposal: ImportProposalRead | None
    skipped_existing: StrictInt


class ImportItemUpdate(StrictSchema):
    selected: StrictBool | None = None
    course_id: UUID | None = None
    create_course: StrictBool | None = None
    estimated_hours: Hours | None = None


class ImportApplyRead(StrictSchema):
    proposal: ImportProposalRead
    created: StrictInt
    already_imported: StrictInt


class AgentChatRequest(StrictSchema):
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    session_id: Annotated[str, Field(min_length=1, max_length=200)] | None = None


class AgentChatStepRead(StrictSchema):
    kind: Literal["thought", "tool_call", "tool_result"]
    name: str | None
    detail: str


class AgentChatRead(StrictSchema):
    session_id: str
    reply: str
    run_id: UUID
    steps: list[AgentChatStepRead]


class AgentStatusRead(StrictSchema):
    enabled: StrictBool
    mode: str
