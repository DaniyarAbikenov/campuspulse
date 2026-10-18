import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def run_module(module: str, database_url: str, *arguments: str) -> None:
    environment = os.environ.copy()
    environment["CAMPUSPULSE_DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "-m", module, *arguments],
        check=True,
        env=environment,
        capture_output=True,
        text=True,
    )


def test_migration_round_trip_and_idempotent_seed(tmp_path: Path) -> None:
    database_path = tmp_path / "migration-test.db"
    database_url = f"sqlite:///{database_path}"

    run_module("alembic", database_url, "upgrade", "head")
    engine = create_engine(database_url)
    expected_tables = {
        "alembic_version",
        "auth_sessions",
        "assignment_relations",
        "assignments",
        "audit_events",
        "courses",
        "documents",
        "enrollments",
        "identity_accounts",
        "institutions",
        "roles",
        "schedule_events",
        "semesters",
        "tasks",
        "user_roles",
        "users",
    }
    assert set(inspect(engine).get_table_names()) == expected_tables

    run_module("app.seeds", database_url)
    run_module("app.seeds", database_url)
    with engine.connect() as connection:
        counts = {
            table: connection.scalar(text(f"SELECT COUNT(*) FROM {table}"))
            for table in ("roles", "users", "courses", "assignments", "tasks")
        }
    assert counts == {"roles": 3, "users": 1, "courses": 5, "assignments": 9, "tasks": 4}

    with engine.begin() as connection, pytest.raises(IntegrityError):
        connection.execute(text("UPDATE assignments SET status = 'invalid'"))

    engine.dispose()
    run_module("alembic", database_url, "downgrade", "base")
    downgraded_tables = set(inspect(create_engine(database_url)).get_table_names())
    assert downgraded_tables == {"alembic_version"}
    run_module("alembic", database_url, "upgrade", "head")
