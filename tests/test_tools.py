from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from campuspulse_agent import campuspulse_tools as tools
from campuspulse_agent.agent import build_agent, build_toolset
from campuspulse_agent.config import Settings


def context(token: str | None = "student-token") -> Any:
    return SimpleNamespace(state={tools.TOKEN_KEY: token} if token else {})


@pytest.fixture
def backend(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    """Route every CampusPulse call to canned responses and record the requests."""
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        path = request.url.path
        if path == "/api/v1/workload":
            return httpx.Response(
                200,
                json={
                    "required_hours": 21.5,
                    "available_hours": 12.0,
                    "unscheduled_hours": 9.5,
                    "by_day": [],
                },
            )
        if path == "/api/v1/assignments/overview":
            rows = [
                {
                    "id": "2",
                    "title": "Later",
                    "course_name": "SE",
                    "due_at": "2026-11-01T00:00:00Z",
                    "status": "todo",
                    "estimated_hours": 3,
                    "remaining_hours": 3,
                },
                {
                    "id": "1",
                    "title": "Soon",
                    "course_name": "DB",
                    "due_at": "2026-10-20T00:00:00Z",
                    "status": "in_progress",
                    "estimated_hours": 2,
                    "remaining_hours": 1,
                },
                {
                    "id": "3",
                    "title": "Done",
                    "course_name": "OS",
                    "due_at": "2026-09-01T00:00:00Z",
                    "status": "completed",
                    "estimated_hours": 1,
                    "remaining_hours": 0,
                },
            ]
            return httpx.Response(200, json={"items": rows})
        if path == "/api/v1/knowledge":
            return httpx.Response(
                200,
                json={
                    "documents": [{"id": "d1", "name": "Lecture_07.pdf"}],
                    "fragments": [
                        {
                            "document_id": "d1",
                            "page": 11,
                            "concept": "Tokens",
                            "text": "Access and refresh token lifetimes and rotation.",
                        },
                        {"document_id": "d1", "page": 19, "concept": "CORS", "text": "Origins."},
                    ],
                },
            )
        if path.endswith("/text"):
            return httpx.Response(
                200,
                json={
                    "assignment_id": "a1",
                    "title": "Assignment 3",
                    "course_name": "SE",
                    "due_at": "2026-10-23T00:00:00Z",
                    "pages": [{"page": 1, "text": "R1 Implement JWT."}],
                },
            )
        if path == "/api/v1/statistics":
            return httpx.Response(
                200,
                json={
                    "estimate_accuracy_percent": 89,
                    "completed": [
                        {"title": "A1", "estimated_hours": 6, "actual_hours": 6.5, "extra": 1}
                    ],
                },
            )
        if path == "/api/v1/task-plans":
            return httpx.Response(
                201,
                json={
                    "id": "plan-1",
                    "items": [
                        {"requirement_id": "R1", "estimated_hours": 1.5, "quote_verified": True},
                        {"requirement_id": "R2", "estimated_hours": 2.0, "quote_verified": False},
                    ],
                },
            )
        if path == "/api/v1/imports/proposals":
            return httpx.Response(
                201, json={"proposal": {"id": "p1", "items": [{}, {}]}, "skipped_existing": 1}
            )
        return httpx.Response(404)

    real = httpx.AsyncClient

    def client_factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real(*args, **{**kwargs, "transport": httpx.MockTransport(respond)})

    monkeypatch.setattr(tools.httpx, "AsyncClient", client_factory)
    return seen


async def test_requests_are_made_as_the_student(backend: list[httpx.Request]) -> None:
    result = await tools.get_workload(context())
    assert result["overloaded"] is True and result["unscheduled_hours"] == 9.5
    assert backend[0].headers["Authorization"] == "Bearer student-token"


async def test_tools_refuse_to_run_without_a_signed_in_student() -> None:
    with pytest.raises(tools.CampusPulseError):
        await tools.get_workload(context(token=None))


async def test_open_assignments_are_sorted_by_due_date(backend: list[httpx.Request]) -> None:
    rows = await tools.list_assignments(context())
    assert [row["title"] for row in rows] == ["Soon", "Later"]
    everything = await tools.list_assignments(context(), only_open=False)
    assert [row["title"] for row in everything][0] == "Done"


async def test_knowledge_search_cites_document_and_page(backend: list[httpx.Request]) -> None:
    hits = await tools.search_knowledge(context(), "refresh token rotation")
    assert hits[0]["document"] == "Lecture_07.pdf" and hits[0]["page"] == 11
    assert all(hit["concept"] != "CORS" for hit in hits)


async def test_import_proposal_is_a_proposal_not_a_write(backend: list[httpx.Request]) -> None:
    result = await tools.propose_assignment_import(context(), [{"external_id": "1"}])
    assert result["proposed"] == 2 and result["already_known"] == 1
    assert backend[0].url.path == "/api/v1/imports/proposals"


def test_agent_exposes_tools_and_adds_moodle_only_when_configured() -> None:
    without = build_toolset(Settings(moodle_mcp_url=None))
    with_moodle = build_toolset(Settings(moodle_mcp_url="https://mcp.example/mcp"))
    assert len(with_moodle) == len(without) + 1
    agent = build_agent(Settings(moodle_mcp_url=None))
    assert agent.name == "campuspulse" and "read-only" in agent.instruction


def test_moodle_headers_come_from_the_runtime_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    from campuspulse_agent.agent import mcp_headers

    monkeypatch.delenv("CAMPUSPULSE_MOODLE_MCP_TOKEN", raising=False)
    assert mcp_headers(None) == {}
    monkeypatch.setenv("CAMPUSPULSE_MOODLE_MCP_TOKEN", "runtime-key")
    assert mcp_headers(None) == {"Authorization": "Bearer runtime-key"}


async def test_assignment_text_is_returned_with_an_untrusted_note(
    backend: list[httpx.Request],
) -> None:
    data = await tools.get_assignment_text(context(), "a1")
    assert data["pages"][0]["page"] == 1 and "untrusted" in data["note"]
    assert backend[0].url.path == "/api/v1/assignments/a1/text"


async def test_statistics_keep_only_what_estimation_needs(backend: list[httpx.Request]) -> None:
    data = await tools.get_study_statistics(context())
    assert data["completed_assignments"] == [
        {"title": "A1", "estimated_hours": 6, "actual_hours": 6.5}
    ]


async def test_task_plan_is_posted_and_unverified_quotes_are_reported(
    backend: list[httpx.Request],
) -> None:
    item = tools.PlanItem(
        requirement_id="R1",
        requirement_text="JWT",
        quote="Implement JWT",
        page=1,
        title="Implement JWT",
        estimated_hours=1.5,
    )
    result = await tools.propose_task_plan(
        context(), "a1", "One task", [item], related_assignment_id="a0", relation_type="extends"
    )
    assert result["tasks"] == 2 and result["total_hours"] == 3.5
    assert result["quotes_not_found_in_document"] == ["R2"]
    import json

    sent = json.loads(backend[0].content)
    assert sent["relation_type"] == "extends" and sent["items"][0]["quote"] == "Implement JWT"


def test_plan_tool_schema_exposes_the_item_fields_to_gemini() -> None:
    from google.adk.tools import FunctionTool

    declaration = FunctionTool(tools.propose_task_plan)._get_declaration()
    assert declaration is not None and declaration.name == "propose_task_plan"
    schema = declaration.parameters_json_schema or declaration.parameters.model_dump()
    text = str(schema)
    assert "items" in text and "quote" in text and "requirement_id" in text


async def test_plan_errors_are_returned_to_the_model_so_it_can_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"detail": [{"loc": ["body", "items", 0, "quote"]}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        tools.httpx,
        "AsyncClient",
        lambda *a, **k: real(*a, **{**k, "transport": httpx.MockTransport(respond)}),
    )
    item = tools.PlanItem(
        requirement_id="R1", requirement_text="x", quote="q", page=1, title="t", estimated_hours=1
    )
    result = await tools.propose_task_plan(context(), "a1", "s", [item])
    assert "422" in result["error"] and "quote" in result["error"] and "again" in result["hint"]
