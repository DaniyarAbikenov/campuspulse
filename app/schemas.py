from collections.abc import Callable
from datetime import date, datetime, time
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    model_validator,
)

from app.db.models import (
    AgentActionKind,
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
    PlanStatus,
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


class StatusTaskRead(StrictSchema):
    id: UUID
    title: str
    status: TaskStatus
    estimated_hours: StrictFloat
    scheduled_hours: StrictFloat


class StatusSessionRead(StrictSchema):
    task_title: str | None
    starts_at: datetime
    ends_at: datetime


class AssignmentStatusRead(StrictSchema):
    """One authoritative snapshot of where an assignment stands; every figure comes from here."""

    id: UUID
    title: str
    status: AssignmentStatus
    due_at: datetime
    progress_percent: StrictInt
    estimated_hours: StrictFloat
    completed_hours: StrictFloat
    remaining_hours: StrictFloat
    scheduled_hours: StrictFloat
    unscheduled_hours: StrictFloat
    tasks_total: StrictInt
    tasks_done: StrictInt
    tasks_open: StrictInt
    tasks: list[StatusTaskRead]
    study_sessions: list[StatusSessionRead]


class AssignmentChangeRead(StrictSchema):
    assignment: AssignmentRead
    removed_tasks: StrictInt
    removed_sessions: StrictInt


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
    task_id: UUID | None = None

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
    task_id: UUID | None = None

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
    series_id: UUID | None = None


class ScheduleSeriesCreate(StrictSchema):
    """A repeating activity or semester subject: weekdays 0 (Monday) to 6, times as HH:MM."""

    title: ShortText
    kind: Literal["personal", "class_session"] = "personal"
    weekdays: Annotated[list[Annotated[StrictInt, Field(ge=0, le=6)]], Field(min_length=1)]
    start: Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
    end: Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
    starts_on: date
    ends_on: date | None = None
    location: Annotated[str, Field(min_length=1, max_length=240)] | None = None
    course_id: UUID | None = None

    @model_validator(mode="after")
    def validate_times(self) -> "ScheduleSeriesCreate":
        if self.end <= self.start:
            raise ValueError("end must be after start")
        if self.ends_on is not None and self.ends_on < self.starts_on:
            raise ValueError("ends_on must not be before starts_on")
        return self


class ScheduleSeriesRead(StrictSchema):
    id: UUID
    title: str
    kind: ScheduleEventKind
    weekdays: list[int]
    start: str
    end: str
    starts_on: date
    ends_on: date
    location: str | None
    course_id: UUID | None
    occurrences: StrictInt


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
    institution_name: str | None = None
    semester_name: str | None = None


class OnboardingRequest(StrictSchema):
    institution_id: UUID
    student_number: Annotated[str, Field(min_length=1, max_length=64)]
    program: Annotated[str, Field(min_length=1, max_length=200)]
    group_name: Annotated[str, Field(min_length=1, max_length=100)] | None = None
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


class WeeklyStatRead(StrictSchema):
    week_start: date
    planned_hours: StrictFloat
    actual_hours: StrictFloat


class CourseStatRead(StrictSchema):
    course_id: UUID
    course_name: str
    completed_assignments: StrictInt
    estimated_hours: StrictFloat
    actual_hours: StrictFloat
    estimate_accuracy_percent: StrictInt | None


class StudyStatisticsRead(StrictSchema):
    reported_study_hours: StrictFloat
    estimate_accuracy_percent: StrictInt | None
    completed_assignments: StrictInt
    completed: list[CompletedAssignmentStatRead]
    weekly: list[WeeklyStatRead]
    by_course: list[CourseStatRead]


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
    # An empty or blank group clears it.
    group_name: Annotated[str, Field(max_length=100)] | None = None
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


class InsightEvidence(StrictSchema):
    kind: Literal["assignment", "task", "document", "workload", "free_time"]
    label: Annotated[str, Field(min_length=1, max_length=200)]
    ref_id: UUID | None = None


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
    reasoning: str
    evidence: list[InsightEvidence]
    generated_by: str


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


class ExtractionRead(StrictSchema):
    status: Literal["ok", "no_text", "unsupported", "failed"]
    pages: StrictInt
    characters: StrictInt


class AssignmentUploadRead(StrictSchema):
    assignment: AssignmentRead
    document: DocumentRead
    extraction: ExtractionRead


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
    can_edit: StrictBool = False


class CampusEventCreate(StrictSchema):
    title: ShortText
    description: Annotated[str, Field(max_length=4000)] | None = None
    category: CampusEventCategory
    place: ShortText
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def validate_range(self) -> "CampusEventCreate":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class CampusEventUpdate(StrictSchema):
    title: ShortText | None = None
    description: Annotated[str, Field(max_length=4000)] | None = None
    category: CampusEventCategory | None = None
    place: ShortText | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class MaterialUpdate(StrictSchema):
    name: Annotated[str, Field(min_length=1, max_length=255)] | None = None
    kind: DocumentKind | None = None
    course_id: UUID | None = None


class AgentActionCreate(StrictSchema):
    kind: AgentActionKind
    title: ShortText
    summary: Annotated[str, Field(max_length=1000)] = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentActionBatch(StrictSchema):
    actions: Annotated[list[AgentActionCreate], Field(min_length=1, max_length=5)]


class AgentActionRead(StrictSchema):
    id: UUID
    kind: AgentActionKind
    title: str
    summary: str
    payload: dict[str, Any]
    status: PlanStatus
    created_at: datetime


class AgentActionRejected(StrictSchema):
    title: str
    reason: str


class AgentActionResult(StrictSchema):
    created: list[AgentActionRead]
    rejected: list[AgentActionRejected]


class AgentActionApplyRead(StrictSchema):
    action: AgentActionRead
    detail: str


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
    # Interface language: the agent writes everything the student reads in it.
    language: Literal["en", "ru", "kk"] | None = None


class AgentChatStepRead(StrictSchema):
    kind: Literal["thought", "tool_call", "tool_result"]
    name: str | None
    detail: str


class AgentChatRead(StrictSchema):
    session_id: str
    reply: str
    run_id: UUID
    steps: list[AgentChatStepRead]
    actions: list[AgentActionRead] = Field(default_factory=list)


class AgentStatusRead(StrictSchema):
    enabled: StrictBool
    mode: str


class OnboardingCourseRead(StrictSchema):
    id: UUID
    code: str
    name: str


class OnboardingInstitutionRead(StrictSchema):
    id: UUID
    name: str
    short_name: str
    courses: list[OnboardingCourseRead]


class OnboardingOptionsRead(StrictSchema):
    institutions: list[OnboardingInstitutionRead]


class AssignmentPageRead(StrictSchema):
    page: StrictInt
    text: str


class AssignmentTextRead(StrictSchema):
    assignment_id: UUID
    title: str
    course_name: str
    due_at: datetime
    pages: list[AssignmentPageRead]


def _clip(limit: int) -> Callable[[Any], Any]:
    """Models over-write; trim instead of rejecting the whole plan (quotes stay substrings)."""

    def clip(value: Any) -> Any:
        return value.strip()[:limit] if isinstance(value, str) else value

    return clip


def _normalize_priority(value: Any) -> Any:
    text = str(value).strip().lower() if value is not None else "medium"
    return text if text in {"low", "medium", "high"} else "medium"


def _clamp_hours(value: Any) -> Any:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return min(40.0, max(0.25, round(float(value) * 4) / 4))
    return value


class TaskPlanItemCreate(StrictSchema):
    requirement_id: Annotated[str, Field(min_length=1, max_length=16), BeforeValidator(_clip(16))]
    requirement_text: Annotated[
        str, Field(min_length=1, max_length=1000), BeforeValidator(_clip(1000))
    ]
    quote: Annotated[str, Field(min_length=1, max_length=1500), BeforeValidator(_clip(1500))]
    page: Annotated[
        StrictInt, Field(ge=1), BeforeValidator(lambda v: max(1, v) if isinstance(v, int) else v)
    ]
    title: Annotated[str, Field(min_length=1, max_length=240), BeforeValidator(_clip(240))]
    description: Annotated[str, Field(max_length=2000), BeforeValidator(_clip(2000))] = ""
    estimated_hours: Annotated[StrictFloat, Field(gt=0, le=40), BeforeValidator(_clamp_hours)]
    priority: Annotated[Priority, BeforeValidator(_normalize_priority)] = Priority.medium


class TaskPlanCreate(StrictSchema):
    assignment_id: UUID
    summary: Annotated[str, Field(max_length=2000)] = ""
    related_assignment_id: UUID | None = None
    relation_type: AssignmentRelationType | None = None
    items: Annotated[list[TaskPlanItemCreate], Field(min_length=1, max_length=30)]


class TaskPlanItemRead(StrictSchema):
    id: UUID
    position: StrictInt
    requirement_id: str
    requirement_text: str
    quote: str
    page: StrictInt
    quote_verified: StrictBool
    title: str
    description: str
    estimated_hours: StrictFloat
    priority: Priority
    selected: StrictBool
    task_id: UUID | None


class TaskPlanRead(StrictSchema):
    id: UUID
    assignment_id: UUID
    status: PlanStatus
    summary: str
    related_assignment_id: UUID | None
    related_assignment_title: str | None
    relation_type: AssignmentRelationType | None
    created_at: datetime
    applied_at: datetime | None
    items: list[TaskPlanItemRead]


class TaskPlanItemUpdate(StrictSchema):
    selected: StrictBool | None = None
    estimated_hours: Annotated[StrictFloat, Field(gt=0, le=40)] | None = None
    title: ShortText | None = None


class TaskPlanApplyRead(StrictSchema):
    replaced: StrictInt = 0
    plan: TaskPlanRead
    created: StrictInt


class AssignmentAnalysisRead(StrictSchema):
    plan: TaskPlanRead
    steps: list[AgentChatStepRead]


class PlannedSessionRead(StrictSchema):
    task_id: UUID
    task_title: str
    assignment_title: str
    course_id: UUID
    starts_at: datetime
    ends_at: datetime
    hours: StrictFloat


class UnplacedTaskRead(StrictSchema):
    task_id: UUID
    task_title: str
    assignment_title: str
    due_at: datetime
    hours: StrictFloat


class StudyPlanRead(StrictSchema):
    week_start: date
    sessions: list[PlannedSessionRead]
    unplaced: list[UnplacedTaskRead]
    placed_hours: StrictFloat
    unplaced_hours: StrictFloat
    free_hours: StrictFloat


class StudyPlanApplyRead(StrictSchema):
    created: StrictInt
    plan: StudyPlanRead


class AdminCourseRead(StrictSchema):
    course_id: UUID
    code: str
    name: str
    instructor_name: str | None
    suppressed: StrictBool
    enrolled_students: StrictInt | None
    open_assignments: StrictInt
    median_estimate_hours: StrictFloat | None
    median_reported_hours: StrictFloat | None
    estimate_accuracy_percent: StrictInt | None
    overload_risk_percent: StrictInt | None


class AdminWeekRead(StrictSchema):
    week_start: date
    estimated_hours_per_student: StrictFloat | None
    reported_hours_per_student: StrictFloat | None


class AdminActivityRead(StrictSchema):
    kind: str
    title: str
    count: StrictInt | None


class AdminTotalsRead(StrictSchema):
    students: StrictInt | None
    enrolments: StrictInt | None
    courses: StrictInt
    open_assignments: StrictInt


class AdminOverviewRead(StrictSchema):
    institution_name: str
    semester_name: str | None
    min_cohort_size: StrictInt
    totals: AdminTotalsRead
    courses: list[AdminCourseRead]
    weekly: list[AdminWeekRead]
    peak_week: date | None
    peak_hours_per_student: StrictFloat | None
    highest_risk_course: str | None
    highest_risk_percent: StrictInt | None
    activity: list[AdminActivityRead]


class AgentInsightSource(StrictSchema):
    kind: Literal["assignment", "task", "document", "workload", "free_time"]
    label: Annotated[str, Field(min_length=1, max_length=200), BeforeValidator(_clip(200))]
    ref_id: UUID | None = None


class AgentStudySession(StrictSchema):
    title: Annotated[str, Field(min_length=1, max_length=240), BeforeValidator(_clip(240))]
    starts_at: datetime
    ends_at: datetime
    course_id: UUID | None = None
    task_id: UUID | None = None


def _clamp_percent(value: Any) -> Any:
    return min(100, max(0, int(value))) if isinstance(value, int | float) else value


class AgentInsightItem(StrictSchema):
    category: Literal[
        "workload_warning",
        "deadline_conflict",
        "schedule_opportunity",
        "study_preparation",
        "assignment_analysis",
    ]
    severity: Annotated[InsightSeverity, BeforeValidator(_normalize_priority)] = (
        InsightSeverity.medium
    )
    title: Annotated[str, Field(min_length=1, max_length=240), BeforeValidator(_clip(240))]
    summary: Annotated[str, Field(min_length=1, max_length=1000), BeforeValidator(_clip(1000))]
    reasoning: Annotated[str, Field(min_length=1, max_length=1500), BeforeValidator(_clip(1500))]
    suggestion: Annotated[str, Field(min_length=1, max_length=1000), BeforeValidator(_clip(1000))]
    confidence: Annotated[StrictInt, Field(ge=0, le=100), BeforeValidator(_clamp_percent)] = 70
    sources: Annotated[list[AgentInsightSource], Field(max_length=8)] = Field(default_factory=list)
    study_session: AgentStudySession | None = None


class AgentInsightBatch(StrictSchema):
    insights: Annotated[list[AgentInsightItem], Field(min_length=1, max_length=6)]


class RejectedInsightRead(StrictSchema):
    title: str
    reason: str


class AgentInsightResult(StrictSchema):
    created: list[InsightRead]
    rejected: list[RejectedInsightRead]


class InsightRefreshRead(StrictSchema):
    created: list[InsightRead]
    rejected: list[RejectedInsightRead]
    steps: list[AgentChatStepRead]
