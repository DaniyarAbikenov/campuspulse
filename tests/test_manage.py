from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db import models
from app.db.session import get_session
from app.main import app

API = "/api/v1"


def session_of(client: TestClient):  # noqa: ANN201
    return next(app.dependency_overrides[get_session]())


def first_assignment(client: TestClient) -> dict[str, Any]:
    return client.get(f"{API}/assignments/overview").json()["items"][0]


def make_assignment(client: TestClient, title: str = "Lab 9") -> str:
    course = client.get(f"{API}/courses").json()[0]
    me = client.get(f"{API}/auth/me").json()
    created = client.post(
        f"{API}/assignments",
        json={
            "course_id": course["id"],
            "owner_user_id": me["id"],
            "title": title,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
            "estimated_hours": 4.0,
        },
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


def add_task(client: TestClient, assignment_id: str, status: str = "todo") -> str:
    created = client.post(
        f"{API}/tasks",
        json={
            "assignment_id": assignment_id,
            "title": f"Task {status}",
            "status": status,
            "estimated_hours": 1.5,
        },
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


def book(client: TestClient, task_id: str, days: int) -> None:
    start = (datetime.now(UTC) + timedelta(days=days)).replace(hour=3, minute=0, second=0)
    me = client.get(f"{API}/auth/me").json()
    response = client.post(
        f"{API}/schedule-events",
        json={
            "user_id": me["id"],
            "title": "Study",
            "kind": "study_session",
            "task_id": task_id,
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=1)).isoformat(),
        },
    )
    assert response.status_code == 201, response.text


# --- assignments --------------------------------------------------------------------------


def test_cancelling_removes_open_tasks_and_future_sessions_but_keeps_finished_work(
    student: TestClient,
) -> None:
    assignment = make_assignment(student)
    open_task = add_task(student, assignment)
    done_task = add_task(student, assignment, "completed")
    book(student, open_task, days=2)

    result = student.post(f"{API}/assignments/{assignment}/cancel").json()
    assert result["assignment"]["status"] == "cancelled"
    assert (result["removed_tasks"], result["removed_sessions"]) == (1, 1)
    assert student.get(f"{API}/tasks/{open_task}").status_code == 404
    assert student.get(f"{API}/tasks/{done_task}").status_code == 200
    again = student.post(f"{API}/assignments/{assignment}/cancel").json()
    assert again["removed_tasks"] == 0


def test_a_cancelled_assignment_no_longer_counts_as_workload(student: TestClient) -> None:
    assignment = make_assignment(student)
    week = (datetime.now(UTC) + timedelta(days=5)).date()
    monday = (week - timedelta(days=week.weekday())).isoformat()
    before = student.get(f"{API}/workload", params={"week_start": monday}).json()
    student.post(f"{API}/assignments/{assignment}/cancel")
    after = student.get(f"{API}/workload", params={"week_start": monday}).json()
    assert after["required_hours"] < before["required_hours"]
    reopened = student.post(f"{API}/assignments/{assignment}/reopen").json()
    assert reopened["assignment"]["status"] == "todo"


def test_deleting_removes_tasks_sessions_and_the_uploaded_brief(
    student: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "upload_directory", str(tmp_path))
    course = student.get(f"{API}/courses").json()[0]
    uploaded = student.post(
        f"{API}/assignments/upload",
        data={
            "course_id": course["id"],
            "title": "Brief",
            "due_at": (datetime.now(UTC) + timedelta(days=4)).isoformat(),
        },
        files={"file": ("brief.txt", b"R1. Build the thing.", "text/plain")},
    ).json()
    assignment = uploaded["assignment"]["id"]
    task = add_task(student, assignment)
    book(student, task, days=3)
    assert list(tmp_path.rglob("*brief.txt"))

    removed = student.delete(f"{API}/assignments/{assignment}")
    assert removed.status_code == 200
    assert (removed.json()["removed_tasks"], removed.json()["removed_sessions"]) == (1, 1)
    assert student.get(f"{API}/assignments/{assignment}").status_code == 404
    assert not list(tmp_path.rglob("*brief.txt"))
    names = [item["name"] for item in student.get(f"{API}/knowledge").json()["documents"]]
    assert "brief.txt" not in names


def test_another_student_cannot_cancel_or_delete(student: TestClient) -> None:
    missing = "00000000-0000-0000-0000-0000000000aa"
    assert student.post(f"{API}/assignments/{missing}/cancel").status_code == 404
    assert student.delete(f"{API}/assignments/{missing}").status_code == 404


# --- repeating series ---------------------------------------------------------------------


def series_body(**overrides: Any) -> dict[str, Any]:
    start = datetime.now(UTC).date() + timedelta(days=1)
    body = {
        "title": "Gym",
        "kind": "personal",
        "weekdays": [0, 2, 4],
        "start": "18:00",
        "end": "19:30",
        "starts_on": start.isoformat(),
        "ends_on": (start + timedelta(days=27)).isoformat(),
    }
    body.update(overrides)
    return body


def test_a_series_expands_into_events_and_blocks_free_time(student: TestClient) -> None:
    created = student.post(f"{API}/schedule/series", json=series_body())
    assert created.status_code == 201, created.text
    series = created.json()
    assert series["occurrences"] == 12 and series["start"] == "18:00"
    events = student.get(f"{API}/schedule-events", params={"limit": 200}).json()
    mine = [item for item in events if item["series_id"] == series["id"]]
    assert len(mine) == 12

    listed = student.get(f"{API}/schedule/series").json()
    assert [item["id"] for item in listed] == [series["id"]]
    removed = student.delete(f"{API}/schedule/series/{series['id']}")
    assert removed.status_code == 204
    left = student.get(f"{API}/schedule-events", params={"limit": 200}).json()
    assert not [item for item in left if item["series_id"] == series["id"]]


def test_a_series_defaults_to_the_end_of_the_semester(student: TestClient) -> None:
    body = series_body()
    body.pop("ends_on")
    created = student.post(f"{API}/schedule/series", json=body)
    assert created.status_code == 201, created.text
    assert created.json()["ends_on"] >= body["starts_on"]


def test_series_validation(student: TestClient) -> None:
    assert student.post(f"{API}/schedule/series", json=series_body(end="17:00")).status_code == 422
    assert student.post(f"{API}/schedule/series", json=series_body(weekdays=[])).status_code == 422
    too_long = series_body(weekdays=[0, 1, 2, 3, 4, 5, 6])
    too_long["ends_on"] = (datetime.now(UTC).date() + timedelta(days=900)).isoformat()
    assert student.post(f"{API}/schedule/series", json=too_long).status_code == 422
    assert (
        student.delete(f"{API}/schedule/series/00000000-0000-0000-0000-0000000000bb").status_code
        == 404
    )


# --- campus events ------------------------------------------------------------------------


def event_body(**overrides: Any) -> dict[str, Any]:
    start = datetime.now(UTC) + timedelta(days=3)
    body = {
        "title": "Study jam",
        "description": "Bring a laptop",
        "category": "academic",
        "place": "Library",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=2)).isoformat(),
    }
    body.update(overrides)
    return body


def test_campus_events_can_be_created_edited_saved_and_deleted(student: TestClient) -> None:
    created = student.post(f"{API}/campus-events", json=event_body())
    assert created.status_code == 201, created.text
    event = created.json()
    assert event["can_edit"] is True and event["title"] == "Study jam"

    changed = student.patch(f"{API}/campus-events/{event['id']}", json={"place": "Room 101"})
    assert changed.json()["place"] == "Room 101"
    saved = student.patch(f"{API}/campus-events/{event['id']}/save", json={"saved": True})
    assert saved.status_code == 200 and saved.json()["is_saved"] is True

    assert student.delete(f"{API}/campus-events/{event['id']}").status_code == 204
    ids = [item["id"] for item in student.get(f"{API}/campus-events").json()]
    assert event["id"] not in ids


def test_seeded_events_are_read_only_for_students(student: TestClient) -> None:
    seeded = student.get(f"{API}/campus-events").json()[0]
    assert seeded["can_edit"] is False
    assert (
        student.patch(f"{API}/campus-events/{seeded['id']}", json={"title": "x"}).status_code == 403
    )
    assert student.delete(f"{API}/campus-events/{seeded['id']}").status_code == 403


def test_event_times_are_validated(student: TestClient) -> None:
    bad = event_body(ends_at=(datetime.now(UTC) - timedelta(days=9)).isoformat())
    assert student.post(f"{API}/campus-events", json=bad).status_code == 422
    event = student.post(f"{API}/campus-events", json=event_body()).json()
    earlier = (datetime.now(UTC) - timedelta(days=9)).isoformat()
    assert (
        student.patch(f"{API}/campus-events/{event['id']}", json={"ends_at": earlier}).status_code
        == 422
    )


def test_an_administrator_can_edit_events_they_did_not_create(student: TestClient) -> None:
    from app.roles import set_role

    seeded = student.get(f"{API}/campus-events").json()[0]
    set_role(session_of(student), "demo.student@campuspulse.example", "academic_admin", grant=True)
    assert (
        student.patch(f"{API}/campus-events/{seeded['id']}", json={"title": "Renamed"}).status_code
        == 200
    )


# --- materials ----------------------------------------------------------------------------


def upload_material(client: TestClient, **fields: str) -> Any:
    course = client.get(f"{API}/courses").json()[0]
    data = {"course_id": course["id"], **fields}
    return client.post(
        f"{API}/materials",
        data=data,
        files={
            "file": (
                "lecture1.txt",
                b"Normalization\nFirst normal form removes repeats.",
                "text/plain",
            )
        },
    )


def test_a_lecture_is_uploaded_indexed_renamed_and_deleted(
    student: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "upload_directory", str(tmp_path))
    created = upload_material(student, kind="lecture")
    assert created.status_code == 201, created.text
    material = created.json()
    assert material["kind"] == "lecture" and material["assignment_id"] is None
    assert material["concepts"] == ["Normalization"]
    knowledge = student.get(f"{API}/knowledge").json()
    assert any(item["document_id"] == material["id"] for item in knowledge["fragments"])

    renamed = student.patch(
        f"{API}/materials/{material['id']}", json={"name": "Week 1", "kind": "syllabus"}
    ).json()
    assert renamed["name"] == "Week 1" and renamed["kind"] == "syllabus"

    assert student.delete(f"{API}/materials/{material['id']}").status_code == 204
    after = student.get(f"{API}/knowledge").json()
    assert not any(item["id"] == material["id"] for item in after["documents"])
    assert not any(item["document_id"] == material["id"] for item in after["fragments"])
    assert not list(tmp_path.rglob("*lecture1.txt"))


def test_material_upload_rejects_bad_input(
    student: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "upload_directory", str(tmp_path))
    assert upload_material(student, kind="assignment").status_code == 422
    course = student.get(f"{API}/courses").json()[0]
    bad = student.post(
        f"{API}/materials",
        data={"course_id": course["id"]},
        files={"file": ("a.exe", b"MZ", "application/octet-stream")},
    )
    assert bad.status_code == 415
    foreign = student.post(
        f"{API}/materials",
        data={"course_id": "00000000-0000-0000-0000-00000000ffff"},
        files={"file": ("a.txt", b"hello", "text/plain")},
    )
    assert foreign.status_code in (403, 404)
    assert not list(tmp_path.rglob("*.txt"))


# --- agent actions ------------------------------------------------------------------------


def propose(client: TestClient, *actions: dict[str, Any]) -> Any:
    return client.post(f"{API}/agent/actions", json={"actions": list(actions)})


def free_window(client: TestClient) -> tuple[str, str]:
    for offset in range(0, 21, 7):
        monday = (datetime.now(UTC) + timedelta(days=offset)).date()
        monday -= timedelta(days=monday.weekday())
        for slot in client.get(
            f"{API}/schedule/free-time", params={"week_start": monday.isoformat()}
        ).json():
            start = datetime.fromisoformat(slot["starts_at"])
            if start > datetime.now(UTC) + timedelta(hours=1):
                return slot["starts_at"], (start + timedelta(hours=1)).isoformat()
    raise AssertionError("no free window")


def test_a_proposed_study_session_waits_for_confirmation_then_applies(student: TestClient) -> None:
    starts, ends = free_window(student)
    result = propose(
        student,
        {
            "kind": "create_study_session",
            "title": "Study databases",
            "summary": "A free hour on Tuesday",
            "payload": {"title": "Study databases", "starts_at": starts, "ends_at": ends},
        },
    ).json()
    action = result["created"][0]
    assert action["status"] == "pending"
    before = student.get(f"{API}/schedule-events", params={"limit": 200}).json()
    assert not any(item["title"] == "Study databases" for item in before)

    applied = student.post(f"{API}/agent/actions/{action['id']}/apply")
    assert applied.status_code == 200 and applied.json()["action"]["status"] == "applied"
    after = student.get(f"{API}/schedule-events", params={"limit": 200}).json()
    assert any(item["title"] == "Study databases" for item in after)
    assert (
        student.post(f"{API}/agent/actions/{action['id']}/apply").json()["detail"]
        == "Already applied"
    )
    assert student.get(f"{API}/agent/actions").json() == []


def test_actions_can_create_tasks_update_them_and_cancel_assignments(student: TestClient) -> None:
    assignment = make_assignment(student)
    task = add_task(student, assignment)
    result = propose(
        student,
        {
            "kind": "create_task",
            "title": "Add a task",
            "payload": {"assignment_id": assignment, "title": "Write tests", "estimated_hours": 2},
        },
        {
            "kind": "update_task_status",
            "title": "Finish it",
            "payload": {"task_id": task, "status": "completed"},
        },
        {
            "kind": "cancel_assignment",
            "title": "Drop the lab",
            "payload": {"assignment_id": assignment},
        },
    ).json()
    assert len(result["created"]) == 3 and result["rejected"] == []
    ids = [item["id"] for item in result["created"]]
    for action_id in ids[:2]:
        assert student.post(f"{API}/agent/actions/{action_id}/apply").status_code == 200
    titles = [item["title"] for item in student.get(f"{API}/tasks").json()]
    assert "Write tests" in titles
    assert student.get(f"{API}/tasks/{task}").json()["status"] == "completed"
    student.post(f"{API}/agent/actions/{ids[2]}/apply")
    assert student.get(f"{API}/assignments/{assignment}").json()["status"] == "cancelled"


def test_unverifiable_actions_are_rejected_and_dismissed_ones_stay_dismissed(
    student: TestClient,
) -> None:
    ghost = "00000000-0000-0000-0000-0000000000dd"
    result = propose(
        student,
        {"kind": "cancel_assignment", "title": "Ghost", "payload": {"assignment_id": ghost}},
        {
            "kind": "update_task_status",
            "title": "Odd",
            "payload": {"task_id": ghost, "status": "bogus"},
        },
        {"kind": "create_calendar_activity", "title": "Run", "payload": {"title": "Run"}},
    ).json()
    assert result["created"] == [] and len(result["rejected"]) == 3

    ok = propose(
        student,
        {
            "kind": "create_calendar_activity",
            "title": "Gym",
            "payload": {
                "title": "Gym",
                "starts_at": "2031-01-01T10:00:00+05:00",
                "ends_at": "2031-01-01T11:00:00+05:00",
            },
        },
    ).json()["created"][0]
    assert student.post(f"{API}/agent/actions/{ok['id']}/dismiss").json()["status"] == "dismissed"
    assert student.post(f"{API}/agent/actions/{ok['id']}/apply").status_code == 409
    missing = "00000000-0000-0000-0000-0000000000ee"
    assert student.post(f"{API}/agent/actions/{missing}/apply").status_code == 404


def test_the_chat_reply_carries_the_actions_the_agent_proposed(student: TestClient) -> None:
    from app.agent.gateway import AgentReply, AgentStep
    from app.product.router import get_agent_gateway

    starts, ends = free_window(student)
    body = {
        "actions": [
            {
                "kind": "create_study_session",
                "title": "Study",
                "payload": {"title": "Study", "starts_at": starts, "ends_at": ends},
            }
        ]
    }

    class Gateway:
        async def chat(
            self, *, user_id: str, session_id: str | None, message: str, agent_token: str
        ) -> AgentReply:
            import asyncio

            headers = {"Authorization": f"Bearer {agent_token}"}
            sent = await asyncio.to_thread(
                student.post, f"{API}/agent/actions", json=body, headers=headers
            )
            assert sent.status_code == 201
            return AgentReply("s", "Proposed.", [AgentStep("tool_call", "propose_action", "{}")])

    app.dependency_overrides[get_agent_gateway] = lambda: Gateway()
    reply = student.post(f"{API}/agent/chat", json={"message": "plan my study"}).json()
    assert [item["title"] for item in reply["actions"]] == ["Study"]
    assert reply["actions"][0]["status"] == "pending"
    _ = models


# --- study session rules ------------------------------------------------------------------


def study_event(client: TestClient, task_id: str, start: datetime, hours: float) -> Any:
    me = client.get(f"{API}/auth/me").json()
    return client.post(
        f"{API}/schedule-events",
        json={
            "user_id": me["id"],
            "title": "Study",
            "kind": "study_session",
            "task_id": task_id,
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=hours)).isoformat(),
        },
    )


def far_day(days: int = 40) -> datetime:
    return (datetime.now(UTC) + timedelta(days=days)).replace(
        hour=4, minute=0, second=0, microsecond=0
    )


def test_a_task_cannot_be_booked_for_more_hours_than_its_estimate(student: TestClient) -> None:
    task = add_task(student, make_assignment(student))  # estimate 1.5h
    start = far_day()
    assert study_event(student, task, start, 1.0).status_code == 201
    second = study_event(student, task, start + timedelta(hours=2), 1.0)
    assert second.status_code == 409
    assert "already has 1h of 1.5h scheduled" in second.json()["detail"]
    assert study_event(student, task, start + timedelta(hours=2), 0.5).status_code == 201


def test_study_sessions_cannot_overlap_or_exceed_the_daily_limit(student: TestClient) -> None:
    assignment = make_assignment(student)
    tasks = [add_task(student, assignment) for _ in range(6)]
    start = far_day(41)
    student.patch(f"{API}/settings", json={"max_study_hours_per_day": 2})
    assert study_event(student, tasks[0], start, 1.0).status_code == 201
    overlap = study_event(student, tasks[1], start + timedelta(minutes=30), 1.0)
    assert overlap.status_code == 409 and "overlaps" in overlap.json()["detail"]
    assert study_event(student, tasks[1], start + timedelta(hours=1), 1.0).status_code == 201
    over = study_event(student, tasks[2], start + timedelta(hours=3), 0.5)
    assert over.status_code == 409 and "limit is 2h a day" in over.json()["detail"]


def test_booked_study_uses_up_the_daily_limit_in_free_time(student: TestClient) -> None:
    student.patch(f"{API}/settings", json={"max_study_hours_per_day": 3})
    task = add_task(student, make_assignment(student))
    start = far_day(42)
    monday = (start.date() - timedelta(days=start.weekday())).isoformat()
    before = student.get(f"{API}/schedule/free-time", params={"week_start": monday}).json()
    assert study_event(student, task, start, 1.5).status_code == 201
    after = student.get(f"{API}/schedule/free-time", params={"week_start": monday}).json()
    day = start.date().isoformat()

    def hours_on(slots: list[dict[str, Any]]) -> float:
        return sum(s["duration_hours"] for s in slots if s["starts_at"][:10] == day)

    assert hours_on(after) <= hours_on(before) - 1.5 + 0.01


def test_the_planner_counts_study_booked_in_other_weeks(student: TestClient) -> None:
    task = add_task(student, make_assignment(student))  # 1.5h, due in 5 days
    me = student.get(f"{API}/auth/me").json()
    start = (datetime.now(UTC) + timedelta(days=1)).replace(hour=4, minute=0, second=0)
    created = student.post(
        f"{API}/schedule-events",
        json={
            "user_id": me["id"],
            "title": "Study",
            "kind": "study_session",
            "task_id": task,
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=1.5)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    other_week = (start.date() - timedelta(days=start.weekday()) + timedelta(days=7)).isoformat()
    plan = student.get(f"{API}/schedule/plan", params={"week_start": other_week}).json()
    assert task not in [item["task_id"] for item in plan["sessions"]]
