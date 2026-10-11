"""TV device protocol: registration, pairing status, party bootstrap and playback events."""

from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import Services, client_ip, get_services, require_device, require_paired_device
from app.errors import AppError, forbidden
from app.models import Device, Party, PartyStatus, utcnow
from app.schemas import (
    HostInviteResponse,
    TvPlaybackRequest,
    TvPlaybackResponse,
    TvRegisterRequest,
    TvRegisterResponse,
    TvSessionResponse,
    TvStatus,
)
from app.security import DEVICE_PREFIX, hash_token, new_code, new_token

router = APIRouter(prefix="/api/tv", tags=["tv"])


async def _fresh_pairing_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = new_code(6)
        clash = await db.scalar(
            select(Device.id).where(Device.pairing_code == code, Device.paired_at.is_(None))
        )
        if not clash:
            return code
    raise AppError(500, "pairing_code_exhausted", "Could not allocate a pairing code")


@router.post("/register", response_model=TvRegisterResponse)
async def register(
    body: TvRegisterRequest, request: Request, services: Services = Depends(get_services)
):
    """Create an unpaired TV identity. The admin approves it by entering the pairing code."""
    services.limits.register.check(client_ip(request))
    secret = new_token(DEVICE_PREFIX)
    expires = utcnow() + timedelta(minutes=services.settings.pairing_code_minutes)
    async with services.sessionmaker() as db:
        async with db.begin():
            device = Device(
                name=(body.name or "Living Room TV").strip()[:40] or "Living Room TV",
                secret_hash=hash_token(secret),
                pairing_code=await _fresh_pairing_code(db),
                pairing_expires_at=expires,
                user_agent=request.headers.get("user-agent", "")[:256],
            )
            db.add(device)
    return TvRegisterResponse(
        device_id=device.id,
        device_secret=secret,
        pairing_code=device.pairing_code,
        pairing_expires_at=expires,
    )


@router.get("/me", response_model=TvStatus)
async def me(device: Device = Depends(require_device), services: Services = Depends(get_services)):
    async with services.sessionmaker() as db:
        async with db.begin():
            row = await db.get(Device, device.id)
            row.last_seen_at = utcnow()
            if row.paired_at is None and (
                row.pairing_expires_at is None or row.pairing_expires_at < utcnow()
            ):
                row.pairing_code = await _fresh_pairing_code(db)
                row.pairing_expires_at = utcnow() + timedelta(
                    minutes=services.settings.pairing_code_minutes
                )
    return TvStatus(
        device_id=row.id,
        name=row.name,
        paired=row.paired_at is not None,
        pairing_code=row.pairing_code if row.paired_at is None else None,
        pairing_expires_at=row.pairing_expires_at if row.paired_at is None else None,
    )


@router.post("/session", response_model=TvSessionResponse)
async def current_session(
    device: Device = Depends(require_paired_device), services: Services = Depends(get_services)
):
    """Resume the TV's open party, or create a fresh one."""
    party_id = await services.rooms.device_party(device)
    state = await services.rooms.get_state(party_id)
    return TvSessionResponse(session_id=party_id, join_code=state.session.join_code, state=state)


@router.post("/session/new", response_model=TvSessionResponse)
async def new_session(
    device: Device = Depends(require_paired_device), services: Services = Depends(get_services)
):
    """End any open party on this TV and start a new one (new join code)."""
    party_id = await services.rooms.device_party(device, force_new=True)
    state = await services.rooms.get_state(party_id)
    return TvSessionResponse(session_id=party_id, join_code=state.session.join_code, state=state)


async def _own_party(services: Services, party_id: str, device: Device) -> Party:
    async with services.sessionmaker() as db:
        party = await db.get(Party, party_id)
    if party is None or party.device_id != device.id:
        raise forbidden("This TV isn't running this party")
    return party


@router.post("/sessions/{party_id}/playback", response_model=TvPlaybackResponse)
async def playback_event(
    party_id: str,
    body: TvPlaybackRequest,
    device: Device = Depends(require_paired_device),
    services: Services = Depends(get_services),
):
    """Player reports `started`, `ended` or `failed` for (item_id, generation).

    Stale or duplicate events (wrong generation/item) are acknowledged with accepted=false and
    change nothing, so a double ENDED can never skip two songs.
    """
    await _own_party(services, party_id, device)
    accepted, state = await services.rooms.tv_event(
        party_id,
        device,
        body.event,
        body.item_id,
        body.generation,
        duration=body.duration,
        error_code=body.error_code,
    )
    return TvPlaybackResponse(accepted=accepted, state=state)


@router.post("/sessions/{party_id}/host-invite", response_model=HostInviteResponse)
async def host_invite(
    party_id: str,
    device: Device = Depends(require_paired_device),
    services: Services = Depends(get_services),
):
    """Short-lived host link, shown as a QR in the TV menu (only reachable with the remote)."""
    party = await _own_party(services, party_id, device)
    if party.status == PartyStatus.ENDED:
        raise AppError(409, "party_ended", "This party has ended.")
    invite = services.signer.host_invite(party_id)
    expires = utcnow() + timedelta(minutes=services.settings.host_invite_minutes)
    return HostInviteResponse(invite=invite, expires_at=expires, path=f"/host/claim#{invite}")
