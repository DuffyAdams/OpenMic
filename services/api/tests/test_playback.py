from tests.conftest import auth, vid


def _setup(party, n=3):
    api = party.api
    g = api.join(party.code, "Jessica")
    ids = [api.add(g.token, party.sid, vid(i))["item"]["id"] for i in range(1, n + 1)]
    return g, ids


def test_lobby_does_not_autoplay_until_start(party):
    _, ids = _setup(party)
    state = party.state()
    assert state["session"]["status"] == "lobby"
    assert state["playback"]["phase"] == "idle" and state["now_playing"] is None
    state = party.api.command(party.tv, party.sid, "start")
    assert state["session"]["status"] == "active"
    assert state["playback"]["phase"] == "intro"
    assert state["now_playing"]["id"] == ids[0] and state["now_playing"]["status"] == "preparing"
    assert state["playback"]["generation"] == 1
    assert [i["id"] for i in state["queue"]] == ids[1:]


def test_full_track_lifecycle_and_auto_advance(party):
    api = party.api
    _, ids = _setup(party)
    api.command(party.tv, party.sid, "start")
    r = api.tv_event(party.tv, party.sid, "started", ids[0], 1, duration=212.4)
    assert r["accepted"] is True
    state = r["state"]
    assert state["playback"]["phase"] == "playing"
    assert state["now_playing"]["status"] == "playing"
    assert state["now_playing"]["duration_seconds"] == 200  # mock metadata already had one

    r = api.tv_event(party.tv, party.sid, "ended", ids[0], 1)
    assert r["accepted"] is True
    state = r["state"]
    assert state["now_playing"]["id"] == ids[1]
    assert state["playback"] == {**state["playback"], "phase": "intro", "generation": 2}
    assert state["history"][0]["id"] == ids[0] and state["history"][0]["status"] == "completed"


def test_duplicate_ended_cannot_skip_two_songs(party):
    api = party.api
    _, ids = _setup(party)
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "started", ids[0], 1)
    first = api.tv_event(party.tv, party.sid, "ended", ids[0], 1)
    second = api.tv_event(party.tv, party.sid, "ended", ids[0], 1)
    assert first["accepted"] is True and second["accepted"] is False
    state = party.state()
    assert state["now_playing"]["id"] == ids[1]
    assert state["now_playing"]["status"] == "preparing"
    assert [i["id"] for i in state["queue"]] == [ids[2]]


def test_stale_generation_ignored(party):
    api = party.api
    _, ids = _setup(party)
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "started", ids[0], 1)
    api.command(party.tv, party.sid, "skip")  # generation 2 now holds ids[1]
    late = api.tv_event(party.tv, party.sid, "ended", ids[0], 1)
    assert late["accepted"] is False
    wrong_item = api.tv_event(party.tv, party.sid, "ended", ids[2], 2)
    assert wrong_item["accepted"] is False
    state = party.state()
    assert state["now_playing"]["id"] == ids[1] and state["playback"]["generation"] == 2


def test_started_is_idempotent(party):
    api = party.api
    _, ids = _setup(party, 1)
    api.command(party.tv, party.sid, "start")
    v1 = api.tv_event(party.tv, party.sid, "started", ids[0], 1)["state"]["version"]
    again = api.tv_event(party.tv, party.sid, "started", ids[0], 1)
    assert again["accepted"] is True and again["state"]["version"] == v1


def test_failed_video_auto_skips(party):
    api = party.api
    _, ids = _setup(party)
    api.command(party.tv, party.sid, "start")
    r = api.tv_event(party.tv, party.sid, "failed", ids[0], 1, error_code="150")
    assert r["accepted"] is True
    state = r["state"]
    assert state["now_playing"]["id"] == ids[1] and state["playback"]["phase"] == "intro"
    failed = state["history"][0]
    assert failed["status"] == "failed"
    assert failed["failure_reason"] == "Embedding disabled by uploader"


def test_failed_video_without_auto_skip_waits_for_host(party):
    api = party.api
    _, ids = _setup(party)
    r = api.c.patch(
        f"/api/sessions/{party.sid}/settings",
        json={"auto_skip_failed": False},
        headers=auth(party.tv),
    )
    assert r.status_code == 200
    api.command(party.tv, party.sid, "start")
    state = api.tv_event(party.tv, party.sid, "failed", ids[0], 1, error_code="100")["state"]
    assert state["playback"]["phase"] == "error"
    assert state["now_playing"]["id"] == ids[0] and state["now_playing"]["status"] == "failed"

    state = api.command(party.tv, party.sid, "retry")
    assert state["playback"]["phase"] == "intro" and state["playback"]["generation"] == 2
    assert state["now_playing"]["status"] == "preparing"

    api.tv_event(party.tv, party.sid, "failed", ids[0], 2, error_code="100")
    state = api.command(party.tv, party.sid, "skip", expected=ids[0])
    assert state["now_playing"]["id"] == ids[1]
    assert state["history"][0]["status"] == "failed"


def test_conflicting_skips_only_skip_once(party):
    api = party.api
    _, ids = _setup(party)
    api.command(party.tv, party.sid, "start")
    api.command(party.tv, party.sid, "skip", expected=ids[0])
    err = api.command(party.tv, party.sid, "skip", expected=ids[0], expect=409)
    assert err["error"]["code"] == "stale_command"
    assert party.state()["now_playing"]["id"] == ids[1]


def test_pause_resume_restart(party):
    api = party.api
    _, ids = _setup(party, 1)
    err = api.command(party.tv, party.sid, "pause", expect=409)
    assert err["error"]["code"] == "nothing_playing"
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "started", ids[0], 1)
    assert api.command(party.tv, party.sid, "pause")["playback"]["paused"] is True
    assert api.command(party.tv, party.sid, "toggle_pause")["playback"]["paused"] is False
    state = api.command(party.tv, party.sid, "restart")
    assert state["playback"]["restart_seq"] == 1 and state["playback"]["generation"] == 1


def test_queue_empty_then_new_song_starts_immediately(party):
    api = party.api
    g, ids = _setup(party, 1)
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "started", ids[0], 1)
    state = api.tv_event(party.tv, party.sid, "ended", ids[0], 1)["state"]
    assert state["playback"]["phase"] == "idle" and state["now_playing"] is None
    added = api.add(g.token, party.sid, vid(50))
    assert added["position"] == 0
    assert added["state"]["playback"]["phase"] == "intro"


def test_end_party_and_start_new(party):
    api = party.api
    g, ids = _setup(party)
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "started", ids[0], 1)
    r = api.c.post(f"/api/sessions/{party.sid}/end", headers=auth(g.token))
    assert r.status_code == 403  # guests can't end the party
    r = api.c.post(f"/api/sessions/{party.sid}/end", headers=auth(party.tv))
    assert r.status_code == 200
    state = r.json()
    assert state["session"]["status"] == "ended" and state["now_playing"] is None
    assert state["history"][0]["status"] == "completed"
    # mutations are refused after the party ends
    assert api.add(g.token, party.sid, vid(9), expect=409)["error"]["code"] == "party_ended"
    # the TV starts a fresh party with a new join code
    fresh = api.tv_session(party.tv)
    assert fresh["session_id"] != party.sid
    assert api.c.get(f"/api/sessions/lookup/{party.code}").status_code in (200, 404)


def test_other_device_cannot_report_playback(party):
    api = party.api
    _, ids = _setup(party, 1)
    api.command(party.tv, party.sid, "start")
    other = api.paired_tv()
    r = api.c.post(
        f"/api/tv/sessions/{party.sid}/playback",
        json={"event": "ended", "item_id": ids[0], "generation": 1},
        headers=auth(other),
    )
    assert r.status_code == 403
    assert party.state()["now_playing"]["id"] == ids[0]


def test_tv_session_resumes_open_party(party):
    again = party.api.tv_session(party.tv)
    assert again["session_id"] == party.sid
    new = party.api.tv_session(party.tv, new=True)
    assert new["session_id"] != party.sid and new["join_code"] != ""
    old = party.api.c.get(f"/api/sessions/{party.sid}/state", headers=auth(party.tv))
    assert old.json()["session"]["status"] == "ended"


def test_unplayable_videos_are_hidden_and_refused(party):
    api = party.api
    g = api.join(party.code, "G")

    def search():
        return api.c.get("/api/search", params={"q": "hello"}, headers=auth(g.token)).json()

    results = search()["results"]
    bad, flaky = results[0]["video_id"], results[1]["video_id"]
    first = api.add(g.token, party.sid, bad)["item"]["id"]
    second = api.add(g.token, party.sid, flaky)["item"]["id"]
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "failed", first, 1, error_code="150")  # embedding blocked
    api.tv_event(party.tv, party.sid, "failed", second, 2, error_code="5")  # transient

    err = api.add(g.token, party.sid, bad, expect=422)
    assert err["error"]["reason"] == "embed_disabled"
    ids = [v["video_id"] for v in search()["results"]]
    assert bad not in ids and flaky in ids
    api.add(g.token, party.sid, flaky)  # a transient failure doesn't block a retry


def test_unplayable_memory_survives_restart(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import Api, make_settings

    settings = make_settings(tmp_path)
    with TestClient(create_app(settings)) as c:
        api = Api(c)
        tv = api.paired_tv()
        s = api.tv_session(tv)
        g = api.join(s["join_code"], "G")
        item = api.add(g.token, s["session_id"], vid(77))["item"]["id"]
        api.command(tv, s["session_id"], "start")
        api.tv_event(tv, s["session_id"], "failed", item, 1, error_code="101")
    with TestClient(create_app(settings.model_copy(update={"db_create_all": False}))) as c:
        assert c.app.state.services.youtube.is_unplayable(vid(77))


def test_start_timeout_after_started_is_ignored(party):
    # Two TV tabs on one device: one plays the song, the other's start watchdog gives up.
    api = party.api
    _, ids = _setup(party)
    api.command(party.tv, party.sid, "start")
    api.tv_event(party.tv, party.sid, "started", ids[0], 1)
    r = api.tv_event(party.tv, party.sid, "failed", ids[0], 1, error_code="timeout")
    assert r["accepted"] is False
    state = r["state"]
    assert state["now_playing"]["id"] == ids[0] and state["now_playing"]["status"] == "playing"
    assert state["playback"]["phase"] == "playing"
    # A real player error mid-song still counts.
    r = api.tv_event(party.tv, party.sid, "failed", ids[0], 1, error_code="5")
    assert r["accepted"] is True and r["state"]["now_playing"]["id"] == ids[1]
