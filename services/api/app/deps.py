from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.config import Settings
from app.errors import AppError, forbidden, unauthorized
from app.models import Device, Participant, Party, PartyStatus, utcnow
from app.ratelimit import Limits
from app.realtime import Hub
from app.security import (
    ADMIN_PREFIX,
    DEVICE_PREFIX,
    PARTICIPANT_PREFIX,
    Signer,
    hash_token,
)
from app.services.rooms import Actor, RoomService
from app.songbook import Songbook
from app.youtube import YouTubeService

# Guests may still read the final state of a party for a while after it ends.
ENDED_GRACE = timedelta(hours=6)


@dataclass
class Services:
    settings: Settings
    engine: AsyncEngine
    sessionmaker: async_sessionmaker
    hub: Hub
    rooms: RoomService
    youtube: YouTubeService
    songbook: Songbook
    signer: Signer
    limits: Limits


@dataclass
class Auth:
    kind: str  # admin | participant | device
    participant: Participant | None = None
    device: Device | None = None
    party: Party | None = None

    def actor(self) -> Actor:
        if self.kind == "participant":
            assert self.participant is not None
            return Actor(self.participant.role, participant=self.participant)
        if self.kind == "device":
            return Actor("device", device=self.device)
        return Actor("admin")


def get_services(request: Request) -> Services:
    return request.app.state.services


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        return token or None
    return None


async def resolve_token(services: Services, token: str | None) -> Auth | None:
    if not token or len(token) > 512:
        return None
    if token.startswith(PARTICIPANT_PREFIX):
        async with services.sessionmaker() as db:
            participant = await db.scalar(
                select(Participant).where(Participant.token_hash == hash_token(token))
            )
            if participant is None or participant.removed_at is not None:
                return None
            party = await db.get(Party, participant.session_id)
        if party is None:
            return None
        if party.status == PartyStatus.ENDED and (
            party.ended_at is None or utcnow() - party.ended_at > ENDED_GRACE
        ):
            return None
        return Auth("participant", participant=participant, party=party)
    if token.startswith(DEVICE_PREFIX):
        async with services.sessionmaker() as db:
            device = await db.scalar(select(Device).where(Device.secret_hash == hash_token(token)))
        if device is None or device.revoked_at is not None:
            return None
        return Auth("device", device=device)
    if token.startswith(ADMIN_PREFIX):
        max_age = services.settings.admin_token_days * 86400
        if services.settings.admin_password and services.signer.verify_admin_token(token, max_age):
            return Auth("admin")
    return None


async def current_auth(request: Request, services: Services = Depends(get_services)) -> Auth:
    auth = await resolve_token(services, bearer_token(request))
    if auth is None:
        raise unauthorized("Your session has expired. Please join again.")
    return auth


async def optional_auth(request: Request, services: Services = Depends(get_services)):
    return await resolve_token(services, bearer_token(request))


async def require_admin(auth: Auth = Depends(current_auth)) -> Auth:
    if auth.kind != "admin":
        raise forbidden("Admin login required")
    return auth


async def require_device(auth: Auth = Depends(current_auth)) -> Device:
    if auth.kind != "device" or auth.device is None:
        raise forbidden("TV credentials required")
    return auth.device


async def require_paired_device(device: Device = Depends(require_device)) -> Device:
    if device.paired_at is None:
        raise AppError(403, "device_not_paired", "This TV hasn't been paired yet.")
    return device


async def require_participant(auth: Auth = Depends(current_auth)) -> Participant:
    if auth.kind != "participant" or auth.participant is None:
        raise forbidden("Join the party first")
    return auth.participant


async def party_actor(
    party_id: str,
    auth: Auth = Depends(current_auth),
    services: Services = Depends(get_services),
) -> Actor:
    """Authorize any member of `party_id`: its guests/hosts, its TV, or the admin."""
    if auth.kind == "participant":
        if auth.participant is None or auth.participant.session_id != party_id:
            raise forbidden("You're not part of this party")
        return auth.actor()
    if auth.kind == "device":
        async with services.sessionmaker() as db:
            party = await db.get(Party, party_id)
        if party is None or auth.device is None or party.device_id != auth.device.id:
            raise forbidden("This TV isn't running this party")
        return auth.actor()
    return auth.actor()


def require_host(actor: Actor) -> Actor:
    if not actor.is_host:
        raise forbidden("Only the host can do that")
    return actor


async def host_actor(actor: Actor = Depends(party_actor)) -> Actor:
    return require_host(actor)
