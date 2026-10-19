"""scope assignments to users

Revision ID: b41dad6e6aeb
Revises: 20b0f28e6d74
Create Date: 2026-10-19 00:32:55.371122
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b41dad6e6aeb"
down_revision: str | None = "20b0f28e6d74"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("assignments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.Uuid(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_assignments_owner_user_id"), ["owner_user_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_assignments_owner_user_id_users",
            "users",
            ["owner_user_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.execute(
        sa.text(
            """
            UPDATE assignments
            SET owner_user_id = (
                SELECT enrollments.user_id
                FROM enrollments
                WHERE enrollments.course_id = assignments.course_id
                ORDER BY enrollments.created_at, enrollments.id
                LIMIT 1
            )
            WHERE owner_user_id IS NULL
            """
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("assignments", schema=None) as batch_op:
        batch_op.drop_constraint("fk_assignments_owner_user_id_users", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_assignments_owner_user_id"))
        batch_op.drop_column("owner_user_id")
