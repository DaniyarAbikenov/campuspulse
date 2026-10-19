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


def test_adk_server_gateway_creates_a_session_with_the_token_then_runs() -> None:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/run":
            return httpx.Response(200, json=EVENTS)
        return httpx.Response(200, json={})

    gateway = AdkServerGateway(
        "http://adk.test", "campuspulse", 5, transport=httpx.MockTransport(respond)
    )
    reply = asyncio.run(
        gateway.chat(user_id="u1", session_id=None, message="hi", agent_token="tok")
    )
    assert reply.text == "Two assignments are open."
    assert json.loads(seen[0].content)["state"] == {"campuspulse_token": "tok"}
    assert json.loads(seen[1].content)["newMessage"]["parts"][0]["text"] == "hi"
