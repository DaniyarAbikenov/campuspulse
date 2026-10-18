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
