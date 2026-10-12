from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

from app.deps import Auth, Services, client_ip, get_services, require_admin
from app.errors import AppError, not_found
from app.models import Device, ItemStatus, Participant, Party, PartyStatus, QueueItem, Role, utcnow
from app.schemas import (
    AdminHostJoin,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminOverview,
    AdminSessionOut,
    DeviceOut,
    DeviceRename,
    JoinResponse,
    MeOut,
    PairRequest,
    RoomState,
)
from app.security import normalize_code, passwords_match
from app.services.rooms import Actor

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
async def login(
    body: AdminLoginRequest, request: Request, services: Services = Depends(get_services)
):
    services.limits.admin_login.check(client_ip(request))
    if not services.settings.admin_password:
        raise AppError(
            503, "admin_not_configured", "Set ADMIN_PASSWORD on the server to enable admin login."
        )
    if not passwords_match(body.password, services.settings.admin_password):
        raise AppError(401, "wrong_password", "That password isn't right.")
    expires = utcnow() + timedelta(days=services.settings.admin_token_days)
    return AdminLoginResponse(token=services.signer.admin_token(), expires_at=expires)


@router.get("/overview", response_model=AdminOverview)
async def overview(_: Auth = Depends(require_admin), services: Services = Depends(get_services)):
    online = services.hub.online_device_ids()
    async with services.sessionmaker() as db:
        devices = (
            await db.scalars(
                select(Device)
                .where(Device.revoked_at.is_(None), Device.paired_at.is_not(None))
                .order_by(Device.paired_at)
            )
        ).all()
        parties = (
            await db.scalars(
                select(Party)
                .where(
                    (Party.status != PartyStatus.ENDED)
                    | (Party.ended_at > utcnow() - timedelta(days=2))
                )
                .order_by(Party.created_at.desc())
                .limit(30)
            )
        ).all()
        guests = dict(
            (
                await db.execute(
                    select(Participant.session_id, func.count(Participant.id))
                    .where(Participant.removed_at.is_(None))
                    .group_by(Participant.session_id)
                )
            ).all()
        )
        counts = (
            await db.execute(
                select(QueueItem.session_id, QueueItem.status, func.count(QueueItem.id)).group_by(
                    QueueItem.session_id, QueueItem.status
                )
            )
        ).all()
    pending = {sid: n for sid, status, n in counts if status == ItemStatus.PENDING}
    played = {sid: n for sid, status, n in counts if status == ItemStatus.COMPLETED}
    open_by_device = {
        p.device_id: p for p in parties if p.status != PartyStatus.ENDED and p.device_id
    }
    return AdminOverview(
        devices=[
            DeviceOut(
                id=d.id,
                name=d.name,
                paired=True,
                paired_at=d.paired_at,
                last_seen_at=d.last_seen_at,
                online=d.id in online,
                active_session_id=open_by_device[d.id].id if d.id in open_by_device else None,
                active_join_code=open_by_device[d.id].join_code if d.id in open_by_device else None,
            )
            for d in devices
        ],
        sessions=[
            AdminSessionOut(
                id=p.id,
                join_code=p.join_code,
                title=p.title,
                status=p.status,
                device_id=p.device_id,
                created_at=p.created_at,
                guest_count=guests.get(p.id, 0),
                pending_count=pending.get(p.id, 0),
                songs_played=played.get(p.id, 0),
            )
            for p in parties
        ],
        search_enabled=services.youtube.search_enabled,
        searches_remaining_today=services.youtube.searches_remaining_today(),
    )


@router.post("/devices/pair", response_model=DeviceOut)
async def pair_device(
    body: PairRequest, _: Auth = Depends(require_admin), services: Services = Depends(get_services)
):
    code = normalize_code(body.code)
    async with services.sessionmaker() as db:
        async with db.begin():
            device = await db.scalar(
                select(Device).where(
                    Device.pairing_code == code,
                    Device.paired_at.is_(None),
                    Device.revoked_at.is_(None),
                )
            )
            if device is None or (
                device.pairing_expires_at is not None and device.pairing_expires_at < utcnow()
            ):
                raise AppError(
                    404, "pairing_code_invalid", "That code didn't match a TV. Check the TV screen."
                )
            device.paired_at = utcnow()
            device.pairing_code = None
            device.pairing_expires_at = None
            if body.name and body.name.strip():
                device.name = body.name.strip()[:40]
    return DeviceOut(
        id=device.id,
        name=device.name,
        paired=True,
        paired_at=device.paired_at,
        last_seen_at=device.last_seen_at,
        online=False,
        active_session_id=None,
        active_join_code=None,
    )


@router.patch("/devices/{device_id}", response_model=DeviceOut)
async def rename_device(
    device_id: str,
    body: DeviceRename,
    _: Auth = Depends(require_admin),
    services: Services = Depends(get_services),
):
    async with services.sessionmaker() as db:
        async with db.begin():
            device = await db.get(Device, device_id)
            if device is None or device.revoked_at is not None:
                raise not_found("TV not found")
            device.name = body.name.strip()
    return DeviceOut(
        id=device.id,
        name=device.name,
        paired=device.paired_at is not None,
        paired_at=device.paired_at,
        last_seen_at=device.last_seen_at,
        online=device.id in services.hub.online_device_ids(),
        active_session_id=None,
        active_join_code=None,
    )


@router.delete("/devices/{device_id}", status_code=204)
async def revoke_device(
    device_id: str, _: Auth = Depends(require_admin), services: Services = Depends(get_services)
):
    async with services.sessionmaker() as db:
        async with db.begin():
            device = await db.get(Device, device_id)
            if device is None:
                raise not_found("TV not found")
            device.revoked_at = utcnow()
        open_parties = (
            await db.scalars(
                select(Party.id).where(
                    Party.device_id == device_id, Party.status != PartyStatus.ENDED
                )
            )
        ).all()
    for party_id in open_parties:
        await services.rooms.end_party(party_id, Actor("admin"))
        await services.hub.close_room(party_id, code=4401)


@router.post("/sessions/{party_id}/host", response_model=JoinResponse)
async def host_join(
    party_id: str,
    body: AdminHostJoin,
    _: Auth = Depends(require_admin),
    services: Services = Depends(get_services),
):
    """Give the admin a host identity in a party (so they can also queue songs)."""
    participant, token, state = await services.rooms.join(
        party_id, body.display_name, role=Role.HOST, avatar=body.avatar
    )
    return JoinResponse(
        token=token,
        session_id=party_id,
        join_code=state.session.join_code,
        participant=MeOut(
            id=participant.id,
            display_name=participant.display_name,
            avatar=participant.avatar,
            role=participant.role,
        ),
        state=state,
    )


@router.post("/sessions/{party_id}/end", response_model=RoomState)
async def end_session(
    party_id: str, _: Auth = Depends(require_admin), services: Services = Depends(get_services)
):
    return await services.rooms.end_party(party_id, Actor("admin"))
