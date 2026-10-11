import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import vid


def wait_for(ws, predicate, limit=30):
    """Read messages until one satisfies predicate (presence updates may arrive in between)."""
    seen = []
    for _ in range(limit):
        msg = ws.receive_json()
        seen.append(msg)
        if predicate(msg):
            return msg
    raise AssertionError(f"condition not met; got {[m.get('type') for m in seen]}")


def connect(client, token, session_id=None):
    ws = client.websocket_connect("/api/ws").__enter__()
    ws.send_json({"type": "auth", "token": token, "session_id": session_id})
    hello = ws.receive_json()
    assert hello["type"] == "hello", hello
    return ws


def test_guest_receives_snapshot_and_live_updates(party, client):
    api = party.api
    jess = api.join(party.code, "Jessica")
    mike = api.join(party.code, "Mike")
    ws = connect(client, jess.token)
    try:
        first = wait_for(ws, lambda m: m["type"] == "room_state")
        assert first["session"]["id"] == party.sid
        me = next(p for p in first["participants"] if p["id"] == jess.id)
        assert me["online"] is True

        api.add(mike.token, party.sid, vid(1))
        state = wait_for(ws, lambda m: m["type"] == "room_state" and m["queue"])
        assert state["queue"][0]["singer"] == "Mike" and state["version"] > first["version"]
        event = wait_for(ws, lambda m: m["type"] == "event")
        assert event["event"] == "song_added" and event["data"]["position"] == 1
    finally:
        ws.__exit__(None, None, None)


def test_tv_socket_progress_is_broadcast_to_guests(party, client):
    api = party.api
    g = api.join(party.code, "G")
    item = api.add(g.token, party.sid, vid(1))["item"]["id"]
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "started", item, 1)

    guest_ws = connect(client, g.token)
    tv_ws = connect(client, party.tv, party.sid)
    try:
        tv_state = wait_for(tv_ws, lambda m: m["type"] == "room_state")
        assert tv_state["tv_online"] is True
        tv_ws.send_json(
            {
                "type": "progress",
                "item_id": item,
                "generation": 1,
                "position": 42.5,
                "duration": 200,
                "state": "playing",
            }
        )
        progress = wait_for(guest_ws, lambda m: m["type"] == "progress")
        assert progress["position"] == 42.5 and progress["state"] == "playing"
        # stale progress is dropped and does not move the stored position
        tv_ws.send_json(
            {
                "type": "progress",
                "item_id": item,
                "generation": 0,
                "position": 99,
                "duration": 200,
                "state": "playing",
            }
        )
        tv_ws.send_json({"type": "ping"})
        assert wait_for(tv_ws, lambda m: m["type"] == "pong")
        assert party.state()["playback"]["position_seconds"] == 42.5
    finally:
        tv_ws.__exit__(None, None, None)
        guest_ws.__exit__(None, None, None)


def test_show_join_reaches_only_the_tv(party, client):
    tv_ws = connect(client, party.tv, party.sid)
    try:
        party.api.command(party.tv, party.sid, "show_join")
        event = wait_for(tv_ws, lambda m: m["type"] == "event")
        assert event["event"] == "show_join"
    finally:
        tv_ws.__exit__(None, None, None)


def test_bad_auth_is_rejected(client):
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": "p_invalid"})
        msg = ws.receive_json()
        assert msg["type"] == "error" and msg["code"] == 4401
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4401


def test_tv_cannot_join_someone_elses_party(party, client, api):
    other = api.paired_tv()
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": other, "session_id": party.sid})
        assert ws.receive_json()["code"] == 4403


def test_party_end_disconnects_guests(party, client):
    g = party.api.join(party.code, "G")
    ws = connect(client, g.token)
    try:
        party.api.c.post(
            f"/api/sessions/{party.sid}/end", headers={"Authorization": f"Bearer {party.tv}"}
        )
        ended = wait_for(
            ws, lambda m: m["type"] == "room_state" and m["session"]["status"] == "ended"
        )
        assert ended["now_playing"] is None
        with pytest.raises(WebSocketDisconnect) as exc:
            for _ in range(10):
                ws.receive_json()
        assert exc.value.code == 4410
    finally:
        ws.__exit__(None, None, None)
