"""Grant or revoke a role from the command line.

    python -m app.roles grant someone@example.com academic_admin
    python -m app.roles revoke someone@example.com academic_admin

Roles are administrative decisions, so they are never self-service through the API.
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import SessionLocal

KNOWN_ROLES = {"student", "academic_admin", "platform_admin"}


def set_role(session: Session, email: str, code: str, *, grant: bool) -> str:
    if code not in KNOWN_ROLES:
        raise SystemExit(f"Unknown role {code!r}; choose one of {sorted(KNOWN_ROLES)}")
    user = session.scalar(select(models.User).where(models.User.email == email.lower()))
    if user is None:
        raise SystemExit(f"No user with email {email}; they must sign in once first")
    role = session.scalar(select(models.Role).where(models.Role.code == code))
    if role is None:
        raise SystemExit(f"Role {code} does not exist; run the seeder first")
    link = session.scalar(
        select(models.UserRole).where(
            models.UserRole.user_id == user.id, models.UserRole.role_id == role.id
        )
    )
    if grant and link is None:
        session.add(models.UserRole(user_id=user.id, role_id=role.id))
        message = f"Granted {code} to {email}"
    elif not grant and link is not None:
        session.delete(link)
        message = f"Revoked {code} from {email}"
    else:
        message = f"{email} already {'has' if grant else 'lacks'} {code}"
    if grant and code == "academic_admin" and user.institution_id is None:
        message += " (note: the user has no institution yet; finish onboarding first)"
    session.commit()
    return message


def main(argv: list[str]) -> None:
    if len(argv) != 3 or argv[0] not in {"grant", "revoke"}:
        raise SystemExit(__doc__)
    with SessionLocal() as session:
        print(set_role(session, argv[1], argv[2], grant=argv[0] == "grant"))


if __name__ == "__main__":
    main(sys.argv[1:])
