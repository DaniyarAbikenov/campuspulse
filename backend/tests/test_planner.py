from datetime import UTC, datetime

from fastapi.testclient import TestClient

WEEK = "2026-10-19"


def plan(client: TestClient) -> dict:
    response = client.get("/api/v1/schedule/plan", params={"week_start": WEEK})
    assert response.status_code == 200, response.text
    return response.json()


def test_preview_places_open_work_in_free_time_without_writing(student: TestClient) -> None:
    before = student.get("/api/v1/schedule", params={"week_start": WEEK}).json()["events"]
    proposed = plan(student)
    assert proposed["sessions"] and proposed["placed_hours"] > 0
    assert proposed["placed_hours"] == round(sum(s["hours"] for s in proposed["sessions"]), 2)
    assert student.get("/api/v1/schedule", params={"week_start": WEEK}).json()["events"] == before


def test_sessions_stay_inside_free_time_and_before_the_deadline(student: TestClient) -> None:
    proposed = plan(student)
    free = student.get("/api/v1/schedule/free-time", params={"week_start": WEEK}).json()
    assignments = {
        a["title"]: a["due_at"] for a in student.get("/api/v1/assignments/overview").json()["items"]
    }

    def parse(value: str) -> datetime:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)

    for item in proposed["sessions"]:
        start, end = parse(item["starts_at"]), parse(item["ends_at"])
        assert any(parse(f["starts_at"]) <= start and end <= parse(f["ends_at"]) for f in free)
        assert end <= parse(assignments[item["assignment_title"]])
        assert item["hours"] >= 0.5 and item["hours"] * 4 == int(item["hours"] * 4)
    ordered = sorted(proposed["sessions"], key=lambda s: s["starts_at"])
    for first, second in zip(ordered, ordered[1:], strict=False):
        assert parse(first["ends_at"]) <= parse(second["starts_at"])  # no overlaps


def test_apply_creates_linked_study_sessions_once(student: TestClient) -> None:
    proposed = plan(student)
    applied = student.post("/api/v1/schedule/plan/apply", params={"week_start": WEEK}).json()
    assert applied["created"] == len(proposed["sessions"])
    events = student.get("/api/v1/schedule", params={"week_start": WEEK}).json()["events"]
    study = [e for e in events if e["kind"] == "study_session" and e["task_id"]]
    assert len(study) >= len(proposed["sessions"])
    assert applied["plan"]["sessions"] == []  # nothing left to place: idempotent

    again = student.post("/api/v1/schedule/plan/apply", params={"week_start": WEEK}).json()
    assert again["created"] == 0
    workload = student.get("/api/v1/workload", params={"week_start": WEEK}).json()
    assert workload["scheduled_study_hours"] >= proposed["placed_hours"]


def test_work_that_does_not_fit_before_its_deadline_is_reported(student: TestClient) -> None:
    kanban = student.get("/api/v1/kanban").json()
    task = next(t for c in kanban["columns"] for t in c["tasks"] if t["status"] != "completed")
    student.patch(f"/api/v1/tasks/{task['id']}", json={"estimated_hours": 40.0})
    proposed = plan(student)
    assert any(item["task_id"] == task["id"] for item in proposed["unplaced"])
    assert proposed["unplaced_hours"] > 0


def test_completed_tasks_are_never_planned(student: TestClient) -> None:
    done = next(
        t
        for c in student.get("/api/v1/kanban").json()["columns"]
        for t in c["tasks"]
        if t["status"] == "completed"
    )
    ids = {s["task_id"] for s in plan(student)["sessions"]}
    assert done["id"] not in ids


def test_a_session_cannot_link_to_someone_elses_task(student: TestClient) -> None:
    response = student.post(
        "/api/v1/schedule-events",
        json={
            "user_id": student.get("/api/v1/auth/me").json()["id"],
            "title": "Study: ghost",
            "kind": "study_session",
            "starts_at": "2026-10-20T08:00:00Z",
            "ends_at": "2026-10-20T09:00:00Z",
            "task_id": "00000000-0000-0000-0000-00000000ffff",
        },
    )
    assert response.status_code in {403, 404, 409}


def test_planner_requires_authentication(student: TestClient) -> None:
    student.headers.pop("Authorization")
    assert student.get("/api/v1/schedule/plan").status_code == 401


def test_statistics_include_weekly_series_and_per_course_accuracy(student: TestClient) -> None:
    stats = student.get("/api/v1/statistics").json()
    assert len(stats["weekly"]) == 8
    assert stats["weekly"] == sorted(stats["weekly"], key=lambda w: w["week_start"])
    assert all(w["planned_hours"] >= 0 and w["actual_hours"] >= 0 for w in stats["weekly"])
    courses = {c["course_name"]: c for c in stats["by_course"]}
    assert courses  # seeded student has completed work
    for course in courses.values():
        assert course["actual_hours"] >= 0 and 0 <= course["estimate_accuracy_percent"] <= 100
