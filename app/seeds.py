from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
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
                email="demo.student@campuspulse.local",
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
                provider_email="demo.student@campuspulse.local",
            ),
            models.UserRole(id=seed_id(120), user_id=student_id, role_id=role_ids["student"]),
        ],
    )

    courses = [
        models.Course(
            id=course_ids["SE 3204"],
            semester_id=semester_id,
            code="SE 3204",
            name="Software Engineering",
            instructor_name="Dr. Amelia Morgan",
            color="#4F46E5",
        ),
        models.Course(
            id=course_ids["CS 3302"],
            semester_id=semester_id,
            code="CS 3302",
            name="Database Systems",
            instructor_name="Prof. Daniel Kim",
            color="#0891B2",
        ),
        models.Course(
            id=course_ids["CS 3401"],
            semester_id=semester_id,
            code="CS 3401",
            name="Computer Networks",
            instructor_name="Dr. Sara Ahmed",
            color="#7C3AED",
        ),
        models.Course(
            id=course_ids["MATH 3102"],
            semester_id=semester_id,
            code="MATH 3102",
            name="Probability and Statistics",
            instructor_name="Prof. Victor Lee",
            color="#EA580C",
        ),
        models.Course(
            id=course_ids["HUM 2105"],
            semester_id=semester_id,
            code="HUM 2105",
            name="Academic Writing",
            instructor_name="Dr. Emily Carter",
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
            title="Assignment 1 — Requirements Analysis",
            due_at=datetime.fromisoformat("2026-09-25T23:59:00+05:00"),
            status=models.AssignmentStatus.completed,
            difficulty=models.Difficulty.medium,
            estimated_hours=5.0,
            actual_hours=5.5,
            progress=100,
        ),
        models.Assignment(
            id=assignment_ids[2],
            course_id=course_ids["SE 3204"],
            owner_user_id=student_id,
            title="Assignment 2 — Domain Model",
            due_at=datetime.fromisoformat("2026-10-09T23:59:00+05:00"),
            status=models.AssignmentStatus.completed,
            difficulty=models.Difficulty.high,
            estimated_hours=7.0,
            actual_hours=7.5,
            progress=100,
        ),
        models.Assignment(
            id=assignment_ids[3],
            course_id=course_ids["SE 3204"],
            owner_user_id=student_id,
            title="Assignment 3 — JWT Authentication",
            description="Implement authentication and role-ready identity mapping.",
            due_at=datetime.fromisoformat("2026-10-23T23:59:00+05:00"),
            status=models.AssignmentStatus.in_progress,
            difficulty=models.Difficulty.high,
            estimated_hours=8.5,
            progress=35,
        ),
        models.Assignment(
            id=assignment_ids[4],
            course_id=course_ids["CS 3302"],
            owner_user_id=student_id,
            title="Query Optimization Lab",
            due_at=datetime.fromisoformat("2026-10-21T18:00:00+05:00"),
            status=models.AssignmentStatus.todo,
            difficulty=models.Difficulty.high,
            estimated_hours=6.0,
            progress=0,
        ),
        models.Assignment(
            id=assignment_ids[5],
            course_id=course_ids["CS 3401"],
            owner_user_id=student_id,
            title="Routing Protocol Simulation",
            due_at=datetime.fromisoformat("2026-10-28T23:59:00+05:00"),
            status=models.AssignmentStatus.upcoming,
            difficulty=models.Difficulty.high,
            estimated_hours=9.0,
            progress=0,
        ),
        models.Assignment(
            id=assignment_ids[6],
            course_id=course_ids["MATH 3102"],
            owner_user_id=student_id,
            title="Problem Set 5 — Random Variables",
            due_at=datetime.fromisoformat("2026-10-20T20:00:00+05:00"),
            status=models.AssignmentStatus.todo,
            difficulty=models.Difficulty.medium,
            estimated_hours=4.0,
            progress=10,
        ),
        models.Assignment(
            id=assignment_ids[7],
            course_id=course_ids["HUM 2105"],
            owner_user_id=student_id,
            title="Literature Review Draft",
            due_at=datetime.fromisoformat("2026-10-26T17:00:00+05:00"),
            status=models.AssignmentStatus.in_progress,
            difficulty=models.Difficulty.medium,
            estimated_hours=5.0,
            progress=45,
        ),
        models.Assignment(
            id=assignment_ids[8],
            course_id=course_ids["CS 3302"],
            owner_user_id=student_id,
            title="Normalization Exercises",
            due_at=datetime.fromisoformat("2026-11-02T18:00:00+05:00"),
            status=models.AssignmentStatus.upcoming,
            difficulty=models.Difficulty.low,
            estimated_hours=3.0,
            progress=0,
        ),
        models.Assignment(
            id=assignment_ids[9],
            course_id=course_ids["SE 3204"],
            owner_user_id=student_id,
            title="Assignment 4 — API Integration",
            due_at=datetime.fromisoformat("2026-11-06T23:59:00+05:00"),
            status=models.AssignmentStatus.upcoming,
            difficulty=models.Difficulty.high,
            estimated_hours=10.0,
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
            assignment_id=assignment_ids[3],
            title="Implement JWT token generation",
            status=models.TaskStatus.in_progress,
            priority=models.Priority.high,
            estimated_hours=1.5,
            due_at=datetime.fromisoformat("2026-10-20T18:00:00+05:00"),
        ),
        models.Task(
            id=seed_id(502),
            assignment_id=assignment_ids[3],
            title="Add authentication dependency",
            status=models.TaskStatus.todo,
            priority=models.Priority.high,
            estimated_hours=2.0,
        ),
        models.Task(
            id=seed_id(503),
            assignment_id=assignment_ids[4],
            title="Compare query execution plans",
            status=models.TaskStatus.backlog,
            priority=models.Priority.medium,
            estimated_hours=2.5,
        ),
        models.Task(
            id=seed_id(504),
            assignment_id=assignment_ids[7],
            title="Revise source synthesis",
            status=models.TaskStatus.review,
            priority=models.Priority.medium,
            estimated_hours=1.0,
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
