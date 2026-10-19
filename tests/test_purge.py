from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.catalog import COURSES, seed_catalog
from app.core.config import settings
from app.db import models
from app.db.session import get_session
from app.main import app
from app.purge import purge
from app.seeds import seed_demo_cohort

KEEP = "demo.student@campuspulse.example"


def db(client: TestClient):  # noqa: ANN201
    return next(app.dependency_overrides[get_session]())


def count(session, model) -> int:  # noqa: ANN001
    return session.scalar(select(func.count()).select_from(model)) or 0


def test_a_dry_run_reports_but_deletes_nothing(student: TestClient) -> None:
    session = db(student)
    before = count(session, models.Assignment)
    report = purge(session, [KEEP], apply=False)
    assert report["assignments"] == before > 0
    assert count(session, models.Assignment) == before and count(session, models.Course) > 0


def test_purge_removes_academic_data_and_other_users_but_keeps_the_account(
    student: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seed_demo_cohort(db(student))
    uploads = tmp_path / "uploads"
    (uploads / "someone").mkdir(parents=True)
    (uploads / "someone" / "brief.pdf").write_bytes(b"x")
    monkeypatch.setattr(settings, "upload_directory", str(uploads))
    session = db(student)

    report = purge(session, [KEEP], apply=True)
    assert report["users removed"] == 14
    for model in (
        models.Course,
        models.Assignment,
        models.Task,
        models.Document,
        models.Insight,
        models.ScheduleEvent,
        models.CampusEvent,
        models.AgentRun,
        models.Enrollment,
    ):
        assert count(session, model) == 0, model.__tablename__
    assert count(session, models.User) == 1
    kept = session.scalar(select(models.User))
    assert kept.email == KEEP and kept.institution_id is not None
    assert count(session, models.Role) == 3 and count(session, models.UserRole) == 1
    assert count(session, models.Institution) == 1 and count(session, models.Semester) == 1
    assert not any(uploads.rglob("*.pdf"))

    # The kept account can still sign in and sees an empty workspace.
    assert student.get("/api/v1/auth/me").status_code == 200
    assert student.get("/api/v1/assignments/overview").json()["total"] == 0


def test_the_catalog_creates_the_real_courses_and_enrolls_the_account(student: TestClient) -> None:
    session = db(student)
    purge(session, [KEEP], apply=True)
    assert seed_catalog(session, [KEEP]) == len(COURSES) == 6
    assert seed_catalog(session, [KEEP]) == 0  # idempotent
    courses = student.get("/api/v1/courses/overview").json()
    assert {c["name"] for c in courses} == {name for _, name, _ in COURSES}
    assert {c["instructor_name"] for c in courses} >= {"Dossumbekov Yerlan", "Bakiyeva Aigerim"}


def test_an_unknown_account_aborts_before_anything_is_deleted(student: TestClient) -> None:
    session = db(student)
    with pytest.raises(SystemExit):
        purge(session, ["nobody@example.com"], apply=True)
    assert count(session, models.Course) > 0
