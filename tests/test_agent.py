import asyncio
import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.agent.gateway import (
    AdkServerGateway,
    AgentReply,
    AgentStep,
    AgentUnavailableError,
    parse_events,
)
from app.main import app
from app.product.router import get_agent_gateway

EVENTS = [
    {"content": {"role": "user", "parts": [{"text": "What is due?"}]}},
    {
        "content": {
            "role": "model",
            "parts": [
                {"text": "thinking about deadlines", "thought": True},
                {"function_call": {"name": "list_assignments", "args": {"only_open": True}}},
            ],
        }
    },
    {
        "content": {
            "role": "user",
            "parts": [{"function_response": {"name": "list_assignments", "response": {"n": 2}}}],
        }
    },
    {"content": {"role": "model", "parts": [{"text": "Two assignments."}]}, "partial": True},
    {"content": {"role": "model", "parts": [{"text": "Two assignments are open."}]}},
]


def test_parse_events_extracts_trace_and_final_answer() -> None:
    text, steps = parse_events(EVENTS)
    assert text == "Two assignments are open."
    assert [(s.kind, s.name) for s in steps] == [
        ("thought", None),
        ("tool_call", "list_assignments"),
        ("tool_result", "list_assignments"),
    ]
    assert json.loads(steps[1].detail) == {"only_open": True}


def test_parse_events_accepts_the_adk_server_camel_case_shape() -> None:
    text, steps = parse_events(
        [
            {"content": {"role": "model", "parts": [{"functionCall": {"name": "x", "args": {}}}]}},
            {
                "content": {
                    "role": "user",
                    "parts": [{"functionResponse": {"name": "x", "response": {"ok": 1}}}],
                }
            },
            {"content": {"role": "model", "parts": [{"text": "Done"}]}},
        ]
    )
    assert text == "Done" and [s.kind for s in steps] == ["tool_call", "tool_result"]


class FakeGateway:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = False

    async def chat(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AgentReply:
        self.calls.append(
            {"user_id": user_id, "session_id": session_id, "message": message, "token": agent_token}
        )
        if self.fail:
            raise AgentUnavailableError("down")
        return AgentReply(
            session_id=session_id or "s-1",
            text="Two assignments are open.",
            steps=[
                AgentStep("tool_call", "list_assignments", '{"only_open": true}'),
                AgentStep("tool_result", "list_assignments", '{"n": 2}'),
            ],
        )


@pytest.fixture
def gateway(student: TestClient) -> FakeGateway:
    fake = FakeGateway()
    app.dependency_overrides[get_agent_gateway] = lambda: fake
    return fake


def test_agent_is_reported_disabled_until_configured(student: TestClient) -> None:
    assert student.get("/api/v1/agent/status").json() == {"enabled": False, "mode": "disabled"}
    assert student.post("/api/v1/agent/chat", json={"message": "hi"}).status_code == 503


def test_chat_returns_reply_and_trace_and_records_the_run(
    student: TestClient, gateway: FakeGateway
) -> None:
    body = student.post("/api/v1/agent/chat", json={"message": "What is due?"}).json()
    assert body["reply"] == "Two assignments are open." and body["session_id"] == "s-1"
    assert [s["kind"] for s in body["steps"]] == ["tool_call", "tool_result"]

    # The agent receives a bearer token that works against the API as the same student.
    token = gateway.calls[0]["token"]
    me = student.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200

    activity = student.get("/api/v1/agent/activity", params={"limit": 10}).json()
    run = next(item for item in activity["runs"] if item["id"] == body["run_id"])
    assert run["kind"] == "chat" and run["tool_calls"][0]["tool_name"] == "list_assignments"
    assert json.loads(run["tool_calls"][0]["result_summary"]) == {"n": 2}


def test_follow_up_messages_reuse_the_session(student: TestClient, gateway: FakeGateway) -> None:
    student.post("/api/v1/agent/chat", json={"message": "one", "session_id": "abc"})
    assert gateway.calls[0]["session_id"] == "abc"


def test_unreachable_agent_is_a_502_and_a_failed_run(
    student: TestClient, gateway: FakeGateway
) -> None:
    gateway.fail = True
    assert student.post("/api/v1/agent/chat", json={"message": "hi"}).status_code == 502
    runs = student.get("/api/v1/agent/activity", params={"limit": 10}).json()["runs"]
    assert any(run["status"] == "failed" for run in runs)


def test_chat_requires_authentication_and_a_message(
    student: TestClient, gateway: FakeGateway
) -> None:
    assert student.post("/api/v1/agent/chat", json={"message": ""}).status_code == 422
    student.headers.pop("Authorization")
    assert student.post("/api/v1/agent/chat", json={"message": "hi"}).status_code == 401


def sse(events: list[dict[str, Any]]) -> httpx.Response:
    body = "".join(f"data: {json.dumps(event)}\n\n" for event in events)
    return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=body)


def test_adk_server_gateway_creates_a_session_with_the_token_then_runs() -> None:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/run_sse":
            return sse(EVENTS)
        return httpx.Response(200, json={})

    gateway = AdkServerGateway(
        "http://adk.test", "campuspulse", 5, transport=httpx.MockTransport(respond)
    )
    reply = asyncio.run(
        gateway.chat(user_id="u1", session_id=None, message="hi", agent_token="tok")
    )
    assert reply.text == "Two assignments are open."
    created = json.loads(seen[0].content)
    assert (
        created["state"] == {"campuspulse_token": "tok"} and created["campuspulse_token"] == "tok"
    )
    assert json.loads(seen[1].content)["newMessage"]["parts"][0]["text"] == "hi"


def test_adk_server_gateway_can_override_the_host_header() -> None:
    seen: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["host"])
        return sse(EVENTS) if request.url.path == "/run_sse" else httpx.Response(200, json={})

    gateway = AdkServerGateway(
        "http://host.docker.internal:8002",
        "campuspulse",
        5,
        transport=httpx.MockTransport(respond),
        host_header="localhost:8002",
    )
    asyncio.run(gateway.chat(user_id="u1", session_id=None, message="hi", agent_token="t"))
    assert set(seen) == {"localhost:8002"}


def parse_sse(text: str) -> list[tuple[str, dict[str, Any]]]:
    events = []
    for block in filter(None, text.split("\n\n")):
        name, data = block.split("\n", 1)
        events.append((name.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return events


def test_chat_stream_sends_each_step_then_the_recorded_answer(
    student: TestClient, gateway: FakeGateway
) -> None:
    response = student.post("/api/v1/agent/chat/stream", json={"message": "what is open?"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    assert [name for name, _ in events] == ["step", "step", "done"]
    assert events[0][1]["name"] == "list_assignments" and events[0][1]["kind"] == "tool_call"
    assert events[2][1]["reply"] == "Two assignments are open." and events[2][1]["run_id"]


def test_chat_stream_reports_an_unreachable_agent_as_an_event(
    student: TestClient, gateway: FakeGateway
) -> None:
    gateway.fail = True
    events = parse_sse(student.post("/api/v1/agent/chat/stream", json={"message": "hi"}).text)
    assert events == [("error", {"status": 502, "detail": "down"})]


def test_stream_requires_a_configured_agent(student: TestClient) -> None:
    app.dependency_overrides[get_agent_gateway] = lambda: None
    assert student.post("/api/v1/agent/chat/stream", json={"message": "hi"}).status_code == 503


def test_adk_server_gateway_yields_steps_before_the_reply() -> None:
    gateway = AdkServerGateway(
        "http://adk.test",
        "campuspulse",
        5,
        transport=httpx.MockTransport(
            lambda request: (
                sse(EVENTS) if request.url.path == "/run_sse" else httpx.Response(200, json={})
            )
        ),
    )

    async def kinds() -> list[str]:
        return [
            type(item).__name__
            async for item in gateway.stream(
                user_id="u", session_id=None, message="hi", agent_token="t"
            )
        ]

    names = asyncio.run(kinds())
    assert names[-1] == "AgentReply" and set(names[:-1]) == {"AgentStep"} and len(names) > 1
