from fastapi.testclient import TestClient

SE = "SE 3204"


def item(external_id: str, title: str, code: str = SE) -> dict[str, object]:
    return {
        "external_id": external_id,
        "title": title,
        "description": "From Moodle",
        "due_at": "2026-10-30T18:59:00Z",
        "external_course_code": code,
        "external_course_name": "Software Engineering",
        "attachment_names": ["brief.pdf"],
    }


def propose(client: TestClient, *items: dict[str, object]) -> dict[str, object]:
    response = client.post(
        "/api/v1/imports/proposals", json={"source": "moodle", "items": list(items)}
    )
    assert response.status_code == 201, response.text
    return response.json()


def assignment_titles(client: TestClient) -> list[str]:
    page = client.get("/api/v1/assignments/overview").json()
    return [row["title"] for row in page["items"]]


def test_proposal_matches_course_by_code_and_defaults_estimate(student: TestClient) -> None:
    result = propose(student, item("1", "Imported lab"), item("2", "Other", code="NOPE 1"))
    proposal = result["proposal"]
    assert isinstance(proposal, dict) and proposal["status"] == "pending"
    by_title = {row["title"]: row for row in proposal["items"]}
    assert by_title["Imported lab"]["course_id"] is not None
    assert by_title["Other"]["course_id"] is None
    assert by_title["Imported lab"]["estimated_hours"] == 2.0
    assert "Imported lab" not in assignment_titles(student)  # nothing written before approval


def test_apply_requires_a_course_for_selected_items(student: TestClient) -> None:
    proposal = propose(student, item("2", "Unmapped", code="NOPE 1"))["proposal"]
    assert isinstance(proposal, dict)
    response = student.post(f"/api/v1/imports/proposals/{proposal['id']}/apply")
    assert response.status_code == 422 and "Unmapped" in response.json()["detail"]


def test_apply_creates_assignments_once_and_is_idempotent(student: TestClient) -> None:
    proposal = propose(student, item("1", "Imported lab"), item("2", "Skipped one"))["proposal"]
    assert isinstance(proposal, dict)
    skipped = next(row for row in proposal["items"] if row["title"] == "Skipped one")
    student.patch(
        f"/api/v1/imports/proposals/{proposal['id']}/items/{skipped['id']}",
        json={"selected": False},
    )
    chosen = next(row for row in proposal["items"] if row["title"] == "Imported lab")
    student.patch(
        f"/api/v1/imports/proposals/{proposal['id']}/items/{chosen['id']}",
        json={"estimated_hours": 5.5},
    )
    applied = student.post(f"/api/v1/imports/proposals/{proposal['id']}/apply").json()
    assert applied["created"] == 1 and applied["proposal"]["status"] == "applied"
    titles = assignment_titles(student)
    assert "Imported lab" in titles and "Skipped one" not in titles

    again = student.post(f"/api/v1/imports/proposals/{proposal['id']}/apply").json()
    assert again["created"] == 0
    assert assignment_titles(student).count("Imported lab") == 1
    row = next(
        r
        for r in student.get("/api/v1/assignments/overview").json()["items"]
        if r["title"] == "Imported lab"
    )
    assert row["estimated_hours"] == 5.5


def test_already_imported_items_are_not_proposed_again(student: TestClient) -> None:
    proposal = propose(student, item("1", "Imported lab"))["proposal"]
    assert isinstance(proposal, dict)
    student.post(f"/api/v1/imports/proposals/{proposal['id']}/apply")
    repeat = student.post(
        "/api/v1/imports/proposals", json={"source": "moodle", "items": [item("1", "Imported lab")]}
    )
    assert repeat.json() == {"proposal": None, "skipped_existing": 1}


def test_dismissed_proposal_cannot_be_applied(student: TestClient) -> None:
    proposal = propose(student, item("1", "Imported lab"))["proposal"]
    assert isinstance(proposal, dict)
    assert (
        student.post(f"/api/v1/imports/proposals/{proposal['id']}/dismiss").json()["status"]
        == "dismissed"
    )
    assert student.post(f"/api/v1/imports/proposals/{proposal['id']}/apply").status_code == 409
    assert (
        student.get("/api/v1/imports/proposals", params={"proposal_status": "pending"}).json() == []
    )
    assert "Imported lab" not in assignment_titles(student)


def test_unknown_course_override_is_rejected(student: TestClient) -> None:
    proposal = propose(student, item("1", "Imported lab"))["proposal"]
    assert isinstance(proposal, dict)
    response = student.patch(
        f"/api/v1/imports/proposals/{proposal['id']}/items/{proposal['items'][0]['id']}",
        json={"course_id": "00000000-0000-0000-0000-0000000000ff"},
    )
    assert response.status_code == 404


def test_import_endpoints_require_authentication(student: TestClient) -> None:
    student.headers.pop("Authorization")
    assert student.get("/api/v1/imports/proposals").status_code == 401
