"""Wipe academic and demo data while keeping chosen accounts, roles and the institution.

    python -m app.purge --keep you@example.com                 # dry run: counts only
    python -m app.purge --keep you@example.com --yes           # really delete
    python -m app.purge --keep you@example.com --yes --catalog # ...then create the course catalog

Kept: the named users (with their identities, sessions, roles and settings), the role
definitions, institutions and semesters. Everything else, including uploaded files, goes.
"""

import argparse
import shutil
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.catalog import seed_catalog
from app.core.config import settings
from app.db import models
from app.db.session import SessionLocal

# Children before parents, so the order is correct even without ON DELETE CASCADE.
ACADEMIC_TABLES: list[type[models.Base]] = [
    models.AgentAction,
    models.AgentToolCall,
    models.AgentRun,
    models.ImportItem,
    models.ImportProposal,
    models.TaskPlanItem,
    models.TaskPlan,
    models.Insight,
    models.ScheduleEvent,
    models.ScheduleSeries,
    models.CampusEventMatch,
    models.CampusEvent,
    models.DocumentFragment,
    models.Document,
    models.AssignmentRelation,
    models.Task,
    models.Assignment,
    models.Enrollment,
    models.Course,
]
USER_TABLES: list[tuple[type[models.Base], str]] = [
    (models.AuthSession, "user_id"),
    (models.IdentityAccount, "user_id"),
    (models.UserRole, "user_id"),
    (models.UserSettings, "user_id"),
]


def _count(session: Session, model: type[models.Base]) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def purge(session: Session, keep_emails: list[str], *, apply: bool) -> dict[str, int]:
    kept = list(
        session.scalars(
            select(models.User).where(models.User.email.in_([e.lower() for e in keep_emails]))
        )
    )
    missing = {e.lower() for e in keep_emails} - {user.email for user in kept}
    if missing or not kept:
        raise SystemExit(f"No such user(s): {sorted(missing) or keep_emails}. Nothing was changed.")
    kept_ids = [user.id for user in kept]
    removed_users = list(
        session.scalars(select(models.User).where(models.User.id.not_in(kept_ids)))
    )
    removed_ids = [user.id for user in removed_users]

    report = {model.__tablename__: _count(session, model) for model in ACADEMIC_TABLES}
    report["users removed"] = len(removed_users)
    if not apply:
        return report

    for model in ACADEMIC_TABLES:
        session.execute(delete(model))
    if removed_ids:
        for model, column in USER_TABLES:
            session.execute(delete(model).where(getattr(model, column).in_(removed_ids)))
        session.execute(
            delete(models.AuditEvent).where(models.AuditEvent.actor_user_id.in_(removed_ids))
        )
        session.execute(delete(models.User).where(models.User.id.in_(removed_ids)))
    session.commit()
    _remove_uploaded_files()
    return report


def _remove_uploaded_files() -> None:
    directory = Path(settings.upload_directory)
    if directory.exists():
        shutil.rmtree(directory)
        directory.mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "--keep", action="append", required=True, help="email of an account to keep"
    )
    parser.add_argument("--yes", action="store_true", help="actually delete (default is a dry run)")
    parser.add_argument(
        "--catalog", action="store_true", help="create the course catalog afterwards"
    )
    args = parser.parse_args()
    with SessionLocal() as session:
        report = purge(session, args.keep, apply=args.yes)
        print(("PURGED" if args.yes else "DRY RUN (nothing deleted)") + ":")
        for name, count in report.items():
            print(f"  {name}: {count}")
        if args.yes and args.catalog:
            created = seed_catalog(session, args.keep)
            print(f"Catalog: {created} courses created and the kept accounts enrolled.")


if __name__ == "__main__":
    main()
