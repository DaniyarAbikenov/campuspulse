import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.agent.gateway import AgentGateway, AgentReply, AgentStep, AgentUnavailableError
from app.auth.service import AuthenticatedUser
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db import models
from app.product import campus, plans


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


async def chat(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    payload: schemas.AgentChatRequest,
    *,
    settings: Settings,
    secret: str,
) -> schemas.AgentChatRead:
    title = payload.message.strip().replace("\n", " ")[:120]
    try:
        reply: AgentReply = await gateway.chat(
            user_id=str(actor.user.id),
            session_id=payload.session_id,
            message=payload.message,
            agent_token=mint_agent_token(actor, settings, secret),
        )
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
    return schemas.AgentChatRead(
        session_id=reply.session_id,
        reply=reply.text,
        run_id=run.id,
        steps=[
            schemas.AgentChatStepRead(kind=step.kind, name=step.name, detail=step.detail)
            for step in reply.steps
        ],
    )


ANALYSIS_PROMPT = (
    "Analyze assignment {assignment_id} for the student and propose a task plan: read it with "
    "get_assignment_text, quote every requirement exactly with its page, create 5 to 8 tasks of "
    "1 to 3 hours, link an earlier assignment it extends (look at all assignments, including "
    "completed ones), calibrate estimates with get_study_statistics and call propose_task_plan "
    "once. Finish with a one-sentence summary."
)


async def analyze_assignment(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    assignment_id: UUID,
    *,
    settings: Settings,
    secret: str,
) -> schemas.AssignmentAnalysisRead:
    plans.assignment_text(session, actor, assignment_id)  # 404 early when there is nothing to read
    started: datetime = models.utc_now()
    reply = await chat(
        session,
        actor,
        gateway,
        schemas.AgentChatRequest(message=ANALYSIS_PROMPT.format(assignment_id=assignment_id)),
        settings=settings,
        secret=secret,
    )
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
    return schemas.AssignmentAnalysisRead(plan=plan, steps=reply.steps)


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
