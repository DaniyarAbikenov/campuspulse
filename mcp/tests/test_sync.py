import json
from typing import Any

import httpx

from campuspulse_mcp.moodle.client import MoodleClient
from campuspulse_mcp.moodle.service import MoodleService
from campuspulse_mcp.sync import build_items, propose_import

BASE = "https://moodle.test"


def moodle_service() -> MoodleService:
    def respond(request: httpx.Request) -> httpx.Response:
        function = dict(item.split("=", 1) for item in request.content.decode().split("&"))[
            "wsfunction"
        ]
        data: Any
        if function == "core_webservice_get_site_info":
            data = {"sitename": "M", "userid": 7, "fullname": "A"}
        elif function == "core_enrol_get_users_courses":
            data = [{"id": 2, "shortname": "SE 3204", "fullname": "Software Engineering"}]
        else:
            data = {
                "courses": [
                    {
                        "id": 2,
                        "assignments": [
                            {
                                "id": 11,
                                "cmid": 31,
                                "name": "Auth lab",
                                "duedate": 1_761_000_000,
                                "intro": "<p>JWT</p>",
                                "introattachments": [{"filename": "brief.pdf", "fileurl": "u"}],
                            },
                            {"id": 12, "cmid": 32, "name": "Undated", "duedate": 0, "intro": ""},
                        ],
                    }
                ]
            }
        return httpx.Response(200, json=data)

    return MoodleService(MoodleClient(BASE, "t", transport=httpx.MockTransport(respond)))


async def test_items_use_course_code_and_skip_undated_assignments() -> None:
    items, skipped = await build_items(moodle_service(), "moodle.test")
    assert skipped == 1 and len(items) == 1
    assert items[0]["external_id"] == "moodle.test/assign/11"
    assert items[0]["external_course_code"] == "SE 3204"
    assert items[0]["attachment_names"] == ["brief.pdf"]
    assert items[0]["due_at"].endswith("+00:00")


async def test_propose_import_posts_a_proposal_not_assignments() -> None:
    sent: list[httpx.Request] = []

    def backend(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(
            201,
            json={"proposal": {"id": "p1", "items": [{}]}, "skipped_existing": 0},
        )

    client = httpx.AsyncClient(base_url="http://api.test", transport=httpx.MockTransport(backend))
    result = await propose_import(moodle_service(), client, "moodle.test")
    assert result == {
        "proposal_id": "p1",
        "proposed": 1,
        "skipped_without_due_date": 1,
        "skipped_existing": 0,
    }
    assert [r.url.path for r in sent] == ["/imports/proposals"]
    assert json.loads(sent[0].content)["source"] == "moodle"
