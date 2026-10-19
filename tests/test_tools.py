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
