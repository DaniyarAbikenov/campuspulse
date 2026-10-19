"""Transport to the CampusPulse agent (Vertex AI Agent Engine or a local ADK server)."""

import asyncio
import json
from collections.abc import AsyncIterator, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol
from uuid import uuid4

import httpx

from app.core.config import Settings

TOKEN_STATE_KEY = "campuspulse_token"
SUMMARY_LIMIT = 300


class AgentUnavailableError(RuntimeError):
    """The agent could not be reached or returned an unusable answer."""


@dataclass(frozen=True)
class AgentStep:
    kind: Literal["thought", "tool_call", "tool_result"]
    name: str | None
    detail: str


@dataclass(frozen=True)
class AgentReply:
    session_id: str
    text: str
    steps: list[AgentStep] = field(default_factory=list)


class AgentGateway(Protocol):
    async def chat(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AgentReply: ...

    def stream(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AsyncIterator[AgentStep | AgentReply]:
        """Yield each reasoning step as the agent produces it, then the final reply."""
        ...


def _first(source: Mapping[str, Any], *names: str) -> Any:
    for name in names:
        if name in source and source[name] is not None:
            return source[name]
    return None


def _short(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return text if len(text) <= SUMMARY_LIMIT else text[: SUMMARY_LIMIT - 1] + "…"


def parse_event(event: Mapping[str, Any]) -> tuple[list[AgentStep], str | None]:
    """One ADK event (snake_case from Agent Engine, camelCase from the ADK server) as the
    reasoning steps it adds, plus the answer text when the event carries the final answer."""
    steps: list[AgentStep] = []
    content = event.get("content") or {}
    from_user = _first(content, "role") == "user"
    texts: list[str] = []
    has_call = False
    for part in content.get("parts") or []:
        call = _first(part, "function_call", "functionCall")
        result = _first(part, "function_response", "functionResponse")
        if call:
            has_call = True
            steps.append(AgentStep("tool_call", call.get("name"), _short(call.get("args") or {})))
        elif result:
            steps.append(
                AgentStep("tool_result", result.get("name"), _short(result.get("response") or {}))
            )
        elif part.get("text") and not from_user:
            if part.get("thought"):
                steps.append(AgentStep("thought", None, _short(part["text"])))
            else:
                texts.append(part["text"])
    answer = "".join(texts) if texts and not has_call and not _first(event, "partial") else None
    return steps, answer


def parse_events(events: Iterable[Mapping[str, Any]]) -> tuple[str, list[AgentStep]]:
    """Turn ADK event dicts into the reasoning trace and the final answer."""
    steps: list[AgentStep] = []
    answer = ""
    for event in events:
        added, text = parse_event(event)
        steps.extend(added)
        if text is not None:
            answer = text
    return answer, steps


class _Trace:
    """Collects the events of one run, yielding steps live and the reply at the end."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.steps: list[AgentStep] = []
        self.answer = ""

    def add(self, event: Mapping[str, Any]) -> list[AgentStep]:
        added, text = parse_event(event)
        self.steps.extend(added)
        if text is not None:
            self.answer = text
        return added

    def reply(self) -> AgentReply:
        return AgentReply(session_id=self.session_id, text=self.answer, steps=self.steps)


async def collect(stream: AsyncIterator[AgentStep | AgentReply]) -> AgentReply:
    """Drain a gateway stream and return its final reply."""
    reply: AgentReply | None = None
    async for item in stream:
        if isinstance(item, AgentReply):
            reply = item
    if reply is None:
        raise AgentUnavailableError("The agent ended without a reply")
    return reply


class VertexAgentGateway:
    def __init__(self, project: str, location: str, resource: str) -> None:
        self._project = project
        self._location = location
        self._resource = resource
        self._engine: Any = None

    def _load(self) -> Any:
        if self._engine is None:
            import vertexai
            from vertexai import agent_engines

            vertexai.init(project=self._project, location=self._location)
            self._engine = agent_engines.get(self._resource)
        return self._engine

    async def chat(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AgentReply:
        return await collect(
            self.stream(
                user_id=user_id, session_id=session_id, message=message, agent_token=agent_token
            )
        )

    async def stream(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AsyncIterator[AgentStep | AgentReply]:
        try:
            engine = await asyncio.to_thread(self._load)
            if session_id is None:
                session = await engine.async_create_session(
                    user_id=user_id, state={TOKEN_STATE_KEY: agent_token}
                )
                session_id = str(session["id"])
            trace = _Trace(session_id)
            async for event in engine.async_stream_query(
                user_id=user_id, session_id=session_id, message=message
            ):
                for step in trace.add(event):
                    yield step
        except Exception as error:  # SDK raises many unrelated types
            raise AgentUnavailableError(
                f"Agent Engine call failed: {type(error).__name__}"
            ) from error
        yield trace.reply()


class AdkServerGateway:
    """Talks to `adk api_server`, handy for local development without a cloud deployment."""

    def __init__(
        self,
        base_url: str,
        app_name: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
        host_header: str | None = None,
    ) -> None:
        self._host_header = host_header
        self._base = base_url.rstrip("/")
        self._app = app_name
        self._timeout = timeout
        self._transport = transport

    async def chat(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AgentReply:
        return await collect(
            self.stream(
                user_id=user_id, session_id=session_id, message=message, agent_token=agent_token
            )
        )

    async def stream(
        self, *, user_id: str, session_id: str | None, message: str, agent_token: str
    ) -> AsyncIterator[AgentStep | AgentReply]:
        try:
            headers = {"Host": self._host_header} if self._host_header else {}
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport, headers=headers
            ) as http:
                if session_id is None:
                    session_id = uuid4().hex
                    created = await http.post(
                        f"{self._base}/apps/{self._app}/users/{user_id}/sessions/{session_id}",
                        # Some ADK versions read the body as the state, others its "state"
                        # field: send the token both ways so either works.
                        json={
                            "state": {TOKEN_STATE_KEY: agent_token},
                            TOKEN_STATE_KEY: agent_token,
                        },
                    )
                    created.raise_for_status()
                trace = _Trace(session_id)
                async with http.stream(
                    "POST",
                    f"{self._base}/run_sse",
                    json={
                        "appName": self._app,
                        "userId": user_id,
                        "sessionId": session_id,
                        "newMessage": {"role": "user", "parts": [{"text": message}]},
                        "streaming": False,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        for step in trace.add(json.loads(line[5:])):
                            yield step
        except (httpx.HTTPError, ValueError) as error:
            raise AgentUnavailableError(
                f"Agent server call failed: {type(error).__name__}"
            ) from error
        yield trace.reply()


def build_gateway(settings: Settings) -> AgentGateway | None:
    if settings.agent_mode == "vertex" and settings.agent_resource and settings.agent_project:
        return VertexAgentGateway(
            settings.agent_project, settings.agent_location, settings.agent_resource
        )
    if settings.agent_mode == "adk_server":
        return AdkServerGateway(
            settings.agent_adk_url,
            settings.agent_adk_app,
            settings.agent_timeout_seconds,
            host_header=settings.agent_adk_host_header,
        )
    return None
