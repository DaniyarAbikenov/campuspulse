from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.models import Base
from app.db.session import get_session
from app.main import app
from app.seeds import seed_database


@pytest.fixture
def student(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    monkeypatch.setattr(
        settings, "jwt_secret", SecretStr("test-secret-that-is-long-and-random-enough")
    )
    monkeypatch.setattr(settings, "enable_demo_auth", True)
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    with factory() as session:
        seed_database(session)

    def override_session() -> Generator[Session, None, None]:
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as client:
        token = client.post("/api/v1/auth/demo").json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"
        yield client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_knowledge_base_lists_documents_with_concepts_and_fragments(student: TestClient) -> None:
    body = student.get("/api/v1/knowledge").json()
    assert body["document_count"] == len(body["documents"]) == 2
    assert body["page_count"] == sum(item["page_count"] for item in body["documents"])
    brief = next(item for item in body["documents"] if item["name"] == "Assignment_3_Brief.pdf")
    assert "Implement JWT-based authentication." in brief["concepts"]
    requirements = {
        item["requirement_id"] for item in body["fragments"] if item["document_id"] == brief["id"]
    }
    assert requirements == {"R1", "R2", "R3", "R4", "R5", "R6"}

    filtered = student.get(
        "/api/v1/knowledge", params={"course_id": "00000000-0000-0000-0000-000000000000"}
    ).json()
    assert filtered["documents"] == [] and filtered["fragments"] == []


def test_campus_events_carry_match_and_can_be_saved_idempotently(student: TestClient) -> None:
    events = student.get("/api/v1/campus-events").json()
    assert len(events) == 6
    assert [item["starts_at"] for item in events] == sorted(item["starts_at"] for item in events)
    assert all(item["match_percent"] is not None and item["reason"] for item in events)
    assert not any(item["is_saved"] for item in events)

    target = events[0]["id"]
    for _ in range(2):
        saved = student.patch(f"/api/v1/campus-events/{target}/save", json={"saved": True})
        assert saved.status_code == 200 and saved.json()["is_saved"] is True
    assert sum(item["is_saved"] for item in student.get("/api/v1/campus-events").json()) == 1
    unsaved = student.patch(f"/api/v1/campus-events/{target}/save", json={"saved": False})
    assert unsaved.json()["is_saved"] is False


def test_saving_unknown_event_returns_404(student: TestClient) -> None:
    missing = "00000000-0000-0000-0000-0000000000ff"
    assert (
        student.patch(f"/api/v1/campus-events/{missing}/save", json={"saved": True}).status_code
        == 404
    )


def test_agent_activity_returns_newest_first_with_tool_calls(student: TestClient) -> None:
    body = student.get("/api/v1/agent/activity", params={"limit": 3}).json()
    assert body["total"] == 6 and len(body["runs"]) == 3
    starts = [item["started_at"] for item in body["runs"]]
    assert starts == sorted(starts, reverse=True)
    assert body["runs"][0]["tool_calls"][0]["tool_name"] == "get_workload"
    assert body["tool_call_count"] == sum(len(item["tool_calls"]) for item in body["runs"])


def test_recorded_agent_run_is_persisted_with_ordered_tool_calls(student: TestClient) -> None:
    created = student.post(
        "/api/v1/agent/runs",
        json={
            "kind": "chat",
            "title": "Answered a deadline question",
            "tool_calls": [
                {"tool_name": "list_deadlines", "arguments": {"days": 7}, "duration_ms": 40},
                {"tool_name": "get_workload", "result_summary": "21.5h required"},
            ],
        },
    )
    assert created.status_code == 201
    assert [call["position"] for call in created.json()["tool_calls"]] == [0, 1]
    activity = student.get("/api/v1/agent/activity", params={"limit": 10}).json()
    assert activity["total"] == 7
    assert created.json()["id"] in {item["id"] for item in activity["runs"]}
    assert (
        student.post("/api/v1/agent/runs", json={"kind": "bogus", "title": "x"}).status_code == 422
    )


def test_new_endpoints_require_authentication(student: TestClient) -> None:
    student.headers.pop("Authorization")
    for path in ("/knowledge", "/campus-events", "/agent/activity"):
        assert student.get(f"/api/v1{path}").status_code == 401
