"""Phase 1 "done when": a simulated TV and four guests keep a consistent real-time queue."""

import uuid

from tests.conftest import auth, vid
from tests.test_ws import connect, wait_for


def test_four_guests_and_a_tv_full_session(party, client):
    api = party.api
    names = ["Jessica", "Mike", "Priya", "Sam"]
    guests = [api.join(party.code, n) for n in names]
    sockets = [connect(client, g.token) for g in guests]
    tv_ws = connect(client, party.tv, party.sid)
    try:
        # Two rounds of requests, interleaved across guests.
        expected = []
        for round_ in range(2):
            for i, g in enumerate(guests):
                n = round_ * 10 + i
                api.add(g.token, party.sid, vid(n), key=uuid.uuid4().hex)
                expected.append((g.name, vid(n)))
        api.command(party.tv, party.sid, "start")

        played = []
        for _ in range(len(expected)):
            state = party.state()
            current = state["now_playing"]
            gen = state["playback"]["generation"]
            assert state["playback"]["phase"] == "intro"
            api.tv_event(party.tv, party.sid, "started", current["id"], gen)
            api.tv_event(party.tv, party.sid, "ended", current["id"], gen)
            api.tv_event(party.tv, party.sid, "ended", current["id"], gen)  # duplicate: ignored
            played.append((current["singer"], current["video_id"]))

        assert played == expected  # strict FIFO
        final = party.state()
        assert final["playback"]["phase"] == "idle" and final["queue"] == []
        assert len(final["history"]) == len(expected)

        # Every device converges on the same final snapshot version.
        for ws in [*sockets, tv_ws]:
            last = wait_for(
                ws,
                lambda m: m["type"] == "room_state" and m["version"] == final["version"],
                limit=400,
            )
            assert last["queue"] == [] and last["now_playing"] is None
    finally:
        for ws in [*sockets, tv_ws]:
            ws.__exit__(None, None, None)


def test_guest_rejoin_keeps_their_songs(party):
    """A guest whose phone reloads keeps using the same token and sees their songs."""
    api = party.api
    g = api.join(party.code, "Jo")
    api.add(g.token, party.sid, vid(1))
    state = api.state(g.token, party.sid)
    mine = [i for i in state["queue"] if i["participant_id"] == g.id]
    assert len(mine) == 1
    assert api.c.get(f"/api/sessions/{party.sid}/state", headers=auth(g.token)).status_code == 200
