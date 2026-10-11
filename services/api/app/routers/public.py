from fastapi import APIRouter, Depends, Request
from sqlalchemy import text

from app import __version__
from app.deps import Auth, Services, client_ip, get_services, optional_auth
from app.errors import AppError, not_found
from app.models import Party, PartyStatus, Role
from app.schemas import (
    HealthResponse,
    HostClaimRequest,
    JoinRequest,
    JoinResponse,
    MeOut,
    PublicConfig,
    SessionLookup,
)
from app.security import normalize_code

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/health", response_model=HealthResponse)
async def health(services: Services = Depends(get_services)):
    ok = True
    try:
        async with services.sessionmaker() as db:
            await db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        ok = False
    return HealthResponse(status="ok" if ok else "degraded", database=ok, version=__version__)


@router.get("/config", response_model=PublicConfig)
async def public_config(services: Services = Depends(get_services)):
    s = services.settings
    return PublicConfig(
        app_name=s.app_name,
        version=__version__,
        search_enabled=services.youtube.search_enabled,
        search_provider=services.youtube.provider,
        public_base_url=s.public_base_url.rstrip("/"),
        admin_configured=bool(s.admin_password),
    )


@router.get("/sessions/lookup/{join_code}", response_model=SessionLookup)
async def lookup_session(
    join_code: str, request: Request, services: Services = Depends(get_services)
):
    services.limits.lookup.check(client_ip(request))
    party = await services.rooms.find_open_party_by_code(normalize_code(join_code))
    if party is None:
        raise not_found("No party found with that code. Check the code on the TV.")
    return SessionLookup(
        session_id=party.id,
        join_code=party.join_code,
        title=party.title,
        status=party.status,
        queue_open=party.queue_open,
        guest_count=await services.rooms.guest_count(party.id),
    )


@router.post("/sessions/join", response_model=JoinResponse)
async def join_session(
    body: JoinRequest, request: Request, services: Services = Depends(get_services)
):
    services.limits.join.check(client_ip(request))
    party = await services.rooms.find_open_party_by_code(normalize_code(body.join_code))
    if party is None:
        raise not_found("No party found with that code. Check the code on the TV.")
    participant, token, state = await services.rooms.join(party.id, body.display_name)
    return JoinResponse(
        token=token,
        session_id=party.id,
        join_code=party.join_code,
        participant=MeOut(
            id=participant.id, display_name=participant.display_name, role=participant.role
        ),
        state=state,
    )


@router.post("/host/claim", response_model=JoinResponse)
async def claim_host(
    body: HostClaimRequest,
    request: Request,
    auth: Auth | None = Depends(optional_auth),
    services: Services = Depends(get_services),
):
    """Redeem a host invite shown on the TV menu (proof of physical access to the remote)."""
    services.limits.join.check(client_ip(request))
    party_id = services.signer.verify_host_invite(
        body.invite, services.settings.host_invite_minutes * 60
    )
    if party_id is None:
        raise AppError(
            400, "invite_invalid", "That host code has expired. Open it again on the TV."
        )
    async with services.sessionmaker() as db:
        party = await db.get(Party, party_id)
    if party is None or party.status == PartyStatus.ENDED:
        raise AppError(409, "party_ended", "This party has ended.")

    # Upgrade the phone's existing guest identity when it already joined this party.
    if auth and auth.kind == "participant" and auth.participant.session_id == party_id:
        participant = auth.participant
        state = await services.rooms.make_host(party_id, participant.id, auth.actor())
        token = request.headers["authorization"][7:].strip()
        role = Role.HOST
    else:
        participant, token, state = await services.rooms.join(
            party_id, body.display_name or "Host", role=Role.HOST
        )
        role = participant.role
    return JoinResponse(
        token=token,
        session_id=party.id,
        join_code=party.join_code,
        participant=MeOut(id=participant.id, display_name=participant.display_name, role=role),
        state=state,
    )
