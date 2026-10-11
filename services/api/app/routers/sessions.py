from fastapi import APIRouter, Depends

from app.deps import Services, get_services, host_actor, party_actor
from app.errors import forbidden
from app.schemas import (
    CommandRequest,
    DuetPartner,
    EnqueueRequest,
    EnqueueResponse,
    MoveRequest,
    RoomState,
    SettingsUpdate,
)
from app.services.rooms import Actor

router = APIRouter(prefix="/api/sessions/{party_id}", tags=["sessions"])


@router.get("/state", response_model=RoomState)
async def get_state(
    party_id: str,
    _actor: Actor = Depends(party_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.get_state(party_id)


# Alias matching the original plan's route table.
router.add_api_route("/queue", get_state, methods=["GET"], response_model=RoomState)


@router.post("/queue", response_model=EnqueueResponse)
async def enqueue(
    party_id: str,
    body: EnqueueRequest,
    actor: Actor = Depends(party_actor),
    services: Services = Depends(get_services),
):
    if actor.participant is None:
        raise forbidden("Join the party from your phone to add songs")
    services.limits.enqueue.check(actor.participant.id)
    info = await services.youtube.get_video(body.video_id)
    item, position, duplicate, state = await services.rooms.add_item(
        party_id, actor, info, body.idempotency_key, body
    )
    return EnqueueResponse(item=item, position=position, duplicate=duplicate, state=state)


@router.delete("/queue/{item_id}", response_model=RoomState)
async def cancel_item(
    party_id: str,
    item_id: str,
    actor: Actor = Depends(party_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.cancel_item(party_id, actor, item_id)


@router.put("/queue/{item_id}/partner", response_model=RoomState)
async def set_partner(
    party_id: str,
    item_id: str,
    body: DuetPartner,
    actor: Actor = Depends(party_actor),
    services: Services = Depends(get_services),
):
    """Make a song a duet (or change/remove the partner). Empty body = solo again."""
    return await services.rooms.set_partner(party_id, actor, item_id, body)


@router.post("/queue/{item_id}/move", response_model=RoomState)
async def move_item(
    party_id: str,
    item_id: str,
    body: MoveRequest,
    actor: Actor = Depends(host_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.move_item(party_id, actor, item_id, body.to_index)


@router.post("/queue/{item_id}/requeue", response_model=RoomState)
async def requeue_item(
    party_id: str,
    item_id: str,
    actor: Actor = Depends(party_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.requeue_item(party_id, actor, item_id)


@router.post("/commands", response_model=RoomState)
async def command(
    party_id: str,
    body: CommandRequest,
    actor: Actor = Depends(host_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.command(party_id, actor, body.command, body.expected_item_id)


@router.patch("/settings", response_model=RoomState)
async def update_settings(
    party_id: str,
    body: SettingsUpdate,
    actor: Actor = Depends(host_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.update_settings(party_id, actor, body)


@router.post("/end", response_model=RoomState)
async def end_party(
    party_id: str,
    actor: Actor = Depends(host_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.end_party(party_id, actor)


@router.delete("/participants/{participant_id}", response_model=RoomState)
async def remove_participant(
    party_id: str,
    participant_id: str,
    actor: Actor = Depends(host_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.remove_participant(party_id, participant_id, actor)


@router.post("/participants/{participant_id}/host", response_model=RoomState)
async def promote_participant(
    party_id: str,
    participant_id: str,
    actor: Actor = Depends(host_actor),
    services: Services = Depends(get_services),
):
    return await services.rooms.make_host(party_id, participant_id, actor)
