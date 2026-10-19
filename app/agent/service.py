import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any, TypeVar
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.agent.gateway import (
    AgentGateway,
    AgentReply,
    AgentStep,
    AgentUnavailableError,
)
from app.auth.service import AuthenticatedUser
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db import models
from app.product import actions, campus, insight_agent, plans


def mint_agent_token(actor: AuthenticatedUser, settings: Settings, secret: str) -> str:
    """Short-lived access token the agent uses to call the API as the student."""
    token, _ = create_access_token(
        actor.user.id,
        secret=secret,
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
        ttl_minutes=settings.agent_token_ttl_minutes,
    )
    return token


def tool_calls_from_steps(steps: list[AgentStep]) -> list[schemas.AgentToolCallCreate]:
    """Pair each tool call with its result so the activity log can show the reasoning trace."""
    pending: list[dict[str, Any]] = []
    for step in steps:
        if step.kind == "tool_call":
            try:
                arguments = json.loads(step.detail)
            except ValueError:
                arguments = {"raw": step.detail}
            pending.append(
                {
                    "tool_name": step.name or "unknown",
                    "arguments": arguments if isinstance(arguments, dict) else {"value": arguments},
                    "result_summary": None,
                }
            )
        elif step.kind == "tool_result":
            target = next(
                (
                    call
                    for call in pending
                    if call["tool_name"] == step.name and call["result_summary"] is None
                ),
                None,
            )
            if target is not None:
                target["result_summary"] = step.detail
    return [schemas.AgentToolCallCreate(**call) for call in pending[:50]]


def step_read(step: AgentStep) -> schemas.AgentChatStepRead:
    return schemas.AgentChatStepRead(kind=step.kind, name=step.name, detail=step.detail)


async def _gateway_stream(
    gateway: AgentGateway, **call: Any
) -> AsyncIterator[AgentStep | AgentReply]:
    """The gateway's live stream, or its whole reply replayed step by step when it has none."""
    if hasattr(gateway, "stream"):
        async for item in gateway.stream(**call):
            yield item
        return
    reply = await gateway.chat(**call)
    for step in reply.steps:
        yield step
    yield reply


def _with_clock(session: Session, actor: AuthenticatedUser, message: str) -> str:
    """Tell the agent what day it is, so "tomorrow" and "this week" mean something."""
    if "Now it is" in message:
        return message
    return f"({insight_agent.today_prompt_context(session, actor)})\n{message}"


async def stream_chat(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    payload: schemas.AgentChatRequest,
    *,
    settings: Settings,
    secret: str,
    title: str | None = None,
) -> AsyncIterator[schemas.AgentChatStepRead | schemas.AgentChatRead]:
    """Yield each reasoning step live, then the recorded chat result. `title` names the run in
    the activity log; by default it is the student's message."""
    title = title or payload.message.strip().replace("\n", " ")[:120]
    started: datetime = models.utc_now()
    reply: AgentReply | None = None
    try:
        async for item in _gateway_stream(
            gateway,
            user_id=str(actor.user.id),
            session_id=payload.session_id,
            message=_with_clock(session, actor, payload.message),
            agent_token=mint_agent_token(actor, settings, secret),
        ):
            if isinstance(item, AgentReply):
                reply = item
            else:
                yield step_read(item)
        if reply is None:
            raise AgentUnavailableError("The agent ended without a reply")
    except AgentUnavailableError:
        campus.record_agent_run(
            session,
            actor,
            schemas.AgentRunCreate(
                kind=models.AgentRunKind.chat,
                title=title,
                detail="The agent could not be reached.",
                status=models.AgentRunStatus.failed,
            ),
        )
        raise
    run = campus.record_agent_run(
        session,
        actor,
        schemas.AgentRunCreate(
            kind=models.AgentRunKind.chat,
            title=title,
            detail=reply.text[:500],
            status=models.AgentRunStatus.success if reply.text else models.AgentRunStatus.warning,
            tool_calls=tool_calls_from_steps(reply.steps),
        ),
    )
    yield schemas.AgentChatRead(
        session_id=reply.session_id,
        reply=reply.text,
        run_id=run.id,
        steps=[step_read(step) for step in reply.steps],
        actions=_proposed_actions(session, actor, started),
    )


def _proposed_actions(
    session: Session, actor: AuthenticatedUser, since: datetime
) -> list[schemas.AgentActionRead]:
    session.expire_all()  # the agent saved them through its own request
    return actions.pending_since(session, actor, since)


Result = TypeVar("Result")


async def _finish(stream: AsyncIterator[Any], result_type: type[Result]) -> Result:
    """Drain a service stream and return its final result."""
    result: Result | None = None
    async for item in stream:
        if isinstance(item, result_type):
            result = item
    if result is None:
        raise AgentUnavailableError("The agent ended without a result")
    return result


async def chat(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    payload: schemas.AgentChatRequest,
    *,
    settings: Settings,
    secret: str,
) -> schemas.AgentChatRead:
    return await _finish(
        stream_chat(session, actor, gateway, payload, settings=settings, secret=secret),
        schemas.AgentChatRead,
    )


ANALYSIS_PROMPT = (
    "Analyze assignment {assignment_id} for the student and propose a task plan: read it with "
    "get_assignment_text, quote every requirement exactly with its page, create 5 to 8 tasks of "
    "1 to 3 hours, link an earlier assignment it extends (look at all assignments, including "
    "completed ones), calibrate estimates with get_study_statistics and call propose_task_plan "
    "once. Finish with a one-sentence summary."
)


async def stream_analysis(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    assignment_id: UUID,
    *,
    settings: Settings,
    secret: str,
) -> AsyncIterator[schemas.AgentChatStepRead | schemas.AssignmentAnalysisRead]:
    plans.assignment_text(session, actor, assignment_id)  # 404 early when there is nothing to read
    started: datetime = models.utc_now()
    reply: schemas.AgentChatRead | None = None
    named = session.get(models.Assignment, assignment_id)
    async for item in stream_chat(
        session,
        actor,
        gateway,
        schemas.AgentChatRequest(message=ANALYSIS_PROMPT.format(assignment_id=assignment_id)),
        settings=settings,
        secret=secret,
        title=f"Analyzed “{named.title}”" if named else "Analyzed an assignment",
    ):
        if isinstance(item, schemas.AgentChatRead):
            reply = item
        else:
            yield item
    assert reply is not None
    session.expire_all()
    try:
        plan = plans.latest_plan(session, actor, assignment_id)
    except HTTPException as error:
        raise AgentUnavailableError(_no_plan_reason(reply.steps)) from error
    created = (
        plan.created_at
        if plan.created_at.tzinfo
        else plan.created_at.replace(tzinfo=started.tzinfo)
    )
    if plan.status != models.PlanStatus.pending or created < started:
        raise AgentUnavailableError(_no_plan_reason(reply.steps))
    yield schemas.AssignmentAnalysisRead(plan=plan, steps=reply.steps)


async def analyze_assignment(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    assignment_id: UUID,
    *,
    settings: Settings,
    secret: str,
) -> schemas.AssignmentAnalysisRead:
    return await _finish(
        stream_analysis(session, actor, gateway, assignment_id, settings=settings, secret=secret),
        schemas.AssignmentAnalysisRead,
    )


def _no_plan_reason(steps: list[schemas.AgentChatStepRead]) -> str:
    """Say why saving failed when the agent reported an error from propose_task_plan."""
    for step in reversed(steps):
        if (
            step.kind == "tool_result"
            and step.name == "propose_task_plan"
            and "error" in step.detail
        ):
            return f"The agent could not save a task plan: {step.detail[:300]}"
    return "The agent did not produce a task plan"


INSIGHT_PROMPT = (
    "{today} Review this student's situation and propose 2 to 5 insights: call list_insights "
    "first so you do not repeat answered ones, then get_workload for this week and next, "
    "list_assignments, list_open_tasks and get_free_time. Each insight needs the concrete "
    "numbers and dates behind it (reasoning) and sources that cite the exact assignments, tasks "
    "or figures you used. When a free window can host study time for a task, attach a "
    "study_session that fits entirely inside that window and starts in the future. Then call "
    "propose_insights once. Finish with one sentence."
)


async def stream_insights(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    *,
    settings: Settings,
    secret: str,
) -> AsyncIterator[schemas.AgentChatStepRead | schemas.InsightRefreshRead]:
    started: datetime = models.utc_now()
    reply: schemas.AgentChatRead | None = None
    async for item in stream_chat(
        session,
        actor,
        gateway,
        schemas.AgentChatRequest(
            message=INSIGHT_PROMPT.format(today=insight_agent.today_prompt_context(session, actor))
        ),
        settings=settings,
        secret=secret,
        title="Reviewed your week",
    ):
        if isinstance(item, schemas.AgentChatRead):
            reply = item
        else:
            yield item
    assert reply is not None
    session.expire_all()
    fresh = [
        item
        for item in session.scalars(
            select(models.Insight)
            .where(
                models.Insight.user_id == actor.user.id,
                models.Insight.generated_by == insight_agent.GENERATED_BY,
                models.Insight.status == models.InsightStatus.new,
            )
            .order_by(models.Insight.created_at)
        )
        if (
            item.created_at
            if item.created_at.tzinfo
            else item.created_at.replace(tzinfo=started.tzinfo)
        )
        >= started
    ]
    if not fresh:
        raise AgentUnavailableError(_no_insights_reason(reply.steps))
    yield schemas.InsightRefreshRead(
        created=[schemas.InsightRead.model_validate(item) for item in fresh],
        rejected=[],
        steps=reply.steps,
    )


async def refresh_insights(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    *,
    settings: Settings,
    secret: str,
) -> schemas.InsightRefreshRead:
    return await _finish(
        stream_insights(session, actor, gateway, settings=settings, secret=secret),
        schemas.InsightRefreshRead,
    )


def _no_insights_reason(steps: list[schemas.AgentChatStepRead]) -> str:
    for step in reversed(steps):
        if step.kind == "tool_result" and step.name == "propose_insights":
            return f"The agent produced no usable insights: {step.detail[:300]}"
    return "The agent did not produce any insights"
