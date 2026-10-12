from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PartyStatusT = Literal["lobby", "active", "ended"]
PhaseT = Literal["idle", "intro", "playing", "error"]
ItemStatusT = Literal[
    "pending", "preparing", "playing", "completed", "cancelled", "failed", "skipped"
]
RoleT = Literal["guest", "host"]


def clean_display_name(value: str) -> str:
    name = " ".join("".join(ch for ch in value if ch.isprintable()).split())
    if not 1 <= len(name) <= 24:
        raise ValueError("Name must be 1–24 characters")
    return name


# The set of pictures lives in the web app; the server only checks the key's shape.
AvatarKey = Annotated[str, Field(max_length=24, pattern=r"^[a-z][a-z0-9-]*$")]


# --- Room state (REST responses and WebSocket broadcasts) ------------------------------------


class ParticipantOut(BaseModel):
    id: str
    display_name: str
    avatar: str | None = None
    role: RoleT
    joined_at: datetime
    online: bool = False


class QueueItemOut(BaseModel):
    id: str
    participant_id: str
    singer: str
    partner_id: str | None = None  # duet partner who joined the party
    partner: str | None = None  # duet partner's name (a guest, or typed by the requester)
    sequence: int
    video_id: str
    title: str
    channel: str
    duration_seconds: int | None
    thumbnail_url: str
    status: ItemStatusT
    requested_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    failure_reason: str | None


class PlaybackOut(BaseModel):
    phase: PhaseT
    item_id: str | None
    generation: int
    paused: bool
    restart_seq: int
    position_seconds: float
    position_updated_at: datetime | None


class SessionOut(BaseModel):
    id: str
    join_code: str
    title: str
    status: PartyStatusT
    queue_open: bool
    intro_seconds: int
    auto_skip_failed: bool
    max_pending_per_guest: int
    show_notifications: bool
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None


class RoomState(BaseModel):
    type: Literal["room_state"] = "room_state"
    version: int
    server_time: datetime
    session: SessionOut
    playback: PlaybackOut
    now_playing: QueueItemOut | None
    queue: list[QueueItemOut]
    history: list[QueueItemOut]
    participants: list[ParticipantOut]
    tv_online: bool


class RealtimeEvent(BaseModel):
    """Ephemeral notification (toasts, TV banners). Not part of the authoritative state."""

    type: Literal["event"] = "event"
    event: Literal[
        "guest_joined",
        "song_added",
        "track_started",
        "track_failed",
        "track_skipped",
        "party_ended",
        "show_join",
        "host_changed",
    ]
    data: dict = Field(default_factory=dict)


class ProgressMessage(BaseModel):
    type: Literal["progress"] = "progress"
    item_id: str
    generation: int
    position: float
    duration: float | None
    state: Literal["playing", "paused", "buffering", "loading"]
    server_time: datetime


# --- Requests / responses ------------------------------------------------------------------


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class PublicConfig(BaseModel):
    app_name: str
    version: str
    search_enabled: bool
    search_provider: str
    public_base_url: str
    admin_configured: bool


class SessionLookup(BaseModel):
    session_id: str
    join_code: str
    title: str
    status: PartyStatusT
    queue_open: bool
    guest_count: int


class JoinRequest(BaseModel):
    join_code: str = Field(min_length=4, max_length=12)
    display_name: str
    avatar: AvatarKey | None = None

    _name = field_validator("display_name")(clean_display_name)


class MeOut(BaseModel):
    id: str
    display_name: str
    avatar: str | None = None
    role: RoleT


class JoinResponse(BaseModel):
    token: str
    session_id: str
    join_code: str
    participant: MeOut
    state: RoomState


class HostClaimRequest(BaseModel):
    invite: str = Field(min_length=10, max_length=400)
    display_name: str | None = None
    avatar: AvatarKey | None = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None or not v.strip() else clean_display_name(v)


class VideoOut(BaseModel):
    video_id: str
    title: str
    channel: str
    thumbnail_url: str
    duration_seconds: int | None
    is_karaoke: bool
    labels: list[str]


class SearchResponse(BaseModel):
    query: str
    results: list[VideoOut]
    searches_remaining_today: int | None = None


class ResolveResponse(BaseModel):
    video: VideoOut


class SongbookSongOut(BaseModel):
    id: str
    title: str
    artist: str
    duet: bool
    video: VideoOut  # the version guests get: the first backup no TV has reported broken


class SongbookCategoryOut(BaseModel):
    id: str
    name: str
    description: str
    song_ids: list[str]


class SongbookResponse(BaseModel):
    categories: list[SongbookCategoryOut]
    songs: list[SongbookSongOut]


class DuetPartner(BaseModel):
    """Who sings with the requester: a guest in the party, or a typed name. Neither = solo."""

    partner_id: str | None = Field(default=None, max_length=36)
    partner_name: str | None = None

    @field_validator("partner_name")
    @classmethod
    def _partner_name(cls, v: str | None) -> str | None:
        return None if v is None or not v.strip() else clean_display_name(v)

    @model_validator(mode="after")
    def _one_partner(self):
        if self.partner_id and self.partner_name:
            raise ValueError("Choose a guest or type a name, not both")
        return self


class EnqueueRequest(DuetPartner):
    video_id: str = Field(min_length=11, max_length=11, pattern=r"^[A-Za-z0-9_-]{11}$")
    idempotency_key: str = Field(min_length=8, max_length=64)


class EnqueueResponse(BaseModel):
    item: QueueItemOut
    position: int  # 0 = playing/preparing now, 1 = next up, ...
    duplicate: bool  # True when the idempotency key matched an earlier request
    state: RoomState


class MoveRequest(BaseModel):
    to_index: int = Field(ge=0)


class CommandRequest(BaseModel):
    command: Literal[
        "start",
        "pause",
        "resume",
        "toggle_pause",
        "skip",
        "restart",
        "retry",
        "show_join",
        "lock_queue",
        "unlock_queue",
    ]
    # Guards against conflicting commands: e.g. two hosts pressing Skip at once must not skip
    # two songs. If set and it no longer matches the current item, the command is rejected.
    expected_item_id: str | None = None


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=60)
    queue_open: bool | None = None
    intro_seconds: int | None = Field(default=None, ge=0, le=30)
    auto_skip_failed: bool | None = None
    max_pending_per_guest: int | None = Field(default=None, ge=0, le=20)
    show_notifications: bool | None = None


class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class AdminLoginResponse(BaseModel):
    token: str
    expires_at: datetime


class DeviceOut(BaseModel):
    id: str
    name: str
    paired: bool
    paired_at: datetime | None
    last_seen_at: datetime | None
    online: bool
    active_session_id: str | None
    active_join_code: str | None


class AdminSessionOut(BaseModel):
    id: str
    join_code: str
    title: str
    status: PartyStatusT
    device_id: str | None
    created_at: datetime
    guest_count: int
    pending_count: int
    songs_played: int


class AdminOverview(BaseModel):
    devices: list[DeviceOut]
    sessions: list[AdminSessionOut]
    search_enabled: bool
    searches_remaining_today: int | None


class PairRequest(BaseModel):
    code: str = Field(min_length=4, max_length=12)
    name: str | None = Field(default=None, max_length=40)


class DeviceRename(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class AdminHostJoin(BaseModel):
    display_name: str = "Host"
    avatar: AvatarKey | None = None

    _name = field_validator("display_name")(clean_display_name)


class TvRegisterRequest(BaseModel):
    name: str | None = Field(default=None, max_length=40)


class TvRegisterResponse(BaseModel):
    device_id: str
    device_secret: str
    pairing_code: str
    pairing_expires_at: datetime


class TvStatus(BaseModel):
    device_id: str
    name: str
    paired: bool
    pairing_code: str | None
    pairing_expires_at: datetime | None


class TvSessionResponse(BaseModel):
    session_id: str
    join_code: str
    state: RoomState


class TvPlaybackRequest(BaseModel):
    event: Literal["started", "ended", "failed"]
    item_id: str
    generation: int
    position: float | None = None
    duration: float | None = None
    error_code: str | None = Field(default=None, max_length=40)


class TvPlaybackResponse(BaseModel):
    accepted: bool
    state: RoomState


class HostInviteResponse(BaseModel):
    invite: str
    expires_at: datetime
    path: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: bool
    version: str
