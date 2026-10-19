"""Function tools that read the signed-in student's CampusPulse data.

The agent never holds credentials of its own: the backend places the student's access token in
the ADK session state (`campuspulse_token`) and every call is made *as that student*, so the
existing role and ownership rules still decide what is visible.
"""

import re
from typing import Any

import httpx
from google.adk.tools import ToolContext

from campuspulse_agent.config import get_settings

TOKEN_KEY = "campuspulse_token"
_WORDS = re.compile(r"\w+", re.UNICODE)


class CampusPulseError(RuntimeError):
    pass


async def _call(
    tool_context: ToolContext,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json: Any = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> Any:
    token = tool_context.state.get(TOKEN_KEY)
    if not token:
        raise CampusPulseError("The student is not signed in to CampusPulse.")
    settings = get_settings()
    async with httpx.AsyncClient(
        base_url=settings.backend_url.rstrip("/"),
        timeout=settings.request_timeout_seconds,
        transport=transport,
    ) as client:
        response = await client.request(
            method,
            path,
            params=params,
            json=json,
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 400:
        raise CampusPulseError(f"CampusPulse returned {response.status_code} for {path}")
    return response.json()


async def get_workload(tool_context: ToolContext, week_start: str | None = None) -> dict[str, Any]:
    """Required vs available study hours for a week, with a per-day breakdown.

    Args:
        week_start: Monday of the week as YYYY-MM-DD. Defaults to the current week.
    """
    data = await _call(
        tool_context, "GET", "/workload", params={"week_start": week_start} if week_start else None
    )
    return {
        "required_hours": data["required_hours"],
        "available_hours": data["available_hours"],
        "unscheduled_hours": data["unscheduled_hours"],
        "overloaded": data["required_hours"] > data["available_hours"],
        "by_day": data["by_day"],
        "source": "CampusPulse workload forecast",
    }


async def list_assignments(
    tool_context: ToolContext, only_open: bool = True, limit: int = 20
) -> list[dict[str, Any]]:
    """The student's assignments with due date, status and remaining effort, soonest first.

    Args:
        only_open: Skip completed assignments.
        limit: Maximum number of assignments to return.
    """
    page = await _call(tool_context, "GET", "/assignments/overview")
    rows = [row for row in page["items"] if not only_open or row["status"] != "completed"]
    rows.sort(key=lambda row: row["due_at"])
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "course": row["course_name"],
            "due_at": row["due_at"],
            "status": row["status"],
            "estimated_hours": row["estimated_hours"],
            "remaining_hours": row["remaining_hours"],
            "source": "CampusPulse assignments",
        }
        for row in rows[: max(1, min(limit, 50))]
    ]


async def get_free_time(tool_context: ToolContext, week_start: str | None = None) -> list[Any]:
    """Free study slots in a week, respecting the student's availability settings.

    Args:
        week_start: Monday of the week as YYYY-MM-DD. Defaults to the current week.
    """
    return await _call(
        tool_context,
        "GET",
        "/schedule/free-time",
        params={"week_start": week_start} if week_start else None,
    )


async def list_campus_events(tool_context: ToolContext, limit: int = 5) -> list[dict[str, Any]]:
    """Upcoming campus events ranked by how well they fit this student.

    Args:
        limit: Maximum number of events to return.
    """
    events = await _call(tool_context, "GET", "/campus-events")
    ranked = sorted(events, key=lambda item: -(item["match_percent"] or 0))
    return [
        {
            "title": item["title"],
            "starts_at": item["starts_at"],
            "place": item["place"],
            "match_percent": item["match_percent"],
            "reason": item["reason"],
            "source": "CampusPulse campus events",
        }
        for item in ranked[: max(1, min(limit, 20))]
    ]


async def search_knowledge(
    tool_context: ToolContext, query: str, limit: int = 5
) -> list[dict[str, Any]]:
    """Find indexed lecture and assignment excerpts relevant to a question, with citations.

    Args:
        query: Keywords to look for, for example "JWT refresh token".
        limit: Maximum number of excerpts to return.
    """
    base = await _call(tool_context, "GET", "/knowledge")
    names = {doc["id"]: doc["name"] for doc in base["documents"]}
    terms = {word.casefold() for word in _WORDS.findall(query) if len(word) > 2}
    scored = []
    for fragment in base["fragments"]:
        haystack = f"{fragment['concept']} {fragment['text']}".casefold()
        score = sum(term in haystack for term in terms)
        if score:
            scored.append((score, fragment))
    scored.sort(key=lambda pair: -pair[0])
    return [
        {
            "document": names.get(fragment["document_id"], "unknown"),
            "page": fragment["page"],
            "concept": fragment["concept"],
            "excerpt": fragment["text"],
            "source": "CampusPulse knowledge base",
        }
        for _, fragment in scored[: max(1, min(limit, 10))]
    ]


async def propose_assignment_import(
    tool_context: ToolContext, assignments: list[dict[str, Any]]
) -> dict[str, Any]:
    """Propose assignments found in Moodle for the student to review. Nothing is created yet.

    The student approves, edits or dismisses the proposal in the app.

    Args:
        assignments: Items with keys external_id, title, description, due_at (ISO 8601),
            external_course_code, external_course_name and optional attachment_names.
    """
    result = await _call(
        tool_context,
        "POST",
        "/imports/proposals",
        json={"source": "moodle", "items": assignments},
    )
    proposal = result["proposal"]
    return {
        "proposal_id": proposal["id"] if proposal else None,
        "proposed": len(proposal["items"]) if proposal else 0,
        "already_known": result["skipped_existing"],
        "next_step": "Ask the student to review the import in Assignments.",
    }


CAMPUSPULSE_TOOLS = [
    get_workload,
    list_assignments,
    get_free_time,
    list_campus_events,
    search_knowledge,
    propose_assignment_import,
]
