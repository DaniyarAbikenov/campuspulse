from datetime import UTC, date, datetime, time
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
    text,
    true,
)
from sqlalchemy import (
    Enum as SqlEnum,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class AssignmentStatus(StrEnum):
    upcoming = "upcoming"
    todo = "todo"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


# Assignments that no longer count as open work, deadlines or workload.
INACTIVE_ASSIGNMENT_STATUSES = frozenset({AssignmentStatus.completed, AssignmentStatus.cancelled})


class Difficulty(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskStatus(StrEnum):
    backlog = "backlog"
    todo = "todo"
    in_progress = "in_progress"
    review = "review"
    completed = "completed"


class Priority(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class DocumentKind(StrEnum):
    assignment = "assignment"
    lecture = "lecture"
    syllabus = "syllabus"
    other = "other"


class ScheduleEventKind(StrEnum):
    class_session = "class_session"
    study_session = "study_session"
    deadline = "deadline"
    campus_event = "campus_event"
    personal = "personal"


class AssignmentRelationType(StrEnum):
    depends_on = "depends_on"
    extends = "extends"
    related_to = "related_to"


class AuditOutcome(StrEnum):
    success = "success"
    denied = "denied"
    failure = "failure"


class InsightStatus(StrEnum):
    new = "new"
    accepted = "accepted"
    applied = "applied"
    snoozed = "snoozed"
    dismissed = "dismissed"


class InsightSeverity(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class InsightActionType(StrEnum):
    none = "none"
    create_study_session = "create_study_session"
    import_tasks = "import_tasks"
    update_assignment = "update_assignment"


class CampusEventCategory(StrEnum):
    tech = "tech"
    career = "career"
    academic = "academic"
    sports = "sports"
    social = "social"


class AgentRunKind(StrEnum):
    analysis = "analysis"
    task = "task"
    dependency = "dependency"
    forecast = "forecast"
    insight = "insight"
    indexed = "indexed"
    schedule = "schedule"
    chat = "chat"


class AgentRunStatus(StrEnum):
    running = "running"
    success = "success"
    warning = "warning"
    failed = "failed"


class ImportStatus(StrEnum):
    pending = "pending"
    applied = "applied"
    dismissed = "dismissed"


class PlanStatus(StrEnum):
    pending = "pending"
    applied = "applied"
    dismissed = "dismissed"


class AgentActionKind(StrEnum):
    create_study_session = "create_study_session"
    create_calendar_activity = "create_calendar_activity"
    create_task = "create_task"
    update_task_status = "update_task_status"
    cancel_assignment = "cancel_assignment"


class Institution(TimestampMixin, Base):
    __tablename__ = "institutions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    short_name: Mapped[str] = mapped_column(String(32))
    timezone_name: Mapped[str] = mapped_column(String(64), default="UTC")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint(
            "institution_id", "student_number", name="uq_user_institution_student_number"
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    institution_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    student_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    program: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class IdentityAccount(TimestampMixin, Base):
    __tablename__ = "identity_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_identity_provider_subject"),
        UniqueConstraint("user_id", "provider", name="uq_identity_user_provider"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(64))
    subject: Mapped[str] = mapped_column(String(255))
    provider_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Role(TimestampMixin, Base):
    __tablename__ = "roles"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserRole(TimestampMixin, Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)


class UserSettings(TimestampMixin, Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint(
            "max_study_hours_per_day > 0 AND max_study_hours_per_day <= 24",
            name="ck_user_settings_max_study_hours",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    interface_language: Mapped[str] = mapped_column(String(16), default="en")
    group_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    max_study_hours_per_day: Mapped[float] = mapped_column(Float, default=4.0)
    earliest_start: Mapped[time] = mapped_column(default=time(8, 0))
    latest_end: Mapped[time] = mapped_column(default=time(20, 0))
    proactive_insights: Mapped[bool] = mapped_column(Boolean, default=True)
    automatic_task_generation: Mapped[bool] = mapped_column(Boolean, default=True)
    share_anonymized_completion_times: Mapped[bool] = mapped_column(Boolean, default=False)
    deadline_reminders: Mapped[bool] = mapped_column(Boolean, default=True)
    daily_briefing: Mapped[bool] = mapped_column(Boolean, default=True)
    event_suggestions: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Semester(TimestampMixin, Base):
    __tablename__ = "semesters"
    __table_args__ = (
        UniqueConstraint("institution_id", "name", name="uq_semester_institution_name"),
        CheckConstraint("ends_on >= starts_on", name="ck_semester_date_range"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)


class Course(TimestampMixin, Base):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("semester_id", "code", name="uq_course_semester_code"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    semester_id: Mapped[UUID] = mapped_column(
        ForeignKey("semesters.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    instructor_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)


class Enrollment(TimestampMixin, Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )


class Assignment(TimestampMixin, Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "external_ref", name="uq_assignment_external_ref"),
        CheckConstraint("estimated_hours >= 0", name="ck_assignment_estimated_hours"),
        CheckConstraint(
            "actual_hours IS NULL OR actual_hours >= 0", name="ck_assignment_actual_hours"
        ),
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_assignment_progress"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", name="fk_assignments_owner_user_id_users", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[AssignmentStatus] = mapped_column(
        SqlEnum(
            AssignmentStatus,
            native_enum=False,
            create_constraint=True,
            name="assignment_status",
        ),
        default=AssignmentStatus.upcoming,
    )
    difficulty: Mapped[Difficulty | None] = mapped_column(
        SqlEnum(
            Difficulty, native_enum=False, create_constraint=True, name="assignment_difficulty"
        ),
        nullable=True,
    )
    estimated_hours: Mapped[float] = mapped_column(Float, default=0)
    actual_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    external_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)


class AssignmentRelation(TimestampMixin, Base):
    __tablename__ = "assignment_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_assignment_id",
            "target_assignment_id",
            "relation_type",
            name="uq_assignment_relation",
        ),
        CheckConstraint(
            "source_assignment_id <> target_assignment_id",
            name="ck_assignment_relation_distinct",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    source_assignment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    target_assignment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    relation_type: Mapped[AssignmentRelationType] = mapped_column(
        SqlEnum(
            AssignmentRelationType,
            native_enum=False,
            create_constraint=True,
            name="assignment_relation_type",
        )
    )


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (CheckConstraint("estimated_hours >= 0", name="ck_task_estimated_hours"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    assignment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        SqlEnum(TaskStatus, native_enum=False, create_constraint=True, name="task_status"),
        default=TaskStatus.backlog,
    )
    priority: Mapped[Priority] = mapped_column(
        SqlEnum(Priority, native_enum=False, create_constraint=True, name="task_priority"),
        default=Priority.medium,
    )
    estimated_hours: Mapped[float] = mapped_column(Float, default=0)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    source_requirement: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resources: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (CheckConstraint("page_count >= 0", name="ck_document_page_count"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    assignment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[DocumentKind] = mapped_column(
        SqlEnum(DocumentKind, native_enum=False, create_constraint=True, name="document_kind")
    )
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)


class ScheduleEvent(TimestampMixin, Base):
    __tablename__ = "schedule_events"
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ck_schedule_event_range"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(240))
    kind: Mapped[ScheduleEventKind] = mapped_column(
        SqlEnum(
            ScheduleEventKind,
            native_enum=False,
            create_constraint=True,
            name="schedule_event_kind",
        )
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    location: Mapped[str | None] = mapped_column(String(240), nullable=True)
    task_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    series_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("schedule_series.id", ondelete="CASCADE"), nullable=True, index=True
    )


class ScheduleSeries(TimestampMixin, Base):
    """A repeating activity (a workout, a job) or a semester subject; its occurrences are
    materialised as schedule events so free time and workload treat them as busy."""

    __tablename__ = "schedule_series"
    __table_args__ = (
        CheckConstraint("ends_on >= starts_on", name="ck_schedule_series_range"),
        CheckConstraint("end_minute > start_minute", name="ck_schedule_series_time"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(240))
    kind: Mapped[ScheduleEventKind] = mapped_column(
        SqlEnum(
            ScheduleEventKind,
            native_enum=False,
            create_constraint=True,
            name="schedule_series_kind",
        )
    )
    weekdays: Mapped[list[int]] = mapped_column(JSON)
    start_minute: Mapped[int] = mapped_column(Integer)
    end_minute: Mapped[int] = mapped_column(Integer)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(String(240), nullable=True)


class Insight(TimestampMixin, Base):
    __tablename__ = "insights"
    __table_args__ = (
        CheckConstraint("confidence >= 0 AND confidence <= 100", name="ck_insight_confidence"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True
    )
    assignment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    category: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(240))
    summary: Mapped[str] = mapped_column(Text)
    suggestion: Mapped[str] = mapped_column(Text)
    confidence: Mapped[int] = mapped_column(Integer)
    severity: Mapped[InsightSeverity] = mapped_column(
        SqlEnum(InsightSeverity, native_enum=False, create_constraint=True, name="insight_severity")
    )
    status: Mapped[InsightStatus] = mapped_column(
        SqlEnum(InsightStatus, native_enum=False, create_constraint=True, name="insight_status"),
        default=InsightStatus.new,
        index=True,
    )
    cta: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    action_type: Mapped[InsightActionType] = mapped_column(
        SqlEnum(
            InsightActionType,
            native_enum=False,
            create_constraint=True,
            name="insight_action_type",
        ),
        default=InsightActionType.none,
    )
    action_payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Why the recommendation is made and what it is based on; "agent" insights must cite sources.
    reasoning: Mapped[str] = mapped_column(Text, default="", server_default="")
    evidence: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, server_default=text("'[]'")
    )
    generated_by: Mapped[str] = mapped_column(String(20), default="system", server_default="system")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100), index=True)
    resource_type: Mapped[str] = mapped_column(String(100), index=True)
    resource_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    outcome: Mapped[AuditOutcome] = mapped_column(
        SqlEnum(AuditOutcome, native_enum=False, create_constraint=True, name="audit_outcome"),
        default=AuditOutcome.success,
    )
    request_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    context_data: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )


class DocumentFragment(TimestampMixin, Base):
    """Indexed excerpt of a document; the unit a recommendation can cite as its source."""

    __tablename__ = "document_fragments"
    __table_args__ = (CheckConstraint("page >= 1", name="ck_document_fragment_page"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    assignment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    page: Mapped[int] = mapped_column(Integer, default=1)
    concept: Mapped[str] = mapped_column(String(160))
    text: Mapped[str] = mapped_column(Text)
    requirement_id: Mapped[str | None] = mapped_column(String(40), nullable=True)


class DocumentChunk(TimestampMixin, Base):
    """A passage of a document with its embedding; the unit semantic search retrieves."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "position", name="uq_document_chunk_position"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    page: Mapped[int] = mapped_column(Integer, default=1)
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(80), nullable=True)


class CampusEvent(TimestampMixin, Base):
    __tablename__ = "campus_events"
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ck_campus_event_range"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[CampusEventCategory] = mapped_column(
        SqlEnum(
            CampusEventCategory,
            native_enum=False,
            create_constraint=True,
            name="campus_event_category",
        )
    )
    place: Mapped[str] = mapped_column(String(240))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class CampusEventMatch(TimestampMixin, Base):
    """Per-student relevance of a campus event with the reason shown to the user."""

    __tablename__ = "campus_event_matches"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_campus_event_match_user"),
        CheckConstraint("match_percent >= 0 AND match_percent <= 100", name="ck_event_match"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("campus_events.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    match_percent: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    is_saved: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class AgentRun(TimestampMixin, Base):
    """One visible unit of agent work; its tool calls form the reasoning trace."""

    __tablename__ = "agent_runs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[AgentRunKind] = mapped_column(
        SqlEnum(AgentRunKind, native_enum=False, create_constraint=True, name="agent_run_kind")
    )
    title: Mapped[str] = mapped_column(String(240))
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[AgentRunStatus] = mapped_column(
        SqlEnum(AgentRunStatus, native_enum=False, create_constraint=True, name="agent_run_status"),
        default=AgentRunStatus.success,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentToolCall(TimestampMixin, Base):
    __tablename__ = "agent_tool_calls"
    __table_args__ = (
        UniqueConstraint("run_id", "position", name="uq_agent_tool_call_position"),
        CheckConstraint("position >= 0", name="ck_agent_tool_call_position"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    tool_name: Mapped[str] = mapped_column(String(120))
    arguments: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[AgentRunStatus] = mapped_column(
        SqlEnum(
            AgentRunStatus, native_enum=False, create_constraint=True, name="agent_tool_status"
        ),
        default=AgentRunStatus.success,
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ImportProposal(TimestampMixin, Base):
    """Items found in an external system, waiting for the student's explicit approval."""

    __tablename__ = "import_proposals"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(40))
    status: Mapped[ImportStatus] = mapped_column(
        SqlEnum(ImportStatus, native_enum=False, create_constraint=True, name="import_status"),
        default=ImportStatus.pending,
        index=True,
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ImportItem(TimestampMixin, Base):
    __tablename__ = "import_items"
    __table_args__ = (
        UniqueConstraint("proposal_id", "external_id", name="uq_import_item_external"),
        CheckConstraint("estimated_hours >= 0", name="ck_import_item_hours"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    proposal_id: Mapped[UUID] = mapped_column(
        ForeignKey("import_proposals.id", ondelete="CASCADE"), index=True
    )
    external_id: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    external_course_code: Mapped[str] = mapped_column(String(120))
    external_course_name: Mapped[str] = mapped_column(String(240))
    course_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    estimated_hours: Mapped[float] = mapped_column(Float, default=2.0)
    create_course: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    selected: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    attachment_names: Mapped[list[str]] = mapped_column(JSON, default=list)
    assignment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True
    )


class TaskPlan(TimestampMixin, Base):
    """A task breakdown the agent proposes for an assignment; nothing exists until approved."""

    __tablename__ = "task_plans"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    assignment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[PlanStatus] = mapped_column(
        SqlEnum(PlanStatus, native_enum=False, create_constraint=True, name="plan_status"),
        default=PlanStatus.pending,
        index=True,
    )
    summary: Mapped[str] = mapped_column(Text, default="")
    related_assignment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True
    )
    relation_type: Mapped[AssignmentRelationType | None] = mapped_column(
        SqlEnum(
            AssignmentRelationType,
            native_enum=False,
            create_constraint=True,
            name="task_plan_relation_type",
        ),
        nullable=True,
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskPlanItem(TimestampMixin, Base):
    __tablename__ = "task_plan_items"
    __table_args__ = (
        CheckConstraint("estimated_hours >= 0", name="ck_task_plan_item_hours"),
        CheckConstraint("page >= 1", name="ck_task_plan_item_page"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        ForeignKey("task_plans.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    requirement_id: Mapped[str] = mapped_column(String(16))
    requirement_text: Mapped[str] = mapped_column(Text)
    quote: Mapped[str] = mapped_column(Text)
    page: Mapped[int] = mapped_column(Integer, default=1)
    quote_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    estimated_hours: Mapped[float] = mapped_column(Float, default=1.0)
    priority: Mapped[Priority] = mapped_column(
        SqlEnum(Priority, native_enum=False, create_constraint=True, name="task_plan_priority"),
        default=Priority.medium,
    )
    selected: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    task_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    # Passages from the student's own materials that help with this task.
    resources: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)


class AgentAction(TimestampMixin, Base):
    """A change the agent proposes in chat; nothing happens until the student applies it."""

    __tablename__ = "agent_actions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[AgentActionKind] = mapped_column(
        SqlEnum(
            AgentActionKind, native_enum=False, create_constraint=True, name="agent_action_kind"
        )
    )
    title: Mapped[str] = mapped_column(String(240))
    summary: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    status: Mapped[PlanStatus] = mapped_column(
        SqlEnum(PlanStatus, native_enum=False, create_constraint=True, name="agent_action_status"),
        default=PlanStatus.pending,
        index=True,
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
