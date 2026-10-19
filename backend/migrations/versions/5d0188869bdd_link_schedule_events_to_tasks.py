"""link schedule events to tasks

Revision ID: 5d0188869bdd
Revises: 64b0a5a89f17
Create Date: 2026-10-19 12:23:17.863960
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '5d0188869bdd'
down_revision: str | None = '64b0a5a89f17'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('schedule_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('task_id', sa.Uuid(), nullable=True))
        batch_op.create_index(batch_op.f('ix_schedule_events_task_id'), ['task_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_schedule_events_task_id_tasks', 'tasks', ['task_id'], ['id'], ondelete='SET NULL'
        )


def downgrade() -> None:
    with op.batch_alter_table('schedule_events', schema=None) as batch_op:
        batch_op.drop_constraint('fk_schedule_events_task_id_tasks', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_schedule_events_task_id'))
        batch_op.drop_column('task_id')
