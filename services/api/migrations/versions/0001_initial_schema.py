"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("device_type", sa.String(length=16), nullable=False),
        sa.Column("secret_hash", sa.String(length=64), nullable=False),
        sa.Column("pairing_code", sa.String(length=12), nullable=True),
        sa.Column("pairing_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("devices", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_devices_pairing_code"), ["pairing_code"], unique=False)
        batch_op.create_index(batch_op.f("ix_devices_secret_hash"), ["secret_hash"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("join_code", sa.String(length=8), nullable=False),
        sa.Column("title", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("device_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("queue_open", sa.Boolean(), nullable=False),
        sa.Column("intro_seconds", sa.Integer(), nullable=False),
        sa.Column("auto_skip_failed", sa.Boolean(), nullable=False),
        sa.Column("max_pending_per_guest", sa.Integer(), nullable=False),
        sa.Column("show_notifications", sa.Boolean(), nullable=False),
        sa.Column("current_item_id", sa.String(length=36), nullable=True),
        sa.Column("playback_phase", sa.String(length=16), nullable=False),
        sa.Column("paused", sa.Boolean(), nullable=False),
        sa.Column("restart_seq", sa.Integer(), nullable=False),
        sa.Column("playback_generation", sa.Integer(), nullable=False),
        sa.Column("position_seconds", sa.Float(), nullable=False),
        sa.Column("position_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("state_version", sa.Integer(), nullable=False),
        sa.Column("next_sequence", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_sessions_device_id"), ["device_id"], unique=False)
        batch_op.create_index("ix_sessions_join_code_status", ["join_code", "status"], unique=False)

    op.create_table(
        "participants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("display_name", sa.String(length=32), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("participants", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_participants_session_id"), ["session_id"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_participants_token_hash"), ["token_hash"], unique=True)

    op.create_table(
        "playback_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("queue_item_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("playback_generation", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(length=64), nullable=False),
        sa.Column("detail", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("playback_events", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_playback_events_session_id"), ["session_id"], unique=False
        )

    op.create_table(
        "queue_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("participant_id", sa.String(length=36), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("sort_key", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("provider_video_id", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("channel", sa.String(length=120), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("idempotency_key", sa.String(length=64), nullable=True),
        sa.Column("failure_reason", sa.String(length=120), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id", "participant_id", "idempotency_key", name="uq_queue_idempotency"
        ),
        sa.UniqueConstraint("session_id", "sequence_number", name="uq_queue_session_sequence"),
    )
    with op.batch_alter_table("queue_items", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_queue_items_participant_id"), ["participant_id"], unique=False
        )
        batch_op.create_index("ix_queue_session_status", ["session_id", "status"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("queue_items", schema=None) as batch_op:
        batch_op.drop_index("ix_queue_session_status")
        batch_op.drop_index(batch_op.f("ix_queue_items_participant_id"))

    op.drop_table("queue_items")
    with op.batch_alter_table("playback_events", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_playback_events_session_id"))

    op.drop_table("playback_events")
    with op.batch_alter_table("participants", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_participants_token_hash"))
        batch_op.drop_index(batch_op.f("ix_participants_session_id"))

    op.drop_table("participants")
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.drop_index("ix_sessions_join_code_status")
        batch_op.drop_index(batch_op.f("ix_sessions_device_id"))

    op.drop_table("sessions")
    with op.batch_alter_table("devices", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_devices_secret_hash"))
        batch_op.drop_index(batch_op.f("ix_devices_pairing_code"))

    op.drop_table("devices")
