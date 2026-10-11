"""Database schema.

Naming note: the plan calls a party a "session". The table is `sessions`, but the ORM class is
`Party` so it never gets confused with a SQLAlchemy database session.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid.uuid4())


class UTCDateTime(TypeDecorator):
    """Timezone-aware UTC datetimes on every backend (SQLite stores them naive)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        value = value.astimezone(UTC)
        if dialect.name == "sqlite":
            return value.replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


# --- Enumerations (stored as short strings) -------------------------------------------------


class PartyStatus:
    LOBBY = "lobby"  # QR visible, guests joining/queueing, playback not started
    ACTIVE = "active"  # playback auto-advances through the queue
    ENDED = "ended"


class Phase:
    IDLE = "idle"  # nothing assigned to the player
    INTRO = "intro"  # current item assigned; TV shows "Up next" card and loads the video
    PLAYING = "playing"  # TV confirmed playback started
    ERROR = "error"  # current item failed and auto-skip is off; waiting for host


class ItemStatus:
    PENDING = "pending"
    PREPARING = "preparing"
    PLAYING = "playing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    SKIPPED = "skipped"

    ACTIVE = (PREPARING, PLAYING)
    HISTORY = (COMPLETED, FAILED, SKIPPED)


class Role:
    GUEST = "guest"
    HOST = "host"


# --- Tables ---------------------------------------------------------------------------------


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(64), default="Living Room TV")
    device_type: Mapped[str] = mapped_column(String(16), default="tv")
    secret_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    pairing_code: Mapped[str | None] = mapped_column(String(12), nullable=True, index=True)
    pairing_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    paired_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class Party(Base):
    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_join_code_status", "join_code", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    join_code: Mapped[str] = mapped_column(String(8))
    title: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16), default=PartyStatus.LOBBY)
    device_id: Mapped[str | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    # Settings
    queue_open: Mapped[bool] = mapped_column(Boolean, default=True)
    intro_seconds: Mapped[int] = mapped_column(Integer, default=8)
    auto_skip_failed: Mapped[bool] = mapped_column(Boolean, default=True)
    max_pending_per_guest: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unlimited
    show_notifications: Mapped[bool] = mapped_column(Boolean, default=True)

    # Playback state (authoritative)
    current_item_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    playback_phase: Mapped[str] = mapped_column(String(16), default=Phase.IDLE)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    restart_seq: Mapped[int] = mapped_column(Integer, default=0)
    playback_generation: Mapped[int] = mapped_column(Integer, default=0)
    position_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    position_updated_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    state_version: Mapped[int] = mapped_column(Integer, default=1)
    next_sequence: Mapped[int] = mapped_column(Integer, default=1)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    display_name: Mapped[str] = mapped_column(String(32))
    role: Mapped[str] = mapped_column(String(16), default=Role.GUEST)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    removed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class QueueItem(Base):
    __tablename__ = "queue_items"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence_number", name="uq_queue_session_sequence"),
        UniqueConstraint(
            "session_id", "participant_id", "idempotency_key", name="uq_queue_idempotency"
        ),
        Index("ix_queue_session_status", "session_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    participant_id: Mapped[str] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), index=True
    )
    # Immutable, server-assigned FIFO order. sort_key starts equal to FIFO order and only
    # changes when a host deliberately reorders the queue.
    sequence_number: Mapped[int] = mapped_column(Integer)
    sort_key: Mapped[int] = mapped_column(Integer)

    provider: Mapped[str] = mapped_column(String(16), default="youtube")
    provider_video_id: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))
    channel: Mapped[str] = mapped_column(String(120), default="")
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thumbnail_url: Mapped[str] = mapped_column(String(300), default="")

    # Duet partner: another guest in the party, or just a typed name (someone without a phone).
    partner_participant_id: Mapped[str | None] = mapped_column(
        ForeignKey("participants.id", ondelete="SET NULL"), nullable=True
    )
    partner_name: Mapped[str | None] = mapped_column(String(32), nullable=True)

    status: Mapped[str] = mapped_column(String(16), default=ItemStatus.PENDING)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class PlaybackEvent(Base):
    """Audit log of queue transitions, playback events and host actions."""

    __tablename__ = "playback_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    queue_item_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    event_type: Mapped[str] = mapped_column(String(32))
    playback_generation: Mapped[int] = mapped_column(Integer, default=0)
    actor: Mapped[str] = mapped_column(String(64), default="system")
    detail: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
