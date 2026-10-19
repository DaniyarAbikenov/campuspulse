"""add cancelled assignments, schedule series, event owners and agent actions

Revision ID: ce905101bc5a
Revises: bd928539c7ee
Create Date: 2026-10-19 19:13:19.044602
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'ce905101bc5a'
down_revision: str | None = 'bd928539c7ee'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


OLD_STATUSES = "'upcoming', 'todo', 'in_progress', 'completed'"
NEW_STATUSES = OLD_STATUSES + ", 'cancelled'"


def upgrade() -> None:
    with op.batch_alter_table('assignments', schema=None) as batch_op:
        batch_op.drop_constraint('assignment_status', type_='check')
        batch_op.create_check_constraint('assignment_status', f'status IN ({NEW_STATUSES})')

    op.create_table('agent_actions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.Enum('create_study_session', 'create_calendar_activity', 'create_task', 'update_task_status', 'cancel_assignment', name='agent_action_kind', native_enum=False, create_constraint=True), nullable=False),
    sa.Column('title', sa.String(length=240), nullable=False),
    sa.Column('summary', sa.Text(), nullable=False),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'applied', 'dismissed', name='agent_action_status', native_enum=False, create_constraint=True), nullable=False),
    sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('agent_actions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_agent_actions_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_agent_actions_user_id'), ['user_id'], unique=False)

    op.create_table('schedule_series',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=240), nullable=False),
    sa.Column('kind', sa.Enum('class_session', 'study_session', 'deadline', 'campus_event', 'personal', name='schedule_series_kind', native_enum=False, create_constraint=True), nullable=False),
    sa.Column('weekdays', sa.JSON(), nullable=False),
    sa.Column('start_minute', sa.Integer(), nullable=False),
    sa.Column('end_minute', sa.Integer(), nullable=False),
    sa.Column('starts_on', sa.Date(), nullable=False),
    sa.Column('ends_on', sa.Date(), nullable=False),
    sa.Column('location', sa.String(length=240), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('end_minute > start_minute', name='ck_schedule_series_time'),
    sa.CheckConstraint('ends_on >= starts_on', name='ck_schedule_series_range'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('schedule_series', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_schedule_series_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('campus_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_by_user_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key('fk_campus_events_created_by_user_id_users', 'users', ['created_by_user_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('schedule_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('series_id', sa.Uuid(), nullable=True))
        batch_op.create_index(batch_op.f('ix_schedule_events_series_id'), ['series_id'], unique=False)
        batch_op.create_foreign_key('fk_schedule_events_series_id_schedule_series', 'schedule_series', ['series_id'], ['id'], ondelete='CASCADE')



def downgrade() -> None:
    with op.batch_alter_table('schedule_events', schema=None) as batch_op:
        batch_op.drop_constraint('fk_schedule_events_series_id_schedule_series', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_schedule_events_series_id'))
        batch_op.drop_column('series_id')

    with op.batch_alter_table('campus_events', schema=None) as batch_op:
        batch_op.drop_constraint('fk_campus_events_created_by_user_id_users', type_='foreignkey')
        batch_op.drop_column('created_by_user_id')

    with op.batch_alter_table('schedule_series', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_schedule_series_user_id'))

    op.drop_table('schedule_series')
    with op.batch_alter_table('agent_actions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_agent_actions_user_id'))
        batch_op.drop_index(batch_op.f('ix_agent_actions_status'))

    op.drop_table('agent_actions')

    op.execute("UPDATE assignments SET status = 'completed' WHERE status = 'cancelled'")
    with op.batch_alter_table('assignments', schema=None) as batch_op:
        batch_op.drop_constraint('assignment_status', type_='check')
        batch_op.create_check_constraint('assignment_status', f'status IN ({OLD_STATUSES})')
