"""The real course catalog of the student body, created without any demo data."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models

# (code, name, instructor). The LMS course ids are listed for reference: 2492, 2488, 2255, 2138,
# 2189 and 2151 on lms.astanait.edu.kz.
COURSES: list[tuple[str, str, str]] = [
    ("CN", "Computer Networks", "Dossumbekov Yerlan"),
    ("PHIL", "Philosophy", "Kamarova Ruziya"),
    ("RMT", "Research Methods and Tools", "Nurgaliyev Kenzhegali"),
    ("PM", "Project Management", "Baltabayeva Kamila"),
    ("CV", "Computer Vision", "Kaiyrkhan Nurym"),
    ("CC", "Cloud Computing", "Bakiyeva Aigerim"),
]


def seed_catalog(session: Session, enroll_emails: list[str]) -> int:
    """Create the courses in the institution's latest semester and enroll the given accounts."""
    users = list(
        session.scalars(
            select(models.User).where(models.User.email.in_([e.lower() for e in enroll_emails]))
        )
    )
    institution_id = next((u.institution_id for u in users if u.institution_id), None)
    if institution_id is None:
        raise SystemExit("The kept accounts have no institution yet: finish onboarding first.")
    semester = session.scalars(
        select(models.Semester)
        .where(models.Semester.institution_id == institution_id)
        .order_by(models.Semester.starts_on.desc())
    ).first()
    if semester is None:
        raise SystemExit("The institution has no semester to create courses in.")
    created = 0
    for code, name, instructor in COURSES:
        course = session.scalar(
            select(models.Course).where(
                models.Course.semester_id == semester.id, models.Course.code == code
            )
        )
        if course is None:
            course = models.Course(
                semester_id=semester.id, code=code, name=name, instructor_name=instructor
            )
            session.add(course)
            session.flush()
            created += 1
        for user in users:
            if user.institution_id != institution_id:
                continue
            enrolled = session.scalar(
                select(models.Enrollment).where(
                    models.Enrollment.user_id == user.id, models.Enrollment.course_id == course.id
                )
            )
            if enrolled is None:
                session.add(models.Enrollment(user_id=user.id, course_id=course.id))
    session.commit()
    return created
