from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.agent.gateway import AgentReply, AgentStep
from app.main import app
from app.product.router import get_agent_gateway


def assignment_ids(client: TestClient) -> list[str]:
    return [a["id"] for a in client.get("/api/v1/assignments/overview").json()["items"]]


def item(client: TestClient, **overrides: Any) -> dict[str, Any]:
    first = assignment_ids(client)[0]
    body: dict[str, Any] = {
        "category": "workload_warning",
        "severity": "high",
        "title": "Thursday is overloaded",
        "summary": "5.5h of work is due on a day with 4h free.",
        "reasoning": "Two deadlines fall on Thursday while only one free window remains.",
        "suggestion": "Move 1.5h of study to Tuesday.",
        "confidence": 82,
        "sources": [
            {"kind": "assignment", "label": "Assignment due Thursday", "ref_id": first},
            {"kind": "workload", "label": "Week 43: 13.9h required vs 12h free"},
        ],
    }
    body.update(overrides)
    return body


def post(client: TestClient, *items: dict[str, Any]) -> Any:
    return client.post("/api/v1/agent/insights", json={"insights": list(items)})


def future_free_window(client: TestClient) -> tuple[datetime, datetime]:
    """A window the backend itself reports as free, in the future."""
    for offset in range(0, 21, 7):
        monday = (datetime.now(UTC) + timedelta(days=offset)).date()
        monday -= timedelta(days=monday.weekday())
        slots = client.get(
            "/api/v1/schedule/free-time", params={"week_start": monday.isoformat()}
        ).json()
        for slot in slots:
            start = datetime.fromisoformat(slot["starts_at"])
            if start > datetime.now(UTC) + timedelta(hours=1) and slot["duration_hours"] >= 1:
                return start, start + timedelta(hours=1)
    raise AssertionError("no future free window in the seeded week range")


def test_agent_insights_are_saved_with_reasoning_and_verified_sources(student: TestClient) -> None:
    created = post(student, item(student)).json()["created"][0]
    assert created["generated_by"] == "agent" and created["status"] == "new"
    assert created["reasoning"].startswith("Two deadlines")
    assert {e["kind"] for e in created["evidence"]} == {"assignment", "workload"}
    assert created["cta"]["action"] == "/workload" and created["assignment_id"]
    listed = student.get("/api/v1/insights").json()
    assert [i["id"] for i in listed] == [created["id"]]


def test_insights_without_a_verifiable_source_are_rejected(student: TestClient) -> None:
    ghost = {
        "kind": "assignment",
        "label": "Invented",
        "ref_id": "00000000-0000-0000-0000-00000000ffff",
    }
    result = post(student, item(student, sources=[ghost]), item(student, sources=[])).json()
    assert result["created"] == []
    assert [r["reason"] for r in result["rejected"]] == ["No verifiable source"] * 2


def test_foreign_citations_are_dropped_but_valid_ones_survive(student: TestClient) -> None:
    ghost = {"kind": "task", "label": "Not mine", "ref_id": "00000000-0000-0000-0000-00000000ffff"}
    base = item(student)
    base["sources"].append(ghost)
    created = post(student, base).json()["created"][0]
    assert all(e["label"] != "Not mine" for e in created["evidence"])


def test_a_study_session_that_fits_free_time_becomes_an_applicable_action(
    student: TestClient,
) -> None:
    start, end = future_free_window(student)
    session = {"title": "Study: JWT", "starts_at": start.isoformat(), "ends_at": end.isoformat()}
    created = post(
        student, item(student, category="schedule_opportunity", study_session=session)
    ).json()["created"][0]
    assert created["action_type"] == "create_study_session" and created["cta"]["action"] == "apply"
    applied = student.post(f"/api/v1/insights/{created['id']}/apply")
    assert applied.status_code == 200 and applied.json()["insight"]["status"] == "applied"


def test_a_session_outside_free_time_is_downgraded_to_advice(student: TestClient) -> None:
    start = datetime.now(UTC) + timedelta(days=2)
    session = {
        "title": "Study at 03:00",
        "starts_at": start.replace(hour=22, minute=0).isoformat(),
        "ends_at": start.replace(hour=23, minute=30).isoformat(),
    }
    created = post(student, item(student, study_session=session)).json()["created"][0]
    assert created["action_type"] == "none" and created["action_payload"] is None


def test_a_stale_suggestion_cannot_double_book_the_same_time(student: TestClient) -> None:
    start, end = future_free_window(student)
    session = {"title": "Study", "starts_at": start.isoformat(), "ends_at": end.isoformat()}
    first = post(student, item(student, study_session=session)).json()["created"][0]
    applied = student.post(f"/api/v1/insights/{first['id']}/apply")
    assert applied.status_code == 200, applied.text
    # Proposing the same window again is either downgraded to advice (the window is no longer
    # free) or, if the slot looks free to the validator, refused when applied.
    second = post(student, item(student, study_session=session)).json()["created"][0]
    if second["action_type"] == "none":
        return
    assert student.post(f"/api/v1/insights/{second['id']}/apply").status_code == 409


def test_a_new_batch_replaces_unanswered_agent_insights_but_keeps_answered_ones(
    student: TestClient,
) -> None:
    first = post(student, item(student, title="First")).json()["created"][0]
    kept = post(student, item(student, title="Keep me")).json()["created"][0]
    student.patch(f"/api/v1/insights/{kept['id']}", json={"status": "accepted"})
    post(student, item(student, title="Latest"))
    titles = {i["title"]: i["status"] for i in student.get("/api/v1/insights").json()}
    assert titles == {"Keep me": "accepted", "Latest": "new"} and "First" not in titles
    assert first["id"] != kept["id"]


def test_sloppy_fields_are_normalized(student: TestClient) -> None:
    created = post(
        student, item(student, severity="URGENT", confidence=250, title="T" * 400)
    ).json()["created"][0]
    assert created["severity"] == "medium" and created["confidence"] == 100
    assert len(created["title"]) == 240


class InsightGateway:
    def __init__(self, client: TestClient, *, propose: bool = True) -> None:
        self.client, self.propose = client, propose
        self.body = {"insights": [item(client)]}  # built here: the client is sync, chat() is async

    async def chat(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AgentReply:
        import asyncio

        assert "Now it is" in message and "list_insights" in message
        if self.propose:
            headers = {"Authorization": f"Bearer {agent_token}"}
            body = self.body
            response = await asyncio.to_thread(
                self.client.post, "/api/v1/agent/insights", json=body, headers=headers
            )
            assert response.status_code == 201
        return AgentReply("s1", "Done.", [AgentStep("tool_call", "propose_insights", "{}")])


def test_refresh_runs_the_agent_and_returns_its_insights(student: TestClient) -> None:
    app.dependency_overrides[get_agent_gateway] = lambda: InsightGateway(student)
    body = student.post("/api/v1/insights/refresh").json()
    assert len(body["created"]) == 1 and body["created"][0]["generated_by"] == "agent"
    assert [s["name"] for s in body["steps"]] == ["propose_insights"]


def test_refresh_reports_when_the_agent_proposes_nothing(student: TestClient) -> None:
    assert student.post("/api/v1/insights/refresh").status_code == 503
    app.dependency_overrides[get_agent_gateway] = lambda: InsightGateway(student, propose=False)
    assert student.post("/api/v1/insights/refresh").status_code == 502
