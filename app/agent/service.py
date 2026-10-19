import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.agent.gateway import AgentGateway, AgentReply, AgentStep, AgentUnavailableError
from app.auth.service import AuthenticatedUser
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db import models
from app.product import campus, insight_agent, plans


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


INSIGHT_PROMPT = (
    "{today} Review this student's situation and propose 2 to 5 insights: call list_insights "
    "first so you do not repeat answered ones, then get_workload for this week and next, "
    "list_assignments, list_open_tasks and get_free_time. Each insight needs the concrete "
    "numbers and dates behind it (reasoning) and sources that cite the exact assignments, tasks "
    "or figures you used. When a free window can host study time for a task, attach a "
    "study_session that fits entirely inside that window and starts in the future. Then call "
    "propose_insights once. Finish with one sentence."
)


async def refresh_insights(
    session: Session,
    actor: AuthenticatedUser,
    gateway: AgentGateway,
    *,
    settings: Settings,
    secret: str,
) -> schemas.InsightRefreshRead:
    started: datetime = models.utc_now()
    reply = await chat(
        session,
        actor,
        gateway,
        schemas.AgentChatRequest(
            message=INSIGHT_PROMPT.format(today=insight_agent.today_prompt_context(session, actor))
        ),
        settings=settings,
        secret=secret,
    )
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
    return schemas.InsightRefreshRead(
        created=[schemas.InsightRead.model_validate(item) for item in fresh],
        rejected=[],
        steps=reply.steps,
    )


def _no_insights_reason(steps: list[schemas.AgentChatStepRead]) -> str:
    for step in reversed(steps):
        if step.kind == "tool_result" and step.name == "propose_insights":
            return f"The agent produced no usable insights: {step.detail[:300]}"
    return "The agent did not produce any insights"
