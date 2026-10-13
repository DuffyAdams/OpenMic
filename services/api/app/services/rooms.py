"""The authoritative queue and playback state machine.

Rules (see docs/architecture.md):
* The server owns the queue; the TV owns playback; phones submit requests and host commands.
* Every mutation for a party runs under that party's asyncio lock *and* inside one database
  transaction, so simultaneous requests get a single stable order.
* FIFO order comes from a per-party, server-assigned `sequence_number`; hosts may override it
  explicitly (which only changes `sort_key`).
* Each time a new item is handed to the TV, `playback_generation` increments. TV events must
  quote the current generation and item, which makes duplicate/stale `ended` events harmless.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.errors import AppError, forbidden, not_found
from app.models import (
    Device,
    ItemStatus,
    Participant,
    Party,
    PartyStatus,
    Phase,
    PlaybackEvent,
    QueueItem,
    Role,
    utcnow,
)
from app.realtime import Hub
from app.schemas import (
    DuetPartner,
    ParticipantOut,
    PlaybackOut,
    ProgressMessage,
    QueueItemOut,
    RealtimeEvent,
    RoomState,
    SessionOut,
    SettingsUpdate,
)
from app.security import PARTICIPANT_PREFIX, hash_token, new_code, new_token
from app.youtube import VideoInfo

log = logging.getLogger(__name__)

SORT_STEP = 1024
HISTORY_LIMIT = 100

FAILURE_REASONS = {
    "2": "Invalid video",
    "5": "Player error",
    "100": "Video removed or private",
    "101": "Embedding disabled by uploader",
    "150": "Embedding disabled by uploader",
    "152": "Player configuration error",
    "153": "Player configuration error",
    "timeout": "Video didn't start",
    "network": "Network error",
}


# Player errors that mean "this video will never play embedded" (vs. transient problems).
UNPLAYABLE_CODES = {"100", "101", "150"}
UNPLAYABLE_REASONS = [FAILURE_REASONS[c] for c in sorted(UNPLAYABLE_CODES)]


def failure_reason(code: str | None) -> str:
    if not code:
        return "Playback error"
    return FAILURE_REASONS.get(code, f"Playback error ({code[:20]})")


@dataclass
class Actor:
    """Who is performing an action."""

    kind: str  # guest | host | device | admin | system
    participant: Participant | None = None
    device: Device | None = None

    @property
    def is_host(self) -> bool:
        return self.kind in ("host", "device", "admin", "system")

    @property
    def participant_id(self) -> str | None:
        return self.participant.id if self.participant else None

    @property
    def label(self) -> str:
        if self.participant:
            return f"{self.kind}:{self.participant.id[:8]}"
        if self.device:
            return f"device:{self.device.id[:8]}"
        return self.kind


SYSTEM = Actor("system")


@dataclass
class _Mutation:
    db: AsyncSession
    party: Party
    changed: bool = False
    events: list[tuple[RealtimeEvent, str | None]] = field(default_factory=list)
    state: RoomState | None = None

    def emit(self, event: str, data: dict | None = None, *, kind: str | None = None) -> None:
        self.events.append((RealtimeEvent(event=event, data=data or {}), kind))

    def audit(
        self, event_type: str, actor: Actor, item_id: str | None = None, detail: str | None = None
    ) -> None:
        self.db.add(
            PlaybackEvent(
                session_id=self.party.id,
                queue_item_id=item_id,
                event_type=event_type,
                playback_generation=self.party.playback_generation,
                actor=actor.label,
                detail=detail[:256] if detail else None,
            )
        )
        log.info(
            "queue_transition",
            extra={
                "session_id": self.party.id,
                "event": event_type,
                "item_id": item_id,
                "generation": self.party.playback_generation,
                "actor": actor.label,
            },
        )


class RoomService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker,
        hub: Hub,
        settings: Settings,
        on_unplayable: Callable[[str], None] | None = None,
    ):
        self.sessionmaker = sessionmaker
        self.hub = hub
        self.settings = settings
        self.on_unplayable = on_unplayable
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    # --- Infrastructure ---------------------------------------------------------------------

    @asynccontextmanager
    async def _mutate(
        self, party_id: str, *, allow_ended: bool = False
    ) -> AsyncIterator[_Mutation]:
        async with self._locks[party_id]:
            async with self.sessionmaker() as db:
                async with db.begin():
                    party = await db.get(Party, party_id, with_for_update=True)
                    if party is None:
                        raise not_found("Party not found")
                    if party.status == PartyStatus.ENDED and not allow_ended:
                        raise AppError(409, "party_ended", "This party has ended.")
                    m = _Mutation(db, party)
                    yield m
                    if m.changed:
                        await self._maybe_advance(m)
                        party.state_version += 1
                        party.last_activity_at = utcnow()
                m.state = await self._build_state(db, party_id)
        if m.changed:
            await self.hub.broadcast(party_id, m.state.model_dump(mode="json"))
        for event, kind in m.events:
            await self.hub.broadcast(party_id, event.model_dump(mode="json"), kind=kind)

    async def get_state(self, party_id: str) -> RoomState:
        async with self.sessionmaker() as db:
            return await self._build_state(db, party_id)

    async def broadcast_presence(self, party_id: str) -> None:
        """Re-send the current snapshot (same version) after someone connects/disconnects."""
        try:
            state = await self.get_state(party_id)
        except AppError:
            return
        await self.hub.broadcast(party_id, state.model_dump(mode="json"))

    async def _build_state(self, db: AsyncSession, party_id: str) -> RoomState:
        party = await db.get(Party, party_id)
        if party is None:
            raise not_found("Party not found")
        await db.refresh(party)
        participants = (
            await db.scalars(
                select(Participant)
                .where(Participant.session_id == party_id)
                .order_by(Participant.joined_at)
            )
        ).all()
        names = {p.id: p.display_name for p in participants}
        items = (
            await db.scalars(
                select(QueueItem).where(
                    QueueItem.session_id == party_id,
                    QueueItem.status != ItemStatus.CANCELLED,
                )
            )
        ).all()

        def out(item: QueueItem) -> QueueItemOut:
            partner = item.partner_name
            if item.partner_participant_id:
                partner = names.get(item.partner_participant_id, partner or "Guest")
            return QueueItemOut(
                id=item.id,
                participant_id=item.participant_id,
                singer=names.get(item.participant_id, "Guest"),
                partner_id=item.partner_participant_id,
                partner=partner,
                sequence=item.sequence_number,
                video_id=item.provider_video_id,
                title=item.title,
                channel=item.channel,
                duration_seconds=item.duration_seconds,
                thumbnail_url=item.thumbnail_url,
                status=item.status,
                requested_at=item.requested_at,
                started_at=item.started_at,
                finished_at=item.finished_at,
                failure_reason=item.failure_reason,
            )

        pending = sorted(
            (i for i in items if i.status == ItemStatus.PENDING),
            key=lambda i: (i.sort_key, i.sequence_number),
        )
        current = next((i for i in items if i.id == party.current_item_id), None)
        history = sorted(
            (i for i in items if i.status in ItemStatus.HISTORY and i.id != party.current_item_id),
            key=lambda i: i.finished_at or i.requested_at,
            reverse=True,
        )[:HISTORY_LIMIT]
        online = self.hub.online_participant_ids(party_id)

        return RoomState(
            version=party.state_version,
            server_time=utcnow(),
            session=SessionOut(
                id=party.id,
                join_code=party.join_code,
                title=party.title,
                status=party.status,
                queue_open=party.queue_open,
                intro_seconds=party.intro_seconds,
                auto_skip_failed=party.auto_skip_failed,
                max_pending_per_guest=party.max_pending_per_guest,
                show_notifications=party.show_notifications,
                created_at=party.created_at,
                started_at=party.started_at,
                ended_at=party.ended_at,
            ),
            playback=PlaybackOut(
                phase=party.playback_phase,
                item_id=party.current_item_id,
                generation=party.playback_generation,
                paused=party.paused,
                restart_seq=party.restart_seq,
                position_seconds=party.position_seconds,
                position_updated_at=party.position_updated_at,
            ),
            now_playing=out(current) if current else None,
            queue=[out(i) for i in pending],
            history=[out(i) for i in history],
            participants=[
                ParticipantOut(
                    id=p.id,
                    display_name=p.display_name,
                    avatar=p.avatar,
                    role=p.role,
                    joined_at=p.joined_at,
                    online=p.id in online,
                )
                for p in participants
                if p.removed_at is None
            ],
            tv_online=self.hub.tv_online(party_id),
        )

    @staticmethod
    async def _pending(db: AsyncSession, party_id: str) -> list[QueueItem]:
        return list(
            (
                await db.scalars(
                    select(QueueItem)
                    .where(QueueItem.session_id == party_id, QueueItem.status == ItemStatus.PENDING)
                    .order_by(QueueItem.sort_key, QueueItem.sequence_number)
                )
            ).all()
        )

    async def _maybe_advance(self, m: _Mutation) -> None:
        """Hand the earliest pending item to the player when it is free."""
        party = m.party
        if party.current_item_id is not None:
            return
        if party.status != PartyStatus.ACTIVE:
            party.playback_phase = Phase.IDLE
            return
        pending = await self._pending(m.db, party.id)
        if not pending:
            party.playback_phase = Phase.IDLE
            party.paused = False
            return
        nxt = pending[0]
        nxt.status = ItemStatus.PREPARING
        party.current_item_id = nxt.id
        party.playback_generation += 1
        party.playback_phase = Phase.INTRO
        party.paused = False
        party.restart_seq = 0
        party.position_seconds = 0.0
        party.position_updated_at = None
        m.audit("preparing", SYSTEM, nxt.id)

    async def _current_item(self, m: _Mutation) -> QueueItem | None:
        if not m.party.current_item_id:
            return None
        return await m.db.get(QueueItem, m.party.current_item_id)

    # --- Parties ----------------------------------------------------------------------------

    async def _unique_join_code(self, db: AsyncSession) -> str:
        for _ in range(20):
            code = new_code(6)
            clash = await db.scalar(
                select(Party.id).where(Party.join_code == code, Party.status != PartyStatus.ENDED)
            )
            if not clash:
                return code
        raise AppError(500, "join_code_exhausted", "Could not allocate a join code")

    async def device_party(self, device: Device, *, force_new: bool = False) -> str:
        """Return the TV's open party, creating one when needed."""
        async with self._locks[f"device:{device.id}"]:
            async with self.sessionmaker() as db:
                existing = await db.scalar(
                    select(Party)
                    .where(Party.device_id == device.id, Party.status != PartyStatus.ENDED)
                    .order_by(Party.created_at.desc())
                )
            if existing and not force_new:
                return existing.id
            if existing and force_new:
                await self.end_party(existing.id, Actor("device", device=device))
            async with self.sessionmaker() as db:
                async with db.begin():
                    party = Party(
                        join_code=await self._unique_join_code(db),
                        title=self.settings.default_party_title,
                        device_id=device.id,
                    )
                    db.add(party)
                    await db.flush()
                    db.add(
                        PlaybackEvent(
                            session_id=party.id, event_type="party_created", actor="device"
                        )
                    )
                log.info("party_created", extra={"session_id": party.id})
                return party.id

    async def find_open_party_by_code(self, join_code: str) -> Party | None:
        async with self.sessionmaker() as db:
            return await db.scalar(
                select(Party)
                .where(Party.join_code == join_code, Party.status != PartyStatus.ENDED)
                .order_by(Party.created_at.desc())
            )

    async def guest_count(self, party_id: str) -> int:
        async with self.sessionmaker() as db:
            return (
                await db.scalar(
                    select(func.count(Participant.id)).where(
                        Participant.session_id == party_id, Participant.removed_at.is_(None)
                    )
                )
                or 0
            )

    async def end_party(self, party_id: str, actor: Actor) -> RoomState:
        async with self._mutate(party_id) as m:
            party = m.party
            now = utcnow()
            current = await self._current_item(m)
            if current is not None:
                if current.status == ItemStatus.PLAYING:
                    current.status = ItemStatus.COMPLETED
                    current.finished_at = now
                elif current.status == ItemStatus.PREPARING:
                    current.status = ItemStatus.CANCELLED
            for item in await self._pending(m.db, party.id):
                item.status = ItemStatus.CANCELLED
            party.status = PartyStatus.ENDED
            party.ended_at = now
            party.current_item_id = None
            party.playback_phase = Phase.IDLE
            party.paused = False
            m.changed = True
            m.audit("party_ended", actor)
            m.emit("party_ended")
        # Guests' tokens die with the party; disconnect them so they stop reconnecting.
        await self.hub.close_room(party_id, code=4410, keep_devices=True)
        return m.state

    async def known_unplayable_videos(self) -> list[str]:
        """Videos that failed for good in earlier parties (seeds the search filter on startup)."""
        async with self.sessionmaker() as db:
            rows = await db.scalars(
                select(QueueItem.provider_video_id)
                .where(
                    QueueItem.status == ItemStatus.FAILED,
                    QueueItem.failure_reason.in_(UNPLAYABLE_REASONS),
                )
                .distinct()
            )
            return list(rows.all())

    async def end_idle_parties(self) -> int:
        cutoff = utcnow() - timedelta(hours=self.settings.session_idle_hours)
        async with self.sessionmaker() as db:
            stale = (
                await db.scalars(
                    select(Party.id).where(
                        Party.status != PartyStatus.ENDED, Party.last_activity_at < cutoff
                    )
                )
            ).all()
        for party_id in stale:
            try:
                await self.end_party(party_id, SYSTEM)
            except AppError:
                pass
        return len(stale)

    # --- Participants -----------------------------------------------------------------------

    async def join(
        self,
        party_id: str,
        display_name: str,
        role: str = Role.GUEST,
        avatar: str | None = None,
    ):
        token = new_token(PARTICIPANT_PREFIX)
        async with self._mutate(party_id) as m:
            participant = Participant(
                session_id=party_id,
                display_name=display_name,
                avatar=avatar,
                role=role,
                token_hash=hash_token(token),
                last_seen_at=utcnow(),
            )
            m.db.add(participant)
            await m.db.flush()
            m.changed = True
            m.audit("participant_joined", Actor(role, participant=participant), detail=role)
            m.emit(
                "guest_joined",
                {
                    "participant_id": participant.id,
                    "display_name": display_name,
                    "avatar": avatar,
                    "role": role,
                },
            )
        return participant, token, m.state

    async def make_host(self, party_id: str, participant_id: str, actor: Actor) -> RoomState:
        async with self._mutate(party_id) as m:
            participant = await m.db.get(Participant, participant_id)
            if participant is None or participant.session_id != party_id:
                raise not_found("Guest not found")
            if participant.role != Role.HOST:
                participant.role = Role.HOST
                m.changed = True
                m.audit("host_granted", actor, detail=participant.id)
                m.emit("host_changed", {"participant_id": participant.id})
        return m.state

    async def remove_participant(self, party_id: str, participant_id: str, actor: Actor):
        if not actor.is_host:
            raise forbidden("Only the host can remove guests")
        if actor.participant_id == participant_id:
            raise AppError(409, "cannot_remove_self", "You can't remove yourself.")
        async with self._mutate(party_id) as m:
            participant = await m.db.get(Participant, participant_id)
            if participant is None or participant.session_id != party_id:
                raise not_found("Guest not found")
            if participant.removed_at is None:
                participant.removed_at = utcnow()
                for item in await self._pending(m.db, party_id):
                    if item.participant_id == participant_id:
                        item.status = ItemStatus.CANCELLED
                    elif item.partner_participant_id == participant_id:
                        # They left, but whoever asked for the duet still wants to sing it.
                        item.partner_participant_id = None
                        item.partner_name = participant.display_name
                m.changed = True
                m.audit("participant_removed", actor, detail=participant_id)
        await self.hub.disconnect_participant(party_id, participant_id, code=4403)
        return m.state

    # --- Queue ------------------------------------------------------------------------------

    async def add_item(
        self,
        party_id: str,
        actor: Actor,
        info: VideoInfo,
        idempotency_key: str,
        duet: DuetPartner | None = None,
    ):
        if actor.participant is None:
            raise forbidden("Join the party to add songs")
        duplicate = False
        async with self._mutate(party_id) as m:
            party = m.party
            existing = await m.db.scalar(
                select(QueueItem).where(
                    QueueItem.session_id == party_id,
                    QueueItem.participant_id == actor.participant.id,
                    QueueItem.idempotency_key == idempotency_key,
                )
            )
            if existing is not None:
                duplicate = True
                item = existing
            else:
                if not party.queue_open and not actor.is_host:
                    raise AppError(409, "queue_locked", "The host has paused new requests.")
                await self._check_pending_limit(m, actor)
                last_key = await m.db.scalar(
                    select(func.max(QueueItem.sort_key)).where(
                        QueueItem.session_id == party_id, QueueItem.status == ItemStatus.PENDING
                    )
                )
                partner_id, partner_name = await self._resolve_partner(
                    m, actor.participant.id, duet
                )
                seq = party.next_sequence
                party.next_sequence = seq + 1
                item = QueueItem(
                    session_id=party_id,
                    participant_id=actor.participant.id,
                    sequence_number=seq,
                    sort_key=(last_key or 0) + SORT_STEP,
                    provider_video_id=info.video_id,
                    title=info.title,
                    channel=info.channel,
                    duration_seconds=info.duration_seconds,
                    thumbnail_url=info.thumbnail_url,
                    partner_participant_id=partner_id,
                    partner_name=partner_name,
                    idempotency_key=idempotency_key,
                )
                m.db.add(item)
                await m.db.flush()
                m.changed = True
                m.audit("enqueued", actor, item.id, detail=f"seq={seq}")
        position = self._position(m.state, item.id)
        item_out = next(
            (i for i in [m.state.now_playing, *m.state.queue] if i and i.id == item.id), None
        ) or next((i for i in m.state.history if i.id == item.id), None)
        if not duplicate:
            event = RealtimeEvent(
                event="song_added",
                data={
                    "item_id": item.id,
                    "participant_id": item.participant_id,
                    "singer": actor.participant.display_name,
                    "partner_id": item_out.partner_id if item_out else None,
                    "partner": item_out.partner if item_out else None,
                    "title": item.title,
                    "position": position,
                },
            )
            await self.hub.broadcast(party_id, event.model_dump(mode="json"))
        return item_out, position, duplicate, m.state

    @staticmethod
    async def _check_pending_limit(m: _Mutation, actor: Actor) -> None:
        """Enforce the host's "songs waiting per guest" setting (hosts are exempt)."""
        limit = m.party.max_pending_per_guest
        if not limit or actor.is_host or actor.participant is None:
            return
        mine = await m.db.scalar(
            select(func.count(QueueItem.id)).where(
                QueueItem.session_id == m.party.id,
                QueueItem.participant_id == actor.participant.id,
                QueueItem.status == ItemStatus.PENDING,
            )
        )
        if mine >= limit:
            raise AppError(409, "too_many_requests", f"You can have up to {limit} songs waiting.")

    @staticmethod
    async def _resolve_partner(
        m: _Mutation, owner_id: str, duet: DuetPartner | None
    ) -> tuple[str | None, str | None]:
        """Validate a duet partner; returns (partner_participant_id, partner_name)."""
        if duet is None or not (duet.partner_id or duet.partner_name):
            return None, None
        if duet.partner_name:
            return None, duet.partner_name
        if duet.partner_id == owner_id:
            raise AppError(409, "partner_is_self", "Pick someone else to sing with.")
        partner = await m.db.get(Participant, duet.partner_id)
        if partner is None or partner.session_id != m.party.id or partner.removed_at is not None:
            raise AppError(409, "partner_not_found", "That guest isn't at the party anymore.")
        return partner.id, None

    async def set_partner(
        self, party_id: str, actor: Actor, item_id: str, duet: DuetPartner
    ) -> RoomState:
        """Add, change or remove the duet partner on a song that hasn't finished yet."""
        async with self._mutate(party_id) as m:
            item = await m.db.get(QueueItem, item_id)
            if item is None or item.session_id != party_id:
                raise not_found("Song not found")
            clearing = not (duet.partner_id or duet.partner_name)
            is_partner = (
                actor.participant_id is not None
                and item.partner_participant_id == actor.participant_id
            )
            if not (actor.is_host or item.participant_id == actor.participant_id):
                if not (is_partner and clearing):
                    raise forbidden("Only the singer who added this song can change the duet")
            if item.status not in (ItemStatus.PENDING, *ItemStatus.ACTIVE):
                raise AppError(409, "item_not_pending", "That song is no longer waiting.")
            partner_id, partner_name = await self._resolve_partner(m, item.participant_id, duet)
            if (item.partner_participant_id, item.partner_name) != (partner_id, partner_name):
                item.partner_participant_id = partner_id
                item.partner_name = partner_name
                m.changed = True
                m.audit("duet_changed", actor, item.id, detail=partner_id or partner_name)
        return m.state

    @staticmethod
    def _position(state: RoomState, item_id: str) -> int:
        if state.now_playing and state.now_playing.id == item_id:
            return 0
        for index, queued in enumerate(state.queue, start=1):
            if queued.id == item_id:
                return index
        return -1

    async def cancel_item(self, party_id: str, actor: Actor, item_id: str) -> RoomState:
        async with self._mutate(party_id) as m:
            item = await m.db.get(QueueItem, item_id)
            if item is None or item.session_id != party_id:
                raise not_found("Song not found")
            if not actor.is_host and item.participant_id != actor.participant_id:
                raise forbidden("You can only cancel your own songs")
            if item.status in ItemStatus.ACTIVE:
                raise AppError(409, "item_active", "That song is already up. Ask the host to skip.")
            if item.status != ItemStatus.PENDING:
                raise AppError(409, "item_not_pending", "That song is no longer waiting.")
            item.status = ItemStatus.CANCELLED
            item.finished_at = utcnow()
            m.changed = True
            m.audit("cancelled" if not actor.is_host else "removed", actor, item.id)
        return m.state

    async def move_item(self, party_id: str, actor: Actor, item_id: str, to_index: int):
        if not actor.is_host:
            raise forbidden("Only the host can reorder the queue")
        async with self._mutate(party_id) as m:
            pending = await self._pending(m.db, party_id)
            item = next((i for i in pending if i.id == item_id), None)
            if item is None:
                raise AppError(409, "item_not_pending", "That song is no longer waiting.")
            pending.remove(item)
            pending.insert(min(to_index, len(pending)), item)
            for index, queued in enumerate(pending, start=1):
                queued.sort_key = index * SORT_STEP
            m.changed = True
            m.audit("reordered", actor, item.id, detail=f"to={to_index}")
        return m.state

    async def requeue_item(self, party_id: str, actor: Actor, item_id: str) -> RoomState:
        """Put a finished/failed song back at the end of the queue ("sing again")."""
        async with self._mutate(party_id) as m:
            item = await m.db.get(QueueItem, item_id)
            if item is None or item.session_id != party_id:
                raise not_found("Song not found")
            if not actor.is_host and item.participant_id != actor.participant_id:
                raise forbidden("You can only re-add your own songs")
            if item.status not in (*ItemStatus.HISTORY, ItemStatus.CANCELLED):
                raise AppError(409, "item_in_queue", "That song is already in the queue.")
            if not m.party.queue_open and not actor.is_host:
                raise AppError(409, "queue_locked", "The host has paused new requests.")
            await self._check_pending_limit(m, actor)
            last_key = await m.db.scalar(
                select(func.max(QueueItem.sort_key)).where(
                    QueueItem.session_id == party_id, QueueItem.status == ItemStatus.PENDING
                )
            )
            seq = m.party.next_sequence
            m.party.next_sequence = seq + 1
            copy = QueueItem(
                session_id=party_id,
                participant_id=item.participant_id,
                sequence_number=seq,
                sort_key=(last_key or 0) + SORT_STEP,
                provider=item.provider,
                provider_video_id=item.provider_video_id,
                title=item.title,
                channel=item.channel,
                duration_seconds=item.duration_seconds,
                thumbnail_url=item.thumbnail_url,
                partner_participant_id=item.partner_participant_id,
                partner_name=item.partner_name,
            )
            if copy.partner_participant_id:
                partner = await m.db.get(Participant, copy.partner_participant_id)
                if partner is None or partner.removed_at is not None:
                    copy.partner_participant_id = None
                    copy.partner_name = partner.display_name if partner else None
            m.db.add(copy)
            await m.db.flush()
            m.changed = True
            m.audit("requeued", actor, copy.id, detail=f"from={item.id}")
        return m.state

    # --- Host commands ----------------------------------------------------------------------

    async def update_settings(self, party_id: str, actor: Actor, update: SettingsUpdate):
        if not actor.is_host:
            raise forbidden("Only the host can change settings")
        async with self._mutate(party_id) as m:
            for key, value in update.model_dump(exclude_none=True).items():
                if getattr(m.party, key) != value:
                    setattr(m.party, key, value)
                    m.changed = True
            if m.changed:
                m.audit("settings_changed", actor, detail=",".join(update.model_fields_set))
        return m.state

    async def command(
        self, party_id: str, actor: Actor, command: str, expected_item_id: str | None = None
    ) -> RoomState:
        if not actor.is_host:
            raise forbidden("Only the host can control playback")
        async with self._mutate(party_id) as m:
            party = m.party
            current = await self._current_item(m)
            if expected_item_id is not None and (current is None or current.id != expected_item_id):
                raise AppError(
                    409, "stale_command", "The song changed before your command arrived."
                )

            if command == "start":
                if party.status == PartyStatus.LOBBY:
                    party.status = PartyStatus.ACTIVE
                    party.started_at = utcnow()
                    m.changed = True
                    m.audit("party_started", actor)
            elif command in ("pause", "resume", "toggle_pause"):
                if current is None or party.playback_phase not in (Phase.INTRO, Phase.PLAYING):
                    raise AppError(409, "nothing_playing", "Nothing is playing right now.")
                target = {"pause": True, "resume": False}.get(command, not party.paused)
                if party.paused != target:
                    party.paused = target
                    m.changed = True
                    m.audit("paused" if target else "resumed", actor, current.id)
            elif command == "skip":
                if current is None:
                    raise AppError(409, "nothing_playing", "Nothing is playing right now.")
                if current.status in ItemStatus.ACTIVE:
                    current.status = ItemStatus.SKIPPED
                current.finished_at = current.finished_at or utcnow()
                party.current_item_id = None
                party.playback_phase = Phase.IDLE
                m.changed = True
                m.audit("skipped", actor, current.id)
                m.emit("track_skipped", {"item_id": current.id, "title": current.title})
            elif command == "restart":
                if current is None or current.status not in ItemStatus.ACTIVE:
                    raise AppError(409, "nothing_playing", "Nothing is playing right now.")
                party.restart_seq += 1
                party.paused = False
                m.changed = True
                m.audit("restarted", actor, current.id)
            elif command == "retry":
                if current is None or party.playback_phase != Phase.ERROR:
                    raise AppError(409, "nothing_to_retry", "There's no failed song to retry.")
                current.status = ItemStatus.PREPARING
                current.failure_reason = None
                current.finished_at = None
                party.playback_generation += 1
                party.playback_phase = Phase.INTRO
                party.paused = False
                party.position_seconds = 0.0
                m.changed = True
                m.audit("retried", actor, current.id)
            elif command == "show_join":
                m.emit("show_join", kind="device")
            elif command in ("lock_queue", "unlock_queue"):
                target = command == "unlock_queue"
                if party.queue_open != target:
                    party.queue_open = target
                    m.changed = True
                    m.audit(command, actor)
            else:  # pragma: no cover - schema restricts commands
                raise AppError(400, "unknown_command", "Unknown command")
        return m.state

    # --- TV playback protocol ---------------------------------------------------------------

    async def tv_event(
        self,
        party_id: str,
        device: Device,
        event: str,
        item_id: str,
        generation: int,
        *,
        duration: float | None = None,
        error_code: str | None = None,
    ) -> tuple[bool, RoomState]:
        accepted = False
        actor = Actor("device", device=device)
        async with self._mutate(party_id, allow_ended=True) as m:
            party = m.party
            if party.device_id != device.id:
                raise forbidden("This TV isn't running this party")
            current = await self._current_item(m)
            fresh = (
                party.status != PartyStatus.ENDED
                and current is not None
                and current.id == item_id
                and party.playback_generation == generation
            )
            if not fresh:
                m.audit("stale_event", actor, item_id, detail=f"{event} gen={generation}")
            elif event == "started":
                if current.status == ItemStatus.PREPARING:
                    current.status = ItemStatus.PLAYING
                    current.started_at = utcnow()
                    party.playback_phase = Phase.PLAYING
                    if duration and duration > 0 and not current.duration_seconds:
                        current.duration_seconds = int(round(duration))
                    m.changed = True
                    m.audit("started", actor, current.id)
                    singer = await m.db.get(Participant, current.participant_id)
                    partner = current.partner_name
                    if current.partner_participant_id:
                        p = await m.db.get(Participant, current.partner_participant_id)
                        partner = p.display_name if p else partner
                    m.emit(
                        "track_started",
                        {
                            "item_id": current.id,
                            "participant_id": current.participant_id,
                            "singer": singer.display_name if singer else "Guest",
                            "partner_id": current.partner_participant_id,
                            "partner": partner,
                            "title": current.title,
                        },
                    )
                accepted = current.status == ItemStatus.PLAYING
            elif event == "ended":
                if current.status in ItemStatus.ACTIVE:
                    current.status = ItemStatus.COMPLETED
                    current.finished_at = utcnow()
                    party.current_item_id = None
                    party.playback_phase = Phase.IDLE
                    m.changed = True
                    accepted = True
                    m.audit("completed", actor, current.id)
            elif event == "failed":
                if error_code == "timeout" and current.status == ItemStatus.PLAYING:
                    # "Didn't start" contradicts an accepted `started` (e.g. a second TV tab whose
                    # copy of the video never began): the song is playing, so keep it.
                    m.audit("stale_event", actor, current.id, detail="timeout after start")
                elif current.status in ItemStatus.ACTIVE:
                    reason = failure_reason(error_code)
                    current.status = ItemStatus.FAILED
                    current.failure_reason = reason
                    current.finished_at = utcnow()
                    if party.auto_skip_failed:
                        party.current_item_id = None
                        party.playback_phase = Phase.IDLE
                    else:
                        party.playback_phase = Phase.ERROR
                    m.changed = True
                    accepted = True
                    m.audit("failed", actor, current.id, detail=f"code={error_code}")
                    if error_code in UNPLAYABLE_CODES and self.on_unplayable:
                        self.on_unplayable(current.provider_video_id)
                    m.emit(
                        "track_failed",
                        {
                            "item_id": current.id,
                            "participant_id": current.participant_id,
                            "title": current.title,
                            "reason": reason,
                            "auto_skipped": party.auto_skip_failed,
                        },
                    )
        return accepted, m.state

    async def tv_progress(
        self,
        party_id: str,
        device_id: str,
        item_id: str,
        generation: int,
        position: float,
        duration: float | None,
        state: str,
    ) -> None:
        async with self._locks[party_id]:
            async with self.sessionmaker() as db:
                async with db.begin():
                    party = await db.get(Party, party_id)
                    if (
                        party is None
                        or party.device_id != device_id
                        or party.current_item_id != item_id
                        or party.playback_generation != generation
                    ):
                        return
                    party.position_seconds = max(0.0, position)
                    party.position_updated_at = utcnow()
                    if duration and duration > 0:
                        item = await db.get(QueueItem, item_id)
                        if item is not None and not item.duration_seconds:
                            item.duration_seconds = int(round(duration))
        message = ProgressMessage(
            item_id=item_id,
            generation=generation,
            position=position,
            duration=duration,
            state=state,
            server_time=utcnow(),
        )
        await self.hub.broadcast(party_id, message.model_dump(mode="json"), kind="participant")
