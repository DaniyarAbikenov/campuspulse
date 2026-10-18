from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models
from app.db.session import SessionLocal


def seed_id(value: int) -> UUID:
    return UUID(int=value)


@dataclass(frozen=True)
class SeedSummary:
    roles: int
    users: int
    courses: int
    assignments: int
    tasks: int


def merge_all(session: Session, entities: Iterable[models.Base]) -> None:
    for entity in entities:
        session.merge(entity)
    session.flush()


def seed_database(session: Session) -> SeedSummary:
    institution_id = seed_id(1)
    student_id = seed_id(10)
    semester_id = seed_id(20)

    role_ids = {
        "student": seed_id(100),
        "academic_admin": seed_id(101),
        "platform_admin": seed_id(102),
    }
    course_ids = {
        "SE 3204": seed_id(200),
        "CS 3302": seed_id(201),
        "CS 3401": seed_id(202),
        "MATH 3102": seed_id(203),
        "HUM 2105": seed_id(204),
    }
    assignment_ids = {index: seed_id(300 + index) for index in range(1, 10)}

    merge_all(
        session,
        [
            models.Institution(
                id=institution_id,
                name="Astana IT University",
                short_name="AITU",
                timezone_name="Asia/Almaty",
            ),
            models.Role(
                id=role_ids["student"],
                code="student",
                name="Student",
                description="Manages an individual academic workspace.",
            ),
            models.Role(
                id=role_ids["academic_admin"],
                code="academic_admin",
                name="Academic administrator",
                description="Manages academic data for an institution.",
            ),
            models.Role(
                id=role_ids["platform_admin"],
                code="platform_admin",
                name="Platform administrator",
                description="Operates the CampusPulse platform.",
            ),
        ],
    )

    merge_all(
        session,
        [
            models.User(
                id=student_id,
                institution_id=institution_id,
                email="demo.student@campuspulse.example",
                full_name="Alex Morgan",
                student_number="SE-2429",
                program="Software Engineering",
                is_active=True,
            ),
            models.Semester(
                id=semester_id,
                institution_id=institution_id,
                name="Fall Semester 2026",
                starts_on=date(2026, 9, 1),
                ends_on=date(2026, 12, 20),
            ),
        ],
    )

    merge_all(
        session,
        [
            models.IdentityAccount(
                id=seed_id(110),
                user_id=student_id,
                provider="demo",
                subject="demo-student",
                provider_email="demo.student@campuspulse.example",
            ),
            models.UserRole(id=seed_id(120), user_id=student_id, role_id=role_ids["student"]),
            models.UserSettings(
                user_id=student_id,
                interface_language="en",
                group_name="SE-2429",
                max_study_hours_per_day=4.0,
                earliest_start=time(8, 0),
                latest_end=time(20, 0),
                proactive_insights=True,
                automatic_task_generation=True,
                share_anonymized_completion_times=True,
                deadline_reminders=True,
                daily_briefing=True,
                event_suggestions=True,
            ),
        ],
    )

    courses = [
        models.Course(
            id=course_ids["SE 3204"],
            semester_id=semester_id,
            code="SE 3204",
            name="Software Engineering",
            instructor_name="Dr. A. Morgan",
            color="#4F46E5",
        ),
        models.Course(
            id=course_ids["CS 3302"],
            semester_id=semester_id,
            code="CS 3112",
            name="Advanced Databases",
            instructor_name="Prof. L. Kessler",
            color="#0891B2",
        ),
        models.Course(
            id=course_ids["CS 3401"],
            semester_id=semester_id,
            code="CS 2207",
            name="Operating Systems",
            instructor_name="Dr. R. Iskakov",
            color="#7C3AED",
        ),
        models.Course(
            id=course_ids["MATH 3102"],
            semester_id=semester_id,
            code="MATH 2301",
            name="Statistics",
            instructor_name="Prof. D. Hale",
            color="#EA580C",
        ),
        models.Course(
            id=course_ids["HUM 2105"],
            semester_id=semester_id,
            code="RM 2010",
            name="Research Methods",
            instructor_name="Dr. S. Nurlanova",
            color="#16A34A",
        ),
    ]
    merge_all(session, courses)
    merge_all(
        session,
        [
            models.Enrollment(id=seed_id(250 + index), user_id=student_id, course_id=course.id)
            for index, course in enumerate(courses)
        ],
    )

    assignments = [
        models.Assignment(
            id=assignment_ids[1],
            course_id=course_ids["SE 3204"],
            owner_user_id=student_id,
            title="Assignment 1 — REST API Basics",
            due_at=datetime.fromisoformat("2026-09-18T23:59:00+05:00"),
            status=models.AssignmentStatus.completed,
            difficulty=models.Difficulty.medium,
            estimated_hours=6.0,
            actual_hours=6.5,
            progress=100,
        ),
        models.Assignment(
            id=assignment_ids[2],
            course_id=course_ids["SE 3204"],
            owner_user_id=student_id,
            title="Assignment 2 — Database Integration",
            due_at=datetime.fromisoformat("2026-10-02T23:59:00+05:00"),
            status=models.AssignmentStatus.completed,
            difficulty=models.Difficulty.high,
            estimated_hours=7.0,
            actual_hours=8.0,
            progress=100,
        ),
        models.Assignment(
            id=assignment_ids[3],
            course_id=course_ids["SE 3204"],
            owner_user_id=student_id,
            title="Assignment 3 — Authentication",
            description="Implement authentication and role-ready identity mapping.",
            due_at=datetime.fromisoformat("2026-10-23T23:59:00+05:00"),
            status=models.AssignmentStatus.in_progress,
            difficulty=models.Difficulty.high,
            estimated_hours=8.5,
            progress=20,
        ),
        models.Assignment(
            id=assignment_ids[4],
            course_id=course_ids["CS 3302"],
            owner_user_id=student_id,
            title="Assignment 4 — Aggregation",
            due_at=datetime.fromisoformat("2026-10-22T23:59:00+05:00"),
            status=models.AssignmentStatus.todo,
            difficulty=models.Difficulty.high,
            estimated_hours=5.5,
            progress=0,
        ),
        models.Assignment(
            id=assignment_ids[5],
            course_id=course_ids["CS 3401"],
            owner_user_id=student_id,
            title="Lab 5 — Process Scheduling",
            due_at=datetime.fromisoformat("2026-10-24T23:59:00+05:00"),
            status=models.AssignmentStatus.in_progress,
            difficulty=models.Difficulty.high,
            estimated_hours=4.0,
            progress=60,
        ),
        models.Assignment(
            id=assignment_ids[6],
            course_id=course_ids["HUM 2105"],
            owner_user_id=student_id,
            title="Research Methods Report",
            due_at=datetime.fromisoformat("2026-10-26T23:59:00+05:00"),
            status=models.AssignmentStatus.todo,
            difficulty=models.Difficulty.medium,
            estimated_hours=3.5,
            progress=0,
        ),
        models.Assignment(
            id=assignment_ids[7],
            course_id=course_ids["MATH 3102"],
            owner_user_id=student_id,
            title="Problem Set 2 — Regression",
            due_at=datetime.fromisoformat("2026-10-29T23:59:00+05:00"),
            status=models.AssignmentStatus.upcoming,
            difficulty=models.Difficulty.medium,
            estimated_hours=2.0,
            progress=0,
        ),
        models.Assignment(
            id=assignment_ids[8],
            course_id=course_ids["CS 3302"],
            owner_user_id=student_id,
            title="Assignment 3 — Indexing",
            due_at=datetime.fromisoformat("2026-10-08T23:59:00+05:00"),
            status=models.AssignmentStatus.completed,
            difficulty=models.Difficulty.low,
            estimated_hours=5.0,
            actual_hours=4.5,
            progress=100,
        ),
        models.Assignment(
            id=assignment_ids[9],
            course_id=course_ids["SE 3204"],
            owner_user_id=student_id,
            title="Assignment 4 — Testing",
            due_at=datetime.fromisoformat("2026-11-06T23:59:00+05:00"),
            status=models.AssignmentStatus.upcoming,
            difficulty=models.Difficulty.high,
            estimated_hours=6.0,
            progress=0,
        ),
    ]
    merge_all(session, assignments)

    merge_all(
        session,
        [
            models.AssignmentRelation(
                id=seed_id(401),
                source_assignment_id=assignment_ids[2],
                target_assignment_id=assignment_ids[1],
                relation_type=models.AssignmentRelationType.extends,
            ),
            models.AssignmentRelation(
                id=seed_id(402),
                source_assignment_id=assignment_ids[3],
                target_assignment_id=assignment_ids[2],
                relation_type=models.AssignmentRelationType.extends,
            ),
            models.AssignmentRelation(
                id=seed_id(403),
                source_assignment_id=assignment_ids[9],
                target_assignment_id=assignment_ids[3],
                relation_type=models.AssignmentRelationType.depends_on,
            ),
        ],
    )

    tasks = [
        models.Task(
            id=seed_id(501),
            assignment_id=assignment_ids[4],
            title="Write $group pipeline for sales report",
            description="Aggregate orders by region and month.",
            status=models.TaskStatus.todo,
            priority=models.Priority.high,
            estimated_hours=2.0,
            due_at=datetime.fromisoformat("2026-10-21T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(502),
            assignment_id=assignment_ids[4],
            title="Read chapter 7: Aggregation framework",
            status=models.TaskStatus.todo,
            priority=models.Priority.medium,
            estimated_hours=1.5,
            due_at=datetime.fromisoformat("2026-10-20T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(503),
            assignment_id=assignment_ids[5],
            title="Implement round-robin scheduler",
            status=models.TaskStatus.in_progress,
            priority=models.Priority.high,
            estimated_hours=1.5,
            due_at=datetime.fromisoformat("2026-10-22T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(504),
            assignment_id=assignment_ids[5],
            title="Benchmark FCFS vs SJF",
            status=models.TaskStatus.review,
            priority=models.Priority.medium,
            estimated_hours=1.0,
            due_at=datetime.fromisoformat("2026-10-23T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(505),
            assignment_id=assignment_ids[6],
            title="Collect 8 peer-reviewed sources",
            status=models.TaskStatus.backlog,
            priority=models.Priority.low,
            estimated_hours=1.5,
            due_at=datetime.fromisoformat("2026-10-24T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(506),
            assignment_id=assignment_ids[6],
            title="Draft report outline",
            status=models.TaskStatus.backlog,
            priority=models.Priority.low,
            estimated_hours=1.0,
            due_at=datetime.fromisoformat("2026-10-25T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(507),
            assignment_id=assignment_ids[7],
            title="Regression exercise 1–4",
            status=models.TaskStatus.backlog,
            priority=models.Priority.low,
            estimated_hours=1.0,
            due_at=datetime.fromisoformat("2026-10-27T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(508),
            assignment_id=assignment_ids[5],
            title="Fork process skeleton from Lab 4",
            status=models.TaskStatus.completed,
            priority=models.Priority.low,
            estimated_hours=0.5,
            due_at=datetime.fromisoformat("2026-10-17T18:00:00+05:00"),
        ),
    ]
    merge_all(session, tasks)

    merge_all(
        session,
        [
            models.Document(
                id=seed_id(601),
                course_id=course_ids["SE 3204"],
                assignment_id=assignment_ids[3],
                name="Assignment_3_Brief.pdf",
                kind=models.DocumentKind.assignment,
                page_count=4,
                storage_key="demo/se-3204/assignment-3-brief.pdf",
            ),
            models.Document(
                id=seed_id(602),
                course_id=course_ids["SE 3204"],
                name="Lecture_07_Authentication.pdf",
                kind=models.DocumentKind.lecture,
                page_count=32,
                storage_key="demo/se-3204/lecture-07.pdf",
            ),
        ],
    )

    merge_all(
        session,
        [
            models.ScheduleEvent(
                id=seed_id(701),
                user_id=student_id,
                course_id=course_ids["SE 3204"],
                title="Software Engineering",
                kind=models.ScheduleEventKind.class_session,
                starts_at=datetime.fromisoformat("2026-10-19T11:00:00+05:00"),
                ends_at=datetime.fromisoformat("2026-10-19T12:50:00+05:00"),
                location="B2.110",
            ),
            models.ScheduleEvent(
                id=seed_id(702),
                user_id=student_id,
                course_id=course_ids["CS 3302"],
                title="Database Systems",
                kind=models.ScheduleEventKind.class_session,
                starts_at=datetime.fromisoformat("2026-10-19T14:00:00+05:00"),
                ends_at=datetime.fromisoformat("2026-10-19T15:50:00+05:00"),
                location="C1.204",
            ),
            models.ScheduleEvent(
                id=seed_id(703),
                user_id=student_id,
                course_id=course_ids["SE 3204"],
                title="JWT implementation focus block",
                kind=models.ScheduleEventKind.study_session,
                starts_at=datetime.fromisoformat("2026-10-19T17:00:00+05:00"),
                ends_at=datetime.fromisoformat("2026-10-19T18:30:00+05:00"),
            ),
        ],
    )

    merge_all(
        session,
        [
            models.Insight(
                id=seed_id(801),
                user_id=student_id,
                course_id=course_ids["SE 3204"],
                assignment_id=assignment_ids[3],
                category="workload_warning",
                title="Heavy academic workload detected",
                summary="Three major deadlines fall within the same week.",
                suggestion="Move 1.5 hours of authentication work to Monday.",
                confidence=87,
                severity=models.InsightSeverity.high,
                status=models.InsightStatus.new,
                cta={"label": "Apply plan", "action": "apply", "style": "primary"},
                action_type=models.InsightActionType.create_study_session,
                action_payload={
                    "course_id": str(course_ids["SE 3204"]),
                    "title": "JWT token generation",
                    "starts_at": "2026-10-19T13:00:00+05:00",
                    "ends_at": "2026-10-19T14:30:00+05:00",
                },
            ),
            models.Insight(
                id=seed_id(802),
                user_id=student_id,
                course_id=course_ids["SE 3204"],
                assignment_id=assignment_ids[3],
                category="assignment_analysis",
                title="Assignment 3 is ready for planning",
                summary="The proposed task breakdown is ready to import.",
                suggestion="Review and import the generated tasks.",
                confidence=92,
                severity=models.InsightSeverity.medium,
                status=models.InsightStatus.new,
                cta={"label": "Apply to Kanban", "action": "apply", "style": "primary"},
                action_type=models.InsightActionType.import_tasks,
                action_payload={
                    "assignment_id": str(assignment_ids[3]),
                    "tasks": [
                        {
                            "title": "Configure security middleware",
                            "priority": "high",
                            "estimated_hours": 2.0,
                        },
                        {
                            "title": "Test and document authentication",
                            "priority": "medium",
                            "estimated_hours": 2.0,
                        },
                    ],
                },
            ),
            models.Insight(
                id=seed_id(803),
                user_id=student_id,
                course_id=course_ids["CS 3302"],
                category="study_preparation",
                title="Midterm preparation recommended",
                summary="A focused revision plan would reduce the next-week workload.",
                suggestion="Schedule three 90-minute revision sessions.",
                confidence=81,
                severity=models.InsightSeverity.medium,
                status=models.InsightStatus.new,
                cta={"label": "View study plan", "action": "open_plan", "style": "primary"},
                action_type=models.InsightActionType.none,
            ),
            models.Insight(
                id=seed_id(804),
                user_id=student_id,
                course_id=course_ids["SE 3204"],
                assignment_id=assignment_ids[3],
                category="schedule_opportunity",
                title="Free study slot on Monday",
                summary="An uninterrupted block is available before the deadline.",
                suggestion="Use the slot for JWT token generation.",
                confidence=90,
                severity=models.InsightSeverity.low,
                status=models.InsightStatus.new,
                cta={"label": "Plan session", "action": "apply", "style": "primary"},
                action_type=models.InsightActionType.create_study_session,
                action_payload={
                    "course_id": str(course_ids["SE 3204"]),
                    "title": "JWT token generation",
                    "starts_at": "2026-10-19T13:00:00+05:00",
                    "ends_at": "2026-10-19T14:30:00+05:00",
                },
            ),
        ],
    )

    session.commit()
    return SeedSummary(
        roles=3, users=1, courses=len(courses), assignments=len(assignments), tasks=len(tasks)
    )


def main() -> None:
    with SessionLocal() as session:
        summary = seed_database(session)
    print(
        "Seed complete: "
        f"{summary.roles} roles, {summary.users} user, {summary.courses} courses, "
        f"{summary.assignments} assignments, {summary.tasks} tasks."
    )


if __name__ == "__main__":
    main()
