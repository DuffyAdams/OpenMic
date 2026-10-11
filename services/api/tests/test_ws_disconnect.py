import pytest

from tests.test_ws import wait_for


@pytest.mark.timeout(10)
def test_disconnect_finishes_presence_cleanup(party, client):
    guest = party.api.join(party.code, "Disconnect regression")
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": guest.token})
        assert ws.receive_json()["type"] == "hello"
        state = wait_for(ws, lambda message: message["type"] == "room_state")
        assert next(p for p in state["participants"] if p["id"] == guest.id)["online"]
    state = party.state()
    assert not next(p for p in state["participants"] if p["id"] == guest.id)["online"]
