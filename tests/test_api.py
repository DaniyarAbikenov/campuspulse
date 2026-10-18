from collections.abc import Generator
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.google import GoogleClaims
from app.auth.router import get_current_user, get_google_verifier
from app.auth.service import AuthenticatedUser
from app.core.config import settings
from app.db import models
from app.db.models import Base
from app.db.session import get_session
from app.main import app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    monkeypatch.setattr(
        settings, "jwt_secret", SecretStr("test-secret-that-is-long-and-random-enough")
    )
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_session() -> Generator[Session, None, None]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def platform_client(client: TestClient) -> Generator[TestClient, None, None]:
    actor = models.User(
        id=uuid4(),
        institution_id=None,
        email="platform.admin@campuspulse.local",
        full_name="Platform Admin",
        is_active=True,
    )
    client.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        user=actor, roles=["platform_admin"]
    )
    yield client
    client.app.dependency_overrides.pop(get_current_user, None)


def create_core_graph(client: TestClient) -> dict[str, str]:
    institution = client.post(
        "/api/v1/institutions",
        json={
            "name": "Astana IT University",
            "short_name": "AITU",
            "timezone_name": "Asia/Almaty",
        },
    ).json()
    user = client.post(
        "/api/v1/users",
        json={
            "institution_id": institution["id"],
            "email": "student@example.com",
            "full_name": "Demo Student",
            "student_number": "SE-2429",
            "program": "Software Engineering",
        },
    ).json()
    semester = client.post(
        "/api/v1/semesters",
        json={
            "institution_id": institution["id"],
            "name": "Fall Semester 2026",
            "starts_on": "2026-09-01",
            "ends_on": "2026-12-20",
        },
    ).json()
    course = client.post(
        "/api/v1/courses",
        json={
            "semester_id": semester["id"],
            "code": "SE 3204",
            "name": "Software Engineering",
            "instructor_name": "Dr. A. Morgan",
            "color": "#4F46E5",
        },
    ).json()
    return {
        "institution_id": institution["id"],
        "user_id": user["id"],
        "semester_id": semester["id"],
        "course_id": course["id"],
    }


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_complete_academic_crud_flow(platform_client: TestClient) -> None:
    client = platform_client
    graph = create_core_graph(client)

    enrollment = client.post(
        "/api/v1/enrollments",
        json={"user_id": graph["user_id"], "course_id": graph["course_id"]},
    )
    assert enrollment.status_code == 201

    assignment = client.post(
        "/api/v1/assignments",
        json={
            "course_id": graph["course_id"],
            "owner_user_id": graph["user_id"],
            "title": "Assignment 3 — JWT Authentication",
            "description": "Add authentication and authorization.",
            "due_at": "2026-10-23T23:59:00+05:00",
            "status": "in_progress",
            "difficulty": "high",
            "estimated_hours": 8.5,
            "progress": 20,
        },
    )
    assert assignment.status_code == 201
    assignment_id = assignment.json()["id"]

    prerequisite = client.post(
        "/api/v1/assignments",
        json={
            "course_id": graph["course_id"],
            "owner_user_id": graph["user_id"],
            "title": "Assignment 2 — Domain Model",
            "due_at": "2026-10-09T23:59:00+05:00",
            "status": "completed",
            "difficulty": "high",
            "estimated_hours": 7.0,
            "actual_hours": 7.5,
            "progress": 100,
        },
    )
    assert prerequisite.status_code == 201

    relation = client.post(
        "/api/v1/assignment-relations",
        json={
            "source_assignment_id": assignment_id,
            "target_assignment_id": prerequisite.json()["id"],
            "relation_type": "extends",
        },
    )
    assert relation.status_code == 201

    task = client.post(
        "/api/v1/tasks",
        json={
            "assignment_id": assignment_id,
            "title": "Implement JWT token generation",
            "status": "todo",
            "priority": "high",
            "estimated_hours": 1.5,
        },
    )
    assert task.status_code == 201

    document = client.post(
        "/api/v1/documents",
        json={
            "course_id": graph["course_id"],
            "assignment_id": assignment_id,
            "name": "Assignment_3.pdf",
            "kind": "assignment",
            "page_count": 4,
        },
    )
    assert document.status_code == 201

    schedule_event = client.post(
        "/api/v1/schedule-events",
        json={
            "user_id": graph["user_id"],
            "course_id": graph["course_id"],
            "title": "Software Engineering",
            "kind": "class_session",
            "starts_at": "2026-10-19T11:00:00+05:00",
            "ends_at": "2026-10-19T12:50:00+05:00",
            "location": "B2.110",
        },
    )
    assert schedule_event.status_code == 201

    updated = client.patch(
        f"/api/v1/assignments/{assignment_id}",
        json={"progress": 60, "status": "in_progress"},
    )
    assert updated.status_code == 200
    assert updated.json()["progress"] == 60

    assignments = client.get("/api/v1/assignments")
    assert assignments.status_code == 200
    assert len(assignments.json()) == 2
    assert {item["title"] for item in assignments.json()} == {
        "Assignment 2 — Domain Model",
        "Assignment 3 — JWT Authentication",
    }

    relations = client.get("/api/v1/assignment-relations")
    assert relations.status_code == 200
    assert relations.json()[0]["relation_type"] == "extends"

    deleted = client.delete(f"/api/v1/tasks/{task.json()['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/tasks/{task.json()['id']}").status_code == 404


def test_strict_validation_rejects_coercion_and_extra_fields(
    platform_client: TestClient,
) -> None:
    client = platform_client
    graph = create_core_graph(client)
    response = client.post(
        "/api/v1/assignments",
        json={
            "course_id": graph["course_id"],
            "owner_user_id": graph["user_id"],
            "title": "Invalid assignment",
            "due_at": "2026-10-23T23:59:00+05:00",
            "progress": "20",
            "unexpected": True,
        },
    )
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert {error["loc"][-1] for error in errors} == {"progress", "unexpected"}


def test_foreign_key_conflict_returns_409(platform_client: TestClient) -> None:
    client = platform_client
    response = client.post(
        "/api/v1/courses",
        json={
            "semester_id": "00000000-0000-0000-0000-000000000000",
            "code": "SE 9999",
            "name": "Missing semester",
        },
    )
    assert response.status_code == 409


def test_invalid_schedule_range_returns_422(platform_client: TestClient) -> None:
    client = platform_client
    graph = create_core_graph(client)
    response = client.post(
        "/api/v1/schedule-events",
        json={
            "user_id": graph["user_id"],
            "title": "Invalid session",
            "kind": "study_session",
            "starts_at": "2026-10-19T15:00:00+05:00",
            "ends_at": "2026-10-19T14:00:00+05:00",
        },
    )
    assert response.status_code == 422


def test_assignment_cannot_relate_to_itself(platform_client: TestClient) -> None:
    client = platform_client
    graph = create_core_graph(client)
    assignment = client.post(
        "/api/v1/assignments",
        json={
            "course_id": graph["course_id"],
            "owner_user_id": graph["user_id"],
            "title": "Self relation test",
            "due_at": "2026-10-23T23:59:00+05:00",
        },
    ).json()
    response = client.post(
        "/api/v1/assignment-relations",
        json={
            "source_assignment_id": assignment["id"],
            "target_assignment_id": assignment["id"],
            "relation_type": "related_to",
        },
    )
    assert response.status_code == 422


class FakeGoogleVerifier:
    def __init__(self, claims: GoogleClaims) -> None:
        self.claims = claims

    def verify(self, _: str) -> GoogleClaims:
        return self.claims


def use_google_identity(client: TestClient, claims: GoogleClaims) -> None:
    client.app.dependency_overrides[get_google_verifier] = lambda: FakeGoogleVerifier(claims)


def test_google_login_refresh_me_and_logout(client: TestClient) -> None:
    use_google_identity(
        client,
        GoogleClaims(
            subject="google-user-123",
            email="new.student@gmail.com",
            email_verified=True,
            full_name="New Student",
        ),
    )
    login = client.post(
        "/api/v1/auth/google",
        json={"credential": "fake-google-credential-token"},
    )
    assert login.status_code == 200
    tokens = login.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] == 900

    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "new.student@gmail.com"
    assert me.json()["roles"] == ["student"]

    second_login = client.post(
        "/api/v1/auth/google",
        json={"credential": "fake-google-credential-token"},
    )
    assert second_login.status_code == 200
    second_tokens = second_login.json()
    users = client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {second_tokens['access_token']}"},
    )
    assert users.status_code == 200
    assert len(users.json()) == 1

    refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refresh.status_code == 200
    rotated_tokens = refresh.json()
    assert rotated_tokens["refresh_token"] != tokens["refresh_token"]
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
        ).status_code
        == 401
    )

    logout = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": rotated_tokens["refresh_token"]},
    )
    assert logout.status_code == 204
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": rotated_tokens["refresh_token"]},
        ).status_code
        == 401
    )


def test_google_login_requires_configuration(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/google",
        json={"credential": "fake-google-credential-token"},
    )
    assert response.status_code == 503


def test_existing_external_email_requires_explicit_linking(
    platform_client: TestClient,
) -> None:
    client = platform_client
    graph = create_core_graph(client)
    existing_user = client.get(f"/api/v1/users/{graph['user_id']}").json()
    use_google_identity(
        client,
        GoogleClaims(
            subject="external-google-user",
            email=existing_user["email"],
            email_verified=True,
            full_name=existing_user["full_name"],
        ),
    )
    response = client.post(
        "/api/v1/auth/google",
        json={"credential": "fake-google-credential-token"},
    )
    assert response.status_code == 409


def test_academic_routes_require_authentication(client: TestClient) -> None:
    response = client.get("/api/v1/assignments")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_academic_admin_is_limited_to_own_institution(platform_client: TestClient) -> None:
    client = platform_client
    own_institution = client.post(
        "/api/v1/institutions",
        json={"name": "Own University", "short_name": "OWN", "timezone_name": "UTC"},
    ).json()
    other_institution = client.post(
        "/api/v1/institutions",
        json={"name": "Other University", "short_name": "OTHER", "timezone_name": "UTC"},
    ).json()

    admin = models.User(
        id=uuid4(),
        institution_id=UUID(own_institution["id"]),
        email="academic.admin@example.com",
        full_name="Academic Admin",
        is_active=True,
    )
    client.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        user=admin, roles=["academic_admin"]
    )

    own_semester = client.post(
        "/api/v1/semesters",
        json={
            "institution_id": own_institution["id"],
            "name": "Fall 2026",
            "starts_on": "2026-09-01",
            "ends_on": "2026-12-20",
        },
    )
    assert own_semester.status_code == 201
    outside_semester = client.post(
        "/api/v1/semesters",
        json={
            "institution_id": other_institution["id"],
            "name": "Fall 2026",
            "starts_on": "2026-09-01",
            "ends_on": "2026-12-20",
        },
    )
    assert outside_semester.status_code == 403

    semesters = client.get("/api/v1/semesters")
    assert semesters.status_code == 200
    assert [item["id"] for item in semesters.json()] == [own_semester.json()["id"]]


def test_onboarding_and_student_data_isolation(
    platform_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    client = platform_client
    monkeypatch.setattr(settings, "upload_directory", str(tmp_path))
    institution = client.post(
        "/api/v1/institutions",
        json={
            "name": "Astana IT University",
            "short_name": "AITU",
            "timezone_name": "Asia/Almaty",
        },
    ).json()
    semester = client.post(
        "/api/v1/semesters",
        json={
            "institution_id": institution["id"],
            "name": "Fall Semester 2026",
            "starts_on": "2026-09-01",
            "ends_on": "2026-12-20",
        },
    ).json()
    course = client.post(
        "/api/v1/courses",
        json={
            "semester_id": semester["id"],
            "code": "SE 3204",
            "name": "Software Engineering",
        },
    ).json()
    client.app.dependency_overrides.pop(get_current_user, None)

    first_tokens = _login_google_user(
        client,
        subject="student-one",
        email="student.one@gmail.com",
        full_name="Student One",
    )
    second_tokens = _login_google_user(
        client,
        subject="student-two",
        email="student.two@gmail.com",
        full_name="Student Two",
    )
    first_headers = {"Authorization": f"Bearer {first_tokens['access_token']}"}
    second_headers = {"Authorization": f"Bearer {second_tokens['access_token']}"}

    for headers, student_number in (
        (first_headers, "SE-0001"),
        (second_headers, "SE-0002"),
    ):
        onboarding = client.post(
            "/api/v1/auth/onboarding",
            headers=headers,
            json={
                "institution_id": institution["id"],
                "student_number": student_number,
                "program": "Software Engineering",
                "course_ids": [course["id"]],
            },
        )
        assert onboarding.status_code == 200

    settings_response = client.patch(
        "/api/v1/settings",
        headers=first_headers,
        json={
            "group_name": "SE-2429",
            "max_study_hours_per_day": 4.0,
            "earliest_start": "08:00:00",
            "latest_end": "20:00:00",
            "proactive_insights": True,
        },
    )
    assert settings_response.status_code == 200
    assert settings_response.json()["group_name"] == "SE-2429"

    course_overview = client.get(
        "/api/v1/courses/overview?q=software&has_open_assignments=false",
        headers=first_headers,
    )
    assert course_overview.status_code == 200
    assert course_overview.json()[0]["code"] == "SE 3204"

    assignment = client.post(
        "/api/v1/assignments",
        headers=first_headers,
        json={
            "course_id": course["id"],
            "title": "Private assignment",
            "due_at": "2026-10-23T23:59:00+05:00",
        },
    )
    assert assignment.status_code == 201
    assignment_id = assignment.json()["id"]
    assert assignment.json()["owner_user_id"] == first_tokens["user_id"]

    assignment_overview = client.get(
        "/api/v1/assignments/overview?assignment_status=upcoming",
        headers=first_headers,
    )
    assert assignment_overview.status_code == 200
    assert assignment_overview.json()["total"] == 1
    assert assignment_overview.json()["status_counts"]["upcoming"] == 1
    assert assignment_overview.json()["items"][0]["course_code"] == "SE 3204"
    assert assignment_overview.json()["items"][0]["remaining_hours"] == 0.0

    task = client.post(
        "/api/v1/tasks",
        headers=first_headers,
        json={
            "assignment_id": assignment_id,
            "title": "Implement endpoint",
            "priority": "high",
            "estimated_hours": 1.5,
        },
    )
    assert task.status_code == 201
    board = client.get("/api/v1/kanban", headers=first_headers)
    assert board.status_code == 200
    assert board.json()["total_tasks"] == 1
    moved = client.patch(
        f"/api/v1/kanban/tasks/{task.json()['id']}/move",
        headers=first_headers,
        json={"status": "in_progress"},
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "in_progress"

    uploaded = client.post(
        "/api/v1/assignments/upload",
        headers=first_headers,
        data={
            "course_id": course["id"],
            "title": "Uploaded assignment",
            "due_at": "2026-10-25T18:00:00+05:00",
            "estimated_hours": "2.5",
        },
        files={"file": ("brief.pdf", b"%PDF-1.4 demo", "application/pdf")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["document"]["name"] == "brief.pdf"
    uploaded_assignment_id = uploaded.json()["assignment"]["id"]

    schedule = client.get("/api/v1/schedule?week_start=2026-10-19", headers=first_headers)
    assert schedule.status_code == 200
    assert schedule.json()["free_time"]
    assert (
        client.get(
            "/api/v1/schedule/free-time?week_start=2026-10-19", headers=first_headers
        ).status_code
        == 200
    )
    assert (
        client.get("/api/v1/workload?week_start=2026-10-19", headers=first_headers).status_code
        == 200
    )
    assert client.get("/api/v1/statistics", headers=first_headers).status_code == 200

    platform_actor = models.User(
        id=uuid4(),
        email="insight.admin@campuspulse.local",
        full_name="Insight Admin",
        is_active=True,
    )
    client.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        user=platform_actor, roles=["platform_admin"]
    )
    insight = client.post(
        "/api/v1/insights",
        json={
            "user_id": first_tokens["user_id"],
            "course_id": course["id"],
            "assignment_id": assignment_id,
            "category": "schedule_opportunity",
            "title": "Free study slot",
            "summary": "A free slot is available.",
            "suggestion": "Plan a study session.",
            "confidence": 90,
            "severity": "low",
            "cta": {"label": "Plan session", "action": "apply", "style": "primary"},
            "action_type": "create_study_session",
            "action_payload": {
                "course_id": course["id"],
                "title": "Focused study",
                "starts_at": "2026-10-20T13:00:00+05:00",
                "ends_at": "2026-10-20T14:00:00+05:00",
            },
        },
    )
    assert insight.status_code == 201
    client.app.dependency_overrides.pop(get_current_user, None)
    applied = client.post(f"/api/v1/insights/{insight.json()['id']}/apply", headers=first_headers)
    assert applied.status_code == 200
    assert applied.json()["insight"]["status"] == "applied"
    assert applied.json()["created_resource_type"] == "schedule_event"

    second_assignment = client.post(
        "/api/v1/assignments",
        headers=second_headers,
        json={
            "course_id": course["id"],
            "title": "Second student's assignment",
            "due_at": "2026-10-24T23:59:00+05:00",
        },
    ).json()
    private_document = client.post(
        "/api/v1/documents",
        headers=second_headers,
        json={
            "course_id": course["id"],
            "assignment_id": second_assignment["id"],
            "name": "private-notes.pdf",
            "kind": "assignment",
        },
    )
    assert private_document.status_code == 201

    first_assignments = client.get("/api/v1/assignments", headers=first_headers).json()
    assert {item["id"] for item in first_assignments} == {
        assignment_id,
        uploaded_assignment_id,
    }
    assert (
        client.get(f"/api/v1/assignments/{assignment_id}", headers=second_headers).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/assignments/{assignment_id}",
            headers=second_headers,
            json={"progress": 50},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/assignments/{assignment_id}",
            headers=first_headers,
            json={"progress": 50},
        ).status_code
        == 200
    )
    first_documents = client.get("/api/v1/documents", headers=first_headers).json()
    assert [item["name"] for item in first_documents] == ["brief.pdf"]
    assert (
        client.post(
            "/api/v1/assignment-relations",
            headers=first_headers,
            json={
                "source_assignment_id": assignment_id,
                "target_assignment_id": second_assignment["id"],
                "relation_type": "related_to",
            },
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/institutions",
            headers=first_headers,
            json={
                "name": "Unauthorized University",
                "short_name": "UU",
                "timezone_name": "UTC",
            },
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/auth/onboarding",
            headers=first_headers,
            json={
                "institution_id": institution["id"],
                "student_number": "SE-0001",
                "program": "Software Engineering",
                "course_ids": [],
            },
        ).status_code
        == 409
    )


def _login_google_user(
    client: TestClient,
    *,
    subject: str,
    email: str,
    full_name: str,
) -> dict[str, str]:
    use_google_identity(
        client,
        GoogleClaims(
            subject=subject,
            email=email,
            email_verified=True,
            full_name=full_name,
        ),
    )
    response = client.post(
        "/api/v1/auth/google",
        json={"credential": "fake-google-credential-token"},
    )
    assert response.status_code == 200
    tokens: dict[str, str] = response.json()
    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert me.status_code == 200
    tokens["user_id"] = me.json()["id"]
    return tokens
