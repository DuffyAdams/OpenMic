"""Simultaneous submissions must produce one stable, gap-free FIFO order."""

import asyncio
import uuid

from sqlalchemy import select

from app.db import create_engine, create_sessionmaker
from app.models import Base, Device, ItemStatus, QueueItem, utcnow
from app.realtime import Hub
from app.services.rooms import Actor, RoomService
from app.youtube import VideoInfo
from tests.conftest import make_settings, vid


async def _service(tmp_path):
    settings = make_settings(tmp_path)
    engine = create_engine(settings)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = create_sessionmaker(engine)
    rooms = RoomService(sm, Hub(), settings)
    async with sm() as db, db.begin():
        device = Device(secret_hash=uuid.uuid4().hex, paired_at=utcnow())
        db.add(device)
    party_id = await rooms.device_party(device)
    return engine, sm, rooms, device, party_id


async def test_concurrent_enqueues_get_unique_ordered_sequences(tmp_path):
    engine, sm, rooms, _device, party_id = await _service(tmp_path)
    guests = [(await rooms.join(party_id, f"Guest {i}"))[0] for i in range(4)]

    async def submit(guest, n):
        info = VideoInfo.build(vid(n), f"Song {n}", "Channel")
        return await rooms.add_item(
            party_id, Actor("guest", participant=guest), info, uuid.uuid4().hex
        )

    results = await asyncio.gather(*(submit(guests[n % 4], n) for n in range(40)))
    assert len({r[0].id for r in results}) == 40
    async with sm() as db:
        items = (await db.scalars(select(QueueItem).where(QueueItem.session_id == party_id))).all()
    seqs = sorted(i.sequence_number for i in items)
    assert seqs == list(range(1, 41))  # unique, gap-free
    state = await rooms.get_state(party_id)
    assert [i.sequence for i in state.queue] == list(range(1, 41))  # order == arrival order
    await engine.dispose()


async def test_concurrent_duplicate_retries_create_one_item(tmp_path):
    engine, sm, rooms, _device, party_id = await _service(tmp_path)
    guest, _token, _state = await rooms.join(party_id, "Retry Rita")
    info = VideoInfo.build(vid(1), "Song", "Channel")
    actor = Actor("guest", participant=guest)
    results = await asyncio.gather(
        *(rooms.add_item(party_id, actor, info, "same-key-0001") for _ in range(8))
    )
    assert len({r[0].id for r in results}) == 1
    assert sum(1 for r in results if not r[2]) == 1  # exactly one non-duplicate
    await engine.dispose()


async def test_concurrent_ended_events_advance_once(tmp_path):
    engine, sm, rooms, device, party_id = await _service(tmp_path)
    guest, _token, _state = await rooms.join(party_id, "G")
    actor = Actor("guest", participant=guest)
    for n in range(3):
        await rooms.add_item(party_id, actor, VideoInfo.build(vid(n), "S", "C"), f"key-{n:05d}")
    state = await rooms.command(party_id, Actor("device", device=device), "start")
    first = state.now_playing.id
    await rooms.tv_event(party_id, device, "started", first, 1)
    outcomes = await asyncio.gather(
        *(rooms.tv_event(party_id, device, "ended", first, 1) for _ in range(5))
    )
    assert sum(1 for accepted, _ in outcomes if accepted) == 1
    state = await rooms.get_state(party_id)
    assert state.playback.generation == 2 and len(state.queue) == 1
    async with sm() as db:
        statuses = sorted((await db.scalars(select(QueueItem.status))).all())
    assert statuses == sorted([ItemStatus.COMPLETED, ItemStatus.PREPARING, ItemStatus.PENDING])
    await engine.dispose()
