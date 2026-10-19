"""Normalized shapes returned to the agent.

Moodle's raw payloads are large and inconsistent between versions, so tools return these
compact models. Field names follow the CampusPulse backend (`due_at`, `starts_at`, UTC ISO).
"""

from datetime import datetime

from pydantic import BaseModel


class SiteInfo(BaseModel):
    site_name: str
    release: str
    user_id: int
    user_name: str


class MoodleCourse(BaseModel):
    id: int
    short_name: str
    full_name: str
    starts_at: datetime | None
    ends_at: datetime | None
    progress_percent: float | None
    completed: bool | None


class CourseFile(BaseModel):
    course_id: int
    section: str
    module: str
    module_type: str
    file_name: str
    file_url: str
    size_bytes: int
    mime_type: str | None
    modified_at: datetime | None


class CourseModule(BaseModel):
    id: int
    name: str
    module_type: str
    url: str | None


class CourseSection(BaseModel):
    id: int
    name: str
    modules: list[CourseModule]


class AssignmentAttachment(BaseModel):
    file_name: str
    file_url: str
    size_bytes: int
    mime_type: str | None


class MoodleAssignment(BaseModel):
    id: int
    course_id: int
    course_module_id: int
    name: str
    description: str
    due_at: datetime | None
    opens_at: datetime | None
    max_grade: float | None
    attachments: list[AssignmentAttachment]


class SubmissionStatus(BaseModel):
    assignment_id: int
    status: str
    graded: bool
    grade: str | None
    last_modified_at: datetime | None


class CalendarEvent(BaseModel):
    id: int
    title: str
    course_id: int | None
    course_name: str | None
    module_type: str | None
    event_type: str
    starts_at: datetime
    ends_at: datetime
    url: str | None
    actionable: bool


class FileContent(BaseModel):
    file_name: str
    mime_type: str | None
    size_bytes: int
    truncated: bool
    text: str | None
    note: str
