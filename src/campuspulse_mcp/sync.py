"""Propose Moodle assignments to the CampusPulse backend for the student's approval.

Nothing is written to the planner here: the backend stores a *proposal* that the student reviews
in the app. This is the same read path the agent will use through the MCP tools.
"""

import asyncio
import sys
from typing import Any
from urllib.parse import urlsplit

import httpx

from campuspulse_mcp.config import Settings
from campuspulse_mcp.moodle.client import MoodleClient
from campuspulse_mcp.moodle.service import MoodleService

SOURCE = "moodle"


async def build_items(service: MoodleService, site_host: str) -> tuple[list[dict[str, Any]], int]:
    """Return proposal items and the number of assignments skipped for lacking a due date."""
    courses = {course.id: course for course in await service.list_courses()}
    items: list[dict[str, Any]] = []
    skipped = 0
    for assignment in await service.list_assignments(list(courses)):
        if assignment.due_at is None:
            skipped += 1
            continue
        course = courses[assignment.course_id]
        items.append(
            {
                "external_id": f"{site_host}/assign/{assignment.id}",
                "title": assignment.name[:240],
                "description": assignment.description or None,
                "due_at": assignment.due_at.isoformat(),
                "external_course_code": course.short_name,
                "external_course_name": course.full_name,
                "attachment_names": [item.file_name for item in assignment.attachments][:20],
            }
        )
    return items, skipped


async def propose_import(
    service: MoodleService, backend: httpx.AsyncClient, site_host: str
) -> dict[str, Any]:
    items, skipped = await build_items(service, site_host)
    if not items:
        return {
            "proposal_id": None,
            "proposed": 0,
            "skipped_without_due_date": skipped,
            "skipped_existing": 0,
        }
    response = await backend.post("/imports/proposals", json={"source": SOURCE, "items": items})
    response.raise_for_status()
    body = response.json()
    proposal = body["proposal"]
    return {
        "proposal_id": proposal["id"] if proposal else None,
        "proposed": len(proposal["items"]) if proposal else 0,
        "skipped_without_due_date": skipped,
        "skipped_existing": body["skipped_existing"],
    }


async def _backend_client(settings: Settings) -> httpx.AsyncClient:
    base = str(settings.backend_url).rstrip("/")
    client = httpx.AsyncClient(base_url=base, timeout=30.0)
    if settings.backend_token is not None:
        token = settings.backend_token.get_secret_value()
    elif settings.backend_demo_login:
        login = await client.post("/auth/demo")
        login.raise_for_status()
        token = login.json()["access_token"]
    else:
        await client.aclose()
        raise SystemExit(
            "Set CAMPUSPULSE_BACKEND_TOKEN (or CAMPUSPULSE_BACKEND_DEMO_LOGIN=true for local dev)."
        )
    client.headers["Authorization"] = f"Bearer {token}"
    return client


async def run(settings: Settings) -> dict[str, Any]:
    moodle = MoodleClient(
        str(settings.moodle_url),
        settings.moodle_token.get_secret_value(),
        timeout=settings.moodle_timeout_seconds,
    )
    backend = await _backend_client(settings)
    try:
        host = urlsplit(str(settings.moodle_url)).netloc
        return await propose_import(MoodleService(moodle), backend, host)
    finally:
        await moodle.aclose()
        await backend.aclose()


def main() -> None:
    result = asyncio.run(run(Settings()))
    print(result)
    if result["proposal_id"]:
        print("Review and approve the proposal in CampusPulse: Assignments → Import from Moodle.")
    sys.exit(0)


if __name__ == "__main__":
    main()
