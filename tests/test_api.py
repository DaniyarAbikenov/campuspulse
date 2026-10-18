from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.google import GoogleClaims
from app.auth.router import get_google_verifier
from app.core.config import settings
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


def test_complete_academic_crud_flow(client: TestClient) -> None:
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


def test_strict_validation_rejects_coercion_and_extra_fields(client: TestClient) -> None:
    graph = create_core_graph(client)
    response = client.post(
        "/api/v1/assignments",
        json={
            "course_id": graph["course_id"],
            "title": "Invalid assignment",
            "due_at": "2026-10-23T23:59:00+05:00",
            "progress": "20",
            "unexpected": True,
        },
    )
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert {error["loc"][-1] for error in errors} == {"progress", "unexpected"}


def test_foreign_key_conflict_returns_409(client: TestClient) -> None:
    response = client.post(
        "/api/v1/courses",
        json={
            "semester_id": "00000000-0000-0000-0000-000000000000",
            "code": "SE 9999",
            "name": "Missing semester",
        },
    )
    assert response.status_code == 409


def test_invalid_schedule_range_returns_422(client: TestClient) -> None:
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


def test_assignment_cannot_relate_to_itself(client: TestClient) -> None:
    graph = create_core_graph(client)
    assignment = client.post(
        "/api/v1/assignments",
        json={
            "course_id": graph["course_id"],
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
    assert len(client.get("/api/v1/users").json()) == 1

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


def test_existing_external_email_requires_explicit_linking(client: TestClient) -> None:
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
