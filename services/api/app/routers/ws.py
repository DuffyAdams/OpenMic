"""Live room events over WebSocket.

Protocol:
  client → {"type": "auth", "token": "...", "session_id": "..."}   (first message, within 10 s;
                                                                   session_id only for TV/admin)
  server → {"type": "hello", ...} then {"type": "room_state", ...}
  server → room_state | event | progress  (pushed)
  client → {"type": "ping"} → {"type": "pong"};  {"type": "sync"} → room_state
  TV     → {"type": "progress", "item_id", "generation", "position", "duration", "state"}

Credentials travel in the first message rather than the URL so they never land in access logs.
"""

import asyncio
import contextlib
import json
import logging

import anyio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError

from app.deps import Services, resolve_token
from app.models import Device, Participant, Party, PartyStatus, utcnow
from app.realtime import Connection

log = logging.getLogger(__name__)
router = APIRouter()

AUTH_TIMEOUT_SECONDS = 10


class _Progress(BaseModel):
    item_id: str = Field(max_length=36)
    generation: int
    position: float = Field(ge=0, le=86400)
    duration: float | None = Field(default=None, ge=0, le=86400)
    state: str = Field(pattern="^(playing|paused|buffering|loading)$")


async def _receive(ws: WebSocket) -> dict | None:
    text = await ws.receive_text()
    if len(text) > 4096:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


async def _reject(ws: WebSocket, code: int, message: str) -> None:
    with contextlib.suppress(Exception):
        await ws.send_json({"type": "error", "code": code, "message": message})
        await ws.close(code=code)


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    services: Services = ws.app.state.services
    await ws.accept()
    try:
        first = await asyncio.wait_for(_receive(ws), AUTH_TIMEOUT_SECONDS)
    except (TimeoutError, WebSocketDisconnect):
        await _reject(ws, 4401, "Authentication timed out")
        return
    if not first or first.get("type") != "auth":
        await _reject(ws, 4400, "Expected auth message")
        return

    auth = await resolve_token(services, first.get("token"))
    if auth is None:
        await _reject(ws, 4401, "Invalid or expired credentials")
        return

    if auth.kind == "participant":
        party_id = auth.participant.session_id
        conn = Connection(ws, party_id, "participant", participant_id=auth.participant.id)
    else:
        party_id = str(first.get("session_id") or "")
        async with services.sessionmaker() as db:
            party = await db.get(Party, party_id) if party_id else None
        if party is None:
            await _reject(ws, 4404, "Party not found")
            return
        if auth.kind == "device":
            if auth.device.paired_at is None or party.device_id != auth.device.id:
                await _reject(ws, 4403, "This TV isn't running this party")
                return
            conn = Connection(ws, party_id, "device", device_id=auth.device.id)
        else:  # admin observer
            conn = Connection(ws, party_id, "participant")

    state = await services.rooms.get_state(party_id)
    hello = {
        "type": "hello",
        "kind": conn.kind,
        "participant_id": conn.participant_id,
        "server_time": utcnow().isoformat(),
    }
    await conn.send(hello)
    if state.session.status == PartyStatus.ENDED and conn.kind != "device":
        await conn.send(state.model_dump(mode="json"))
        await _reject(ws, 4410, "This party has ended")
        return

    services.hub.add(conn)
    await _touch(services, conn)
    await services.rooms.broadcast_presence(party_id)  # includes this connection's snapshot

    try:
        while True:
            msg = await _receive(ws)
            if msg is None:
                continue
            kind = msg.get("type")
            if kind == "ping":
                await conn.send({"type": "pong", "server_time": utcnow().isoformat()})
            elif kind == "sync":
                state = await services.rooms.get_state(party_id)
                await conn.send(state.model_dump(mode="json"))
            elif kind == "progress" and conn.kind == "device":
                try:
                    p = _Progress.model_validate(msg)
                except ValidationError:
                    continue
                await services.rooms.tv_progress(
                    party_id,
                    conn.device_id,
                    p.item_id,
                    p.generation,
                    p.position,
                    p.duration,
                    p.state,
                )
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        log.exception("websocket error", extra={"session_id": party_id})
    finally:
        services.hub.remove(conn)
        # Disconnect cancellation must not interrupt a database transaction and return a
        # half-closed connection to the pool. Bound cleanup while shielding outer cancellation.
        with anyio.move_on_after(5, shield=True):
            await _touch(services, conn)
            await services.rooms.broadcast_presence(party_id)


async def _touch(services: Services, conn: Connection) -> None:
    with contextlib.suppress(Exception):
        async with services.sessionmaker() as db:
            async with db.begin():
                if conn.participant_id:
                    row = await db.get(Participant, conn.participant_id)
                else:
                    row = await db.get(Device, conn.device_id) if conn.device_id else None
                if row is not None:
                    row.last_seen_at = utcnow()
