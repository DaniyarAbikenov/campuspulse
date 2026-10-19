import sys
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
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


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value)


def knowledge_fragments(
    course_ids: dict[str, UUID], assignment_ids: dict[int, UUID]
) -> list[models.Base]:
    brief = [
        (
            "R1",
            2,
            "Implement JWT-based authentication.",
            "Issue signed access tokens on successful login.",
        ),
        (
            "R2",
            2,
            "Secure selected REST endpoints.",
            "All /api/orders and /api/users endpoints must require a valid token.",
        ),
        (
            "R3",
            2,
            "Add role-based authorization.",
            "Support at least STUDENT and ADMIN roles. Only ADMIN may delete users.",
        ),
        (
            "R4",
            3,
            "Implement token expiration handling.",
            "Access tokens expire after 15 minutes; provide a refresh endpoint.",
        ),
        (
            "R5",
            3,
            "Update existing user services.",
            "Store BCrypt-hashed passwords in the existing User entity.",
        ),
        (
            "R6",
            4,
            "Document authentication workflow.",
            "Add a README section with a sequence diagram of login and refresh.",
        ),
    ]
    fragments: list[models.Base] = [
        models.DocumentFragment(
            id=seed_id(910 + index),
            document_id=seed_id(601),
            assignment_id=assignment_ids[3],
            page=page,
            concept=concept,
            text=text,
            requirement_id=requirement,
        )
        for index, (requirement, page, concept, text) in enumerate(brief)
    ]
    lecture = [
        (4, "OAuth2", "Authorization framework delegating access with scoped tokens."),
        (11, "Tokens", "Access and refresh token lifetimes and rotation."),
        (19, "CORS", "Browser cross-origin rules and allowed-origin configuration."),
    ]
    fragments.extend(
        models.DocumentFragment(
            id=seed_id(930 + index),
            document_id=seed_id(602),
            page=page,
            concept=concept,
            text=text,
        )
        for index, (page, concept, text) in enumerate(lecture)
    )
    return fragments


def campus_events(institution_id: UUID, student_id: UUID) -> list[models.Base]:
    rows = [
        (
            "AI Society Meetup: LLM Agents",
            models.CampusEventCategory.tech,
            "Main Hall C1",
            "2026-10-22T16:00:00+05:00",
            "2026-10-22T18:00:00+05:00",
            94,
            "Matches your SE coursework and fits Thursday after OS Lab.",
        ),
        (
            "Career Fair — Software Roles",
            models.CampusEventCategory.career,
            "Expo Center",
            "2026-10-23T13:00:00+05:00",
            "2026-10-23T17:00:00+05:00",
            82,
            "Falls inside your Friday free slot.",
        ),
        (
            "Hackathon Info Session",
            models.CampusEventCategory.tech,
            "Room B2.204",
            "2026-10-19T13:15:00+05:00",
            "2026-10-19T14:00:00+05:00",
            76,
            "Short session during your Monday free block.",
        ),
        (
            "Database Systems Guest Lecture",
            models.CampusEventCategory.academic,
            "C1.204",
            "2026-10-28T15:00:00+05:00",
            "2026-10-28T16:30:00+05:00",
            88,
            "Directly supports your Advanced Databases midterm.",
        ),
        (
            "Campus Volleyball Night",
            models.CampusEventCategory.sports,
            "Sports Complex",
            "2026-10-24T18:00:00+05:00",
            "2026-10-24T20:00:00+05:00",
            61,
            "Your Saturday has no academic workload.",
        ),
        (
            "Academic Writing Workshop",
            models.CampusEventCategory.academic,
            "Library L2",
            "2026-10-20T17:00:00+05:00",
            "2026-10-20T18:30:00+05:00",
            79,
            "Helpful for the Research Methods report due Oct 26.",
        ),
    ]
    entities: list[models.Base] = []
    for index, (title, category, place, starts, ends, percent, reason) in enumerate(rows):
        entities.append(
            models.CampusEvent(
                id=seed_id(940 + index),
                institution_id=institution_id,
                title=title,
                category=category,
                place=place,
                starts_at=_at(starts),
                ends_at=_at(ends),
            )
        )
        entities.append(
            models.CampusEventMatch(
                id=seed_id(950 + index),
                event_id=seed_id(940 + index),
                user_id=student_id,
                match_percent=percent,
                reason=reason,
            )
        )
    return entities


def agent_history(student_id: UUID) -> list[models.Base]:
    runs: list[
        tuple[
            models.AgentRunKind,
            str,
            str,
            models.AgentRunStatus,
            str,
            list[tuple[str, dict[str, object], str]],
        ]
    ] = [
        (
            models.AgentRunKind.insight,
            "New recommendation created",
            "Workload warning for Oct 22–24",
            models.AgentRunStatus.success,
            "2026-10-19T09:46:00+05:00",
            [
                ("get_workload", {"week_start": "2026-10-19"}, "21.5h required vs 12h available"),
                ("create_insight", {"category": "workload_warning"}, "Insight created"),
            ],
        ),
        (
            models.AgentRunKind.forecast,
            "Workload forecast updated",
            "Week 43 total: 21.5h required vs 12h available",
            models.AgentRunStatus.warning,
            "2026-10-19T09:45:00+05:00",
            [("get_workload", {"week_start": "2026-10-19"}, "Overload on Wed and Thu")],
        ),
        (
            models.AgentRunKind.dependency,
            "Assignment dependency detected",
            "SE Assignment 3 extends Assignment 2",
            models.AgentRunStatus.success,
            "2026-10-19T09:44:00+05:00",
            [("search_documents", {"query": "Assignment 2"}, "Matched Assignment_2.pdf")],
        ),
        (
            models.AgentRunKind.analysis,
            "Assignment 3 analyzed",
            "Assignment_3_Brief.pdf · 4 pages · 6 requirements",
            models.AgentRunStatus.success,
            "2026-10-19T09:42:00+05:00",
            [("read_document", {"document": "Assignment_3_Brief.pdf"}, "6 requirements extracted")],
        ),
        (
            models.AgentRunKind.indexed,
            "Lecture 7 indexed",
            "Software Engineering · Lecture_07_Authentication.pdf",
            models.AgentRunStatus.success,
            "2026-10-19T08:15:00+05:00",
            [
                (
                    "read_document",
                    {"document": "Lecture_07_Authentication.pdf"},
                    "3 concepts indexed",
                )
            ],
        ),
        (
            models.AgentRunKind.schedule,
            "Timetable synchronized",
            "Week 43 · 11 sessions",
            models.AgentRunStatus.success,
            "2026-10-19T07:30:00+05:00",
            [("sync_timetable", {"week": 43}, "11 sessions imported")],
        ),
    ]
    entities: list[models.Base] = []
    for index, (kind, title, detail, run_status, started, calls) in enumerate(runs):
        started_at = _at(started)
        entities.append(
            models.AgentRun(
                id=seed_id(960 + index),
                user_id=student_id,
                kind=kind,
                title=title,
                detail=detail,
                status=run_status,
                started_at=started_at,
                finished_at=started_at,
            )
        )
        entities.extend(
            models.AgentToolCall(
                id=seed_id(980 + index * 5 + position),
                run_id=seed_id(960 + index),
                position=position,
                tool_name=name,
                arguments=arguments,
                result_summary=summary,
                status=models.AgentRunStatus.success,
            )
            for position, (name, arguments, summary) in enumerate(calls)
        )
    return entities


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

    merge_all(session, knowledge_fragments(course_ids, assignment_ids))
    merge_all(session, campus_events(institution_id, student_id))
    merge_all(session, agent_history(student_id))

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


COHORT_SIZE = 14


def seed_demo_cohort(session: Session) -> int:
    """Add anonymous demo students so faculty aggregates have a cohort above the privacy minimum.

    Not part of the default seed: run ``python -m app.seeds --cohort`` for demos.
    """
    institution_id = seed_id(1)
    role_id = seed_id(100)
    course_ids = [seed_id(200 + index) for index in range(5)]
    people: list[models.Base] = []
    enrolments: list[models.Base] = []
    work: list[models.Base] = []
    for index in range(COHORT_SIZE):
        user_id = seed_id(5_000 + index)
        people.append(
            models.User(
                id=user_id,
                institution_id=institution_id,
                email=f"cohort.{index + 1:02d}@campuspulse.example",
                full_name=f"Demo cohort student {index + 1:02d}",
                student_number=f"DEMO{index + 1:04d}",
                program="Software Engineering",
            )
        )
        people.append(models.UserRole(id=seed_id(5_200 + index), user_id=user_id, role_id=role_id))
        people.append(models.UserSettings(user_id=user_id, max_study_hours_per_day=2.5 + index % 3))
        for position, course_id in enumerate(course_ids):
            if (index + position) % 4 == 3:
                continue  # not everyone takes every course
            enrolments.append(
                models.Enrollment(
                    id=seed_id(5_400 + index * 10 + position), user_id=user_id, course_id=course_id
                )
            )
            estimate = 3 + (index * 7 + position * 3) % 6
            for offset, (week_shift, finished) in enumerate(((-3, True), (-1, True), (0, False))):
                due = datetime.fromisoformat("2026-10-21T18:00:00+05:00") + timedelta(
                    weeks=week_shift
                )
                work.append(
                    models.Assignment(
                        id=seed_id(6_000 + index * 100 + position * 10 + offset),
                        course_id=course_id,
                        owner_user_id=user_id,
                        title=f"Demo cohort work {position + 1}.{offset + 1}",
                        due_at=due,
                        # Some students carry a heavier current week, so risk is not uniform.
                        estimated_hours=float(
                            estimate + (5 if not finished and index % 3 == 0 else 0)
                        ),
                        actual_hours=float(estimate + (index + offset) % 3 - 1)
                        if finished
                        else None,
                        progress=100 if finished else 20,
                        status=(
                            models.AssignmentStatus.completed
                            if finished
                            else models.AssignmentStatus.in_progress
                        ),
                    )
                )
    # Users first: the rows reference each other through plain foreign keys, so flush in stages.
    for group in (people, enrolments, work):
        merge_all(session, group)
    session.commit()
    return COHORT_SIZE


def main() -> None:
    if "--cohort" in sys.argv[1:]:
        with SessionLocal() as session:
            print(f"Demo cohort ready: {seed_demo_cohort(session)} anonymous students.")
        return
    with SessionLocal() as session:
        summary = seed_database(session)
    print(
        "Seed complete: "
        f"{summary.roles} roles, {summary.users} user, {summary.courses} courses, "
        f"{summary.assignments} assignments, {summary.tasks} tasks."
    )


if __name__ == "__main__":
    main()
