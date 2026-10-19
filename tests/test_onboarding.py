from fastapi.testclient import TestClient

from app.db import models
from app.db.session import get_session
from app.main import app
from app.seeds import seed_id


def leave_institution(client: TestClient) -> None:
    """Make the seeded student look like a brand-new Google user."""
    session = next(app.dependency_overrides[get_session]())
    session.get(models.User, seed_id(10)).institution_id = None  # type: ignore[union-attr]
    session.query(models.Enrollment).delete()
    session.commit()


def test_options_are_closed_to_students_who_already_joined(student: TestClient) -> None:
    assert student.get("/api/v1/auth/onboarding/options").status_code == 409


def test_new_user_picks_an_institution_and_courses_then_options_close(
    student: TestClient,
) -> None:
    leave_institution(student)
    options = student.get("/api/v1/auth/onboarding/options").json()
    institution = options["institutions"][0]
    assert institution["short_name"] == "AITU" and len(institution["courses"]) == 5
    assert {"code", "name", "id"} <= set(institution["courses"][0])

    joined = student.post(
        "/api/v1/auth/onboarding",
        json={
            "institution_id": institution["id"],
            "student_number": "240028",
            "program": "Software Engineering",
            "course_ids": [institution["courses"][0]["id"]],
        },
    )
    assert joined.status_code == 200 and joined.json()["institution_id"] == institution["id"]
    assert len(student.get("/api/v1/courses/overview").json()) == 1
    assert student.get("/api/v1/auth/onboarding/options").status_code == 409


def test_options_require_authentication(student: TestClient) -> None:
    student.headers.pop("Authorization")
    assert student.get("/api/v1/auth/onboarding/options").status_code == 401
