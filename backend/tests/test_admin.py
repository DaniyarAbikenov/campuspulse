import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import get_session
from app.main import app
from app.roles import set_role
from app.seeds import seed_demo_cohort

STUDENT_EMAIL = "demo.student@campuspulse.example"


def session_of(client: TestClient):  # noqa: ANN201
    return next(app.dependency_overrides[get_session]())


@pytest.fixture
def admin(student: TestClient) -> TestClient:
    """The seeded user, promoted to academic administrator of their institution."""
    set_role(session_of(student), STUDENT_EMAIL, "academic_admin", grant=True)
    return student


@pytest.fixture
def with_cohort(admin: TestClient) -> TestClient:
    seed_demo_cohort(session_of(admin))
    return admin


def test_students_cannot_open_the_admin_overview(student: TestClient) -> None:
    assert student.get("/api/v1/admin/overview").status_code == 403


def test_a_tiny_cohort_reveals_nothing(admin: TestClient) -> None:
    body = admin.get("/api/v1/admin/overview").json()
    assert body["min_cohort_size"] == settings.admin_min_cohort_size == 5
    assert body["totals"]["students"] is None and body["totals"]["enrolments"] is None
    assert body["courses"] and all(c["suppressed"] for c in body["courses"])
    for course in body["courses"]:
        assert course["enrolled_students"] is None
        assert course["median_estimate_hours"] is None and course["overload_risk_percent"] is None
    assert all(w["estimated_hours_per_student"] is None for w in body["weekly"])
    assert body["peak_week"] is None and body["highest_risk_course"] is None
    assert all(item["count"] is None for item in body["activity"])


def test_a_real_cohort_produces_aggregates(with_cohort: TestClient) -> None:
    body = with_cohort.get("/api/v1/admin/overview").json()
    assert body["institution_name"] and body["semester_name"]
    assert body["totals"]["students"] == 15 and body["totals"]["courses"] == 5
    visible = [c for c in body["courses"] if not c["suppressed"]]
    assert len(visible) == 5
    for course in visible:
        assert course["enrolled_students"] >= 5
        assert course["median_estimate_hours"] > 0
        assert course["median_reported_hours"] > 0
        assert 0 <= course["estimate_accuracy_percent"] <= 100
        assert 0 <= course["overload_risk_percent"] <= 100
    assert len(body["weekly"]) == 8
    assert body["peak_week"] and body["peak_hours_per_student"] > 0
    assert body["highest_risk_course"] in {c["name"] for c in body["courses"]}


def test_no_personal_data_is_ever_returned(with_cohort: TestClient) -> None:
    text = json.dumps(with_cohort.get("/api/v1/admin/overview").json())
    for forbidden in (
        "@",
        "Demo cohort student",
        "DEMO0",
        "Alex Morgan",
        "email",
        "full_name",
        "user_id",
        "student_number",
    ):
        assert forbidden not in text, forbidden


def test_raising_the_minimum_cohort_size_withholds_more(
    with_cohort: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "admin_min_cohort_size", 30)
    body = with_cohort.get("/api/v1/admin/overview").json()
    assert all(c["suppressed"] for c in body["courses"]) and body["totals"]["students"] is None
    assert all(w["estimated_hours_per_student"] is None for w in body["weekly"])


def test_roles_are_granted_and_revoked_idempotently(student: TestClient) -> None:
    session = session_of(student)
    assert "Granted" in set_role(session, STUDENT_EMAIL, "academic_admin", grant=True)
    assert "already has" in set_role(session, STUDENT_EMAIL, "academic_admin", grant=True)
    assert student.get("/api/v1/auth/me").json()["roles"].count("academic_admin") == 1
    assert "Revoked" in set_role(session, STUDENT_EMAIL, "academic_admin", grant=False)
    assert student.get("/api/v1/admin/overview").status_code == 403
    with pytest.raises(SystemExit):
        set_role(session, STUDENT_EMAIL, "root", grant=True)
    with pytest.raises(SystemExit):
        set_role(session, "nobody@example.com", "student", grant=True)


def test_an_administrators_personal_views_contain_only_their_own_records(
    with_cohort: TestClient,
) -> None:
    mine = with_cohort.get("/api/v1/assignments/overview").json()
    assert mine["total"] == 9 and all(
        not item["title"].startswith("Demo cohort") for item in mine["items"]
    )
    board = with_cohort.get("/api/v1/kanban").json()
    assert board["total_tasks"] == 8
    courses = with_cohort.get("/api/v1/courses/overview").json()
    assert sum(c["assignment_count"] for c in courses) == 9
