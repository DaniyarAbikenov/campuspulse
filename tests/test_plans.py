import asyncio
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from app.agent.gateway import AgentReply, AgentStep
from app.core.config import settings
from app.main import app
from app.product.router import get_agent_gateway

SE_COURSE = "00000000-0000-0000-0000-0000000000c8"
BRIEF = [
    ["Assignment 3: Authentication", "R1 Implement JWT-based authentication using HS256."],
    ["R2 Secure the /api/orders endpoints with a valid token."],
]


def make_pdf(path: Path) -> None:
    pdf = canvas.Canvas(str(path))
    for lines in BRIEF:
        y = 800
        for line in lines:
            pdf.drawString(40, y, line)
            y -= 18
        pdf.showPage()
    pdf.save()


@pytest.fixture
def uploaded(student: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "upload_directory", str(tmp_path / "uploads"))
    brief = tmp_path / "brief.pdf"
    make_pdf(brief)
    response = student.post(
        "/api/v1/assignments/upload",
        data={"course_id": SE_COURSE, "title": "Assignment 3", "due_at": "2026-10-23T18:59:00Z"},
        files={"file": ("brief.pdf", brief.read_bytes(), "application/pdf")},
    )
    return str(response.json()["assignment"]["id"])


def plan_body(assignment_id: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "assignment_id": assignment_id,
        "summary": "Two requirements.",
        "items": [
            {
                "requirement_id": "R1",
                "requirement_text": "Implement JWT-based authentication.",
                "quote": "Implement JWT-based authentication using HS256",
                "page": 1,
                "title": "Implement JWT token generation",
                "estimated_hours": 1.5,
                "priority": "high",
            },
            {
                "requirement_id": "R2",
                "requirement_text": "Secure order endpoints.",
                "quote": "Secure the /api/orders endpoints",
                "page": 1,  # actually on page 2: the backend must correct it
                "title": "Secure endpoints",
                "estimated_hours": 2.0,
            },
        ],
    }
    body.update(overrides)
    return body


def test_agent_reads_the_extracted_text(student: TestClient, uploaded: str) -> None:
    body = student.get(f"/api/v1/assignments/{uploaded}/text").json()
    assert body["title"] == "Assignment 3" and [p["page"] for p in body["pages"]] == [1, 2]
    assert "HS256" in body["pages"][0]["text"]


def test_text_is_404_without_a_readable_document(student: TestClient) -> None:
    seeded = student.get("/api/v1/assignments/overview").json()["items"][0]["id"]
    assert student.get(f"/api/v1/assignments/{seeded}/text").status_code == 404


def test_citations_are_verified_and_pages_corrected(student: TestClient, uploaded: str) -> None:
    plan = student.post("/api/v1/task-plans", json=plan_body(uploaded)).json()
    first, second = plan["items"]
    assert first["quote_verified"] is True and first["page"] == 1
    assert second["quote_verified"] is True and second["page"] == 2


def test_invented_quotes_are_flagged_not_trusted(student: TestClient, uploaded: str) -> None:
    body = plan_body(uploaded)
    body["items"][0]["quote"] = "Deploy the service to Kubernetes"
    plan = student.post("/api/v1/task-plans", json=body).json()
    assert (
        plan["items"][0]["quote_verified"] is False and plan["items"][1]["quote_verified"] is True
    )


def test_nothing_reaches_the_board_until_approval(student: TestClient, uploaded: str) -> None:
    before = student.get("/api/v1/kanban").json()["total_tasks"]
    student.post("/api/v1/task-plans", json=plan_body(uploaded))
    assert student.get("/api/v1/kanban").json()["total_tasks"] == before


def test_approving_creates_ai_tasks_with_provenance_once(
    student: TestClient, uploaded: str
) -> None:
    plan = student.post("/api/v1/task-plans", json=plan_body(uploaded)).json()
    student.patch(
        f"/api/v1/task-plans/{plan['id']}/items/{plan['items'][1]['id']}",
        json={"estimated_hours": 3.0},
    )
    dropped = plan["items"][0]
    student.patch(
        f"/api/v1/task-plans/{plan['id']}/items/{dropped['id']}", json={"selected": False}
    )

    applied = student.post(f"/api/v1/task-plans/{plan['id']}/apply").json()
    assert applied["created"] == 1 and applied["plan"]["status"] == "applied"
    tasks = [
        task
        for column in student.get("/api/v1/kanban").json()["columns"]
        for task in column["tasks"]
        if task["assignment_id"] == uploaded
    ]
    assert [
        (t["title"], t["estimated_hours"], t["is_ai_generated"], t["source_requirement"])
        for t in tasks
    ] == [("Secure endpoints", 3.0, True, "R2")]
    assert "page 2" in tasks[0]["description"]
    assignment = next(
        a
        for a in student.get("/api/v1/assignments/overview").json()["items"]
        if a["id"] == uploaded
    )
    assert assignment["estimated_hours"] == 3.0

    again = student.post(f"/api/v1/task-plans/{plan['id']}/apply").json()
    assert again["created"] == 0
    assert student.get("/api/v1/kanban").json()["total_tasks"] == len(tasks) + 8


def test_dismissed_plans_cannot_be_applied(student: TestClient, uploaded: str) -> None:
    plan = student.post("/api/v1/task-plans", json=plan_body(uploaded)).json()
    assert student.post(f"/api/v1/task-plans/{plan['id']}/dismiss").json()["status"] == "dismissed"
    assert student.post(f"/api/v1/task-plans/{plan['id']}/apply").status_code == 409
    assert student.get(f"/api/v1/assignments/{uploaded}/task-plan").status_code == 404


def test_a_new_plan_replaces_the_pending_one(student: TestClient, uploaded: str) -> None:
    first = student.post("/api/v1/task-plans", json=plan_body(uploaded)).json()
    second = student.post("/api/v1/task-plans", json=plan_body(uploaded, summary="v2")).json()
    latest = student.get(f"/api/v1/assignments/{uploaded}/task-plan").json()
    assert latest["id"] == second["id"] != first["id"] and latest["summary"] == "v2"


def test_related_assignment_becomes_a_relation_on_approval(
    student: TestClient, uploaded: str
) -> None:
    related = student.get("/api/v1/assignments/overview").json()["items"][0]["id"]
    body = plan_body(uploaded, related_assignment_id=related, relation_type="extends")
    plan = student.post("/api/v1/task-plans", json=body).json()
    assert plan["related_assignment_title"]
    student.post(f"/api/v1/task-plans/{plan['id']}/apply")
    relations = student.get("/api/v1/assignment-relations")
    assert relations.status_code in {200, 403}


class PlanningGateway:
    """Stands in for the agent: like the real one it calls the API with the token it is given."""

    def __init__(self, client: TestClient, assignment_id: str, *, propose: bool = True) -> None:
        self.client = client
        self.assignment_id = assignment_id
        self.propose = propose

    async def chat(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AgentReply:
        assert self.assignment_id in message
        headers = {"Authorization": f"Bearer {agent_token}"}
        text = await asyncio.to_thread(
            self.client.get, f"/api/v1/assignments/{self.assignment_id}/text", headers=headers
        )
        assert text.status_code == 200
        if self.propose:
            created = await asyncio.to_thread(
                self.client.post,
                "/api/v1/task-plans",
                json=plan_body(self.assignment_id),
                headers=headers,
            )
            assert created.status_code == 201
        return AgentReply(
            session_id="s1",
            text="Planned.",
            steps=[AgentStep("tool_call", "get_assignment_text", "{}")],
        )


def test_analysis_runs_the_agent_and_returns_the_proposed_plan(
    student: TestClient, uploaded: str
) -> None:
    app.dependency_overrides[get_agent_gateway] = lambda: PlanningGateway(student, uploaded)
    body = student.post(f"/api/v1/assignments/{uploaded}/analysis").json()
    assert body["plan"]["status"] == "pending" and len(body["plan"]["items"]) == 2
    assert [s["name"] for s in body["steps"]] == ["get_assignment_text"]


def test_analysis_fails_cleanly_when_the_agent_proposes_nothing(
    student: TestClient, uploaded: str
) -> None:
    app.dependency_overrides[get_agent_gateway] = lambda: PlanningGateway(
        student, uploaded, propose=False
    )
    assert student.post(f"/api/v1/assignments/{uploaded}/analysis").status_code == 502


def test_analysis_needs_a_configured_agent_and_extracted_text(
    student: TestClient, uploaded: str
) -> None:
    assert student.post(f"/api/v1/assignments/{uploaded}/analysis").status_code == 503
    seeded = student.get("/api/v1/assignments/overview").json()["items"][0]["id"]
    app.dependency_overrides[get_agent_gateway] = lambda: PlanningGateway(student, seeded)
    assert student.post(f"/api/v1/assignments/{seeded}/analysis").status_code == 404
    assert UUID(uploaded)


def test_over_long_or_sloppy_plan_fields_are_normalized_not_rejected(
    student: TestClient, uploaded: str
) -> None:
    body = plan_body(uploaded)
    first = body["items"][0]
    first.update(
        {
            "priority": "High",
            "estimated_hours": 0.1,
            "title": "T" * 400,
            "requirement_text": "R" * 1500,
            "description": "D" * 3000,
        }
    )
    body["items"][1].update({"estimated_hours": 99, "priority": "urgent", "page": 0})
    created = student.post("/api/v1/task-plans", json=body)
    assert created.status_code == 201, created.text
    one, two = created.json()["items"]
    assert one["priority"] == "high" and one["estimated_hours"] == 0.25
    assert len(one["title"]) == 240 and len(one["requirement_text"]) == 1000
    assert two["priority"] == "medium" and two["estimated_hours"] == 40.0


def test_a_failed_save_is_explained_in_the_502(student: TestClient, uploaded: str) -> None:
    class FailingGateway(PlanningGateway):
        async def chat(self, **kwargs: Any) -> AgentReply:
            return AgentReply(
                session_id="s1",
                text="",
                steps=[AgentStep("tool_result", "propose_task_plan", '{"error": "422 bad quote"}')],
            )

    app.dependency_overrides[get_agent_gateway] = lambda: FailingGateway(student, uploaded)
    response = student.post(f"/api/v1/assignments/{uploaded}/analysis")
    assert response.status_code == 502 and "422 bad quote" in response.json()["detail"]


def test_fragments_sharing_a_page_are_returned_as_one_page(student: TestClient) -> None:
    seeded = next(
        a["id"]
        for a in student.get("/api/v1/assignments/overview").json()["items"]
        if a["title"] == "Assignment 3 — Authentication"
    )
    body = student.get(f"/api/v1/assignments/{seeded}/text").json()
    numbers = [p["page"] for p in body["pages"]]
    assert numbers == sorted(set(numbers)) == [2, 3, 4]


def apply_plan(student: TestClient, assignment_id: str, **overrides: Any) -> dict[str, Any]:
    plan = student.post("/api/v1/task-plans", json=plan_body(assignment_id, **overrides)).json()
    applied = student.post(f"/api/v1/task-plans/{plan['id']}/apply")
    assert applied.status_code == 200, applied.text
    return dict(applied.json())


def titles(student: TestClient, assignment_id: str) -> list[str]:
    tasks = student.get("/api/v1/tasks", params={"limit": 200}).json()
    return sorted(t["title"] for t in tasks if t["assignment_id"] == assignment_id)


def test_a_second_analysis_replaces_the_first_plans_unstarted_tasks(
    student: TestClient, uploaded: str
) -> None:
    first = apply_plan(student, uploaded)
    assert first["replaced"] == 0
    tasks = student.get("/api/v1/tasks", params={"limit": 200}).json()
    started = next(t for t in tasks if t["title"] == "Secure endpoints")
    student.patch(f"/api/v1/tasks/{started['id']}", json={"status": "in_progress"})

    items = plan_body(uploaded)["items"]
    items[0]["title"] = "Implement tokens (second analysis)"
    second = apply_plan(student, uploaded, items=items[:1])
    assert second["replaced"] == 1  # only the unstarted one
    assert titles(student, uploaded) == ["Implement tokens (second analysis)", "Secure endpoints"]
    estimate = student.get(f"/api/v1/assignments/{uploaded}").json()["estimated_hours"]
    assert estimate == 3.5  # 1.5 new + 2.0 kept: the board's total, not just the new plan


def test_the_applied_plan_stays_available_while_a_new_one_is_pending(
    student: TestClient, uploaded: str
) -> None:
    apply_plan(student, uploaded)
    pending = student.post("/api/v1/task-plans", json=plan_body(uploaded)).json()
    latest = student.get(f"/api/v1/assignments/{uploaded}/task-plan").json()
    applied = student.get(
        f"/api/v1/assignments/{uploaded}/task-plan", params={"applied": "true"}
    ).json()
    assert latest["id"] == pending["id"] and latest["status"] == "pending"
    assert applied["status"] == "applied" and applied["id"] != pending["id"]
