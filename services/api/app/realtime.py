"""In-process WebSocket fan-out.

The API runs as a single process (plenty for a private party), so room membership lives in
memory. Every queue/state change is broadcast as a full `room_state` snapshot carrying a version
number; clients keep the newest snapshot and never need to replay missed deltas.
"""

import asyncio
import contextlib
import logging
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import WebSocket
from starlette.websockets import WebSocketState

log = logging.getLogger(__name__)

SEND_TIMEOUT_SECONDS = 5


@dataclass(eq=False)
class Connection:
    ws: WebSocket
    party_id: str
    kind: str  # "participant" | "device"
    participant_id: str | None = None
    device_id: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, message: dict) -> bool:
        if self.ws.client_state != WebSocketState.CONNECTED:
            return False
        try:
            async with self.lock:
                await asyncio.wait_for(self.ws.send_json(message), SEND_TIMEOUT_SECONDS)
            return True
        except Exception:  # noqa: BLE001 - any send failure means the socket is gone
            return False


class Hub:
    def __init__(self):
        self._rooms: dict[str, set[Connection]] = defaultdict(set)

    def add(self, conn: Connection) -> None:
        self._rooms[conn.party_id].add(conn)

    def remove(self, conn: Connection) -> None:
        room = self._rooms.get(conn.party_id)
        if room is not None:
            room.discard(conn)
            if not room:
                del self._rooms[conn.party_id]

    def connections(self, party_id: str) -> list[Connection]:
        return list(self._rooms.get(party_id, ()))

    def tv_online(self, party_id: str) -> bool:
        return any(c.kind == "device" for c in self._rooms.get(party_id, ()))

    def online_participant_ids(self, party_id: str) -> set[str]:
        return {c.participant_id for c in self._rooms.get(party_id, ()) if c.participant_id}

    def online_device_ids(self) -> set[str]:
        return {c.device_id for room in self._rooms.values() for c in room if c.device_id}

    async def broadcast(
        self,
        party_id: str,
        message: dict,
        *,
        kind: str | None = None,
        participant_id: str | None = None,
    ) -> int:
        targets = [
            c
            for c in self.connections(party_id)
            if (kind is None or c.kind == kind)
            and (participant_id is None or c.participant_id == participant_id)
        ]
        if not targets:
            return 0
        results = await asyncio.gather(*(c.send(message) for c in targets))
        for conn, ok in zip(targets, results, strict=True):
            if not ok:
                self.remove(conn)
        return sum(results)

    async def disconnect_participant(self, party_id: str, participant_id: str, code: int) -> None:
        for conn in self.connections(party_id):
            if conn.participant_id == participant_id:
                await self._close(conn, code)

    async def close_room(self, party_id: str, code: int = 4000, *, keep_devices: bool = False):
        for conn in self.connections(party_id):
            if keep_devices and conn.kind == "device":
                continue
            await self._close(conn, code)

    async def _close(self, conn: Connection, code: int) -> None:
        self.remove(conn)
        with contextlib.suppress(Exception):
            await conn.ws.close(code=code)
