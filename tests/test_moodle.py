import json
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest

from campuspulse_mcp.moodle.client import MoodleClient, MoodleError, flatten_params
from campuspulse_mcp.moodle.service import MoodleService, plain_text
from campuspulse_mcp.server import build_server

BASE = "https://moodle.test"
Handler = Callable[[str, dict[str, str]], Any]


def make_service(handler: Handler, **kwargs: Any) -> MoodleService:
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/webservice/rest/server.php"):
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            assert form["wstoken"] == "secret-token"
            return httpx.Response(200, json=handler(form["wsfunction"], form))
        return httpx.Response(200, content=b"lecture notes", request=request)

    client = MoodleClient(BASE, "secret-token", transport=httpx.MockTransport(respond))
    return MoodleService(client, **kwargs)


def api(function: str, form: dict[str, str]) -> Any:
    if function == "core_webservice_get_site_info":
        return {"sitename": "AITU Moodle", "release": "4.5", "userid": 7, "fullname": "Alex"}
    if function == "core_enrol_get_users_courses":
        assert form["userid"] == "7"
        return [
            {
                "id": 2,
                "shortname": "SE",
                "fullname": "Software Engineering",
                "startdate": 1_760_000_000,
                "enddate": 0,
                "progress": 41.5,
                "completed": False,
            }
        ]
    if function == "mod_assign_get_assignments":
        assert form["courseids[0]"] == "2"
        return {
            "courses": [
                {
                    "id": 2,
                    "assignments": [
                        {
                            "id": 11,
                            "cmid": 31,
                            "name": "Auth lab",
                            "duedate": 1_761_000_000,
                            "allowsubmissionsfromdate": 0,
                            "grade": 100,
                            "introattachments": [
                                {
                                    "filename": "brief.pdf",
                                    "filesize": 10,
                                    "fileurl": f"{BASE}/webservice/pluginfile.php/2/brief.pdf",
                                    "mimetype": "application/pdf",
                                }
                            ],
                            "intro": "<p>Implement <b>JWT</b>.</p>",
                        }
                    ],
                }
            ]
        }
    if function == "mod_assign_get_submission_status":
        return {
            "lastattempt": {"submission": {"status": "submitted", "timemodified": 1_760_500_000}},
            "feedback": {"grade": {"grade": "88.00"}},
        }
    if function == "core_course_get_contents":
        return [
            {
                "id": 5,
                "name": "Week 1",
                "modules": [
                    {
                        "id": 31,
                        "name": "Auth lab",
                        "modname": "assign",
                        "url": f"{BASE}/mod/assign/view.php?id=31",
                    },
                    {
                        "id": 32,
                        "name": "Notes",
                        "modname": "resource",
                        "contents": [
                            {
                                "type": "file",
                                "filename": "notes.txt",
                                "filesize": 13,
                                "fileurl": f"{BASE}/webservice/pluginfile.php/1/notes.txt",
                                "mimetype": "text/plain",
                                "timemodified": 1_760_000_000,
                            },
                            {"type": "url", "filename": "link"},
                        ],
                    },
                ],
            }
        ]
    if function == "core_calendar_get_action_events_by_timesort":
        return {
            "events": [
                {
                    "id": 2,
                    "name": "Later",
                    "timestart": 1_900_000_000,
                    "timeduration": 0,
                    "course": {"id": 2, "fullname": "SE"},
                    "modulename": "assign",
                    "eventtype": "due",
                    "action": {"actionable": True},
                },
                {"id": 1, "name": "Sooner", "timestart": 1_800_000_000, "timeduration": 3600},
            ]
        }
    raise AssertionError(function)


def test_flatten_params_encodes_nested_values() -> None:
    assert flatten_params({"courseids": [1, 2], "a": {"b": True}}) == {
        "courseids[0]": "1",
        "courseids[1]": "2",
        "a[b]": "1",
    }


def test_plain_text_strips_markup_and_limits() -> None:
    assert plain_text("<p>Hi <b>there</b></p>") == "Hi there"
    assert plain_text("x" * 50, limit=10).endswith("…")


async def test_courses_assignments_and_status() -> None:
    service = make_service(api)
    courses = await service.list_courses()
    assert courses[0].full_name == "Software Engineering" and courses[0].ends_at is None
    assignments = await service.list_assignments()
    assert assignments[0].description == "Implement JWT ." or assignments[0].description.startswith(
        "Implement"
    )
    assert assignments[0].due_at is not None and assignments[0].opens_at is None
    status = await service.submission_status(11)
    assert (status.status, status.graded, status.grade) == ("submitted", True, "88.00")


async def test_course_outline_and_files() -> None:
    service = make_service(api)
    sections = await service.course_contents(2)
    assert [m.module_type for m in sections[0].modules] == ["assign", "resource"]
    files = await service.list_files(2)
    assert [f.file_name for f in files] == ["notes.txt", "brief.pdf"]
    assert files[1].module == "Auth lab" and files[1].module_type == "assign"


async def test_calendar_is_sorted_soonest_first() -> None:
    events = await make_service(api).calendar_events()
    assert [e.title for e in events] == ["Sooner", "Later"]
    assert events[1].actionable and events[0].ends_at > events[0].starts_at


async def test_read_text_file_and_truncation() -> None:
    service = make_service(api, max_file_bytes=5)
    content = await service.read_file(f"{BASE}/webservice/pluginfile.php/1/notes.txt")
    assert content.text == "lectu" and content.truncated


async def test_binary_files_are_reported_not_downloaded() -> None:
    content = await make_service(api).read_file(f"{BASE}/webservice/pluginfile.php/1/slides.pdf")
    assert content.text is None and "ingestion" in content.note


async def test_download_never_leaves_the_moodle_host() -> None:
    with pytest.raises(MoodleError):
        await make_service(api).read_file("https://evil.example/leak.txt")


async def test_moodle_errors_are_raised_without_leaking_the_token() -> None:
    def failing(function: str, form: dict[str, str]) -> Any:
        return {
            "exception": "webservice_access_exception",
            "errorcode": "accessexception",
            "message": "Access control exception",
        }

    with pytest.raises(MoodleError) as caught:
        await make_service(failing).site_info()
    assert caught.value.code == "accessexception" and "secret-token" not in str(caught.value)


async def test_server_registers_only_read_only_tools() -> None:
    tools = await build_server(make_service(api)).list_tools()
    assert len(tools) == 8
    assert all(t.name.startswith("moodle_") for t in tools)
    assert all(t.annotations is not None and t.annotations.readOnlyHint for t in tools)


async def test_tool_call_returns_structured_data() -> None:
    server = build_server(make_service(api))
    _, structured = await server.call_tool("moodle_site_info", {})
    assert json.loads(json.dumps(structured))["user_id"] == 7
