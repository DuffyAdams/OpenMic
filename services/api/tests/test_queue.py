from tests.conftest import auth, vid


def test_join_and_fifo_positions(party):
    api = party.api
    jess = api.join(party.code, "Jessica")
    mike = api.join(party.code.lower(), "  Mike  ")  # code is case-insensitive, name trimmed
    r1 = api.add(jess.token, party.sid, vid(1))
    r2 = api.add(mike.token, party.sid, vid(2))
    r3 = api.add(jess.token, party.sid, vid(3))
    assert (r1["position"], r2["position"], r3["position"]) == (1, 2, 3)  # lobby: nothing playing
    state = party.state()
    assert [i["video_id"] for i in state["queue"]] == [vid(1), vid(2), vid(3)]
    assert [i["sequence"] for i in state["queue"]] == [1, 2, 3]
    assert [i["singer"] for i in state["queue"]] == ["Jessica", "Mike", "Jessica"]
    assert {p["display_name"] for p in state["participants"]} == {"Jessica", "Mike"}
    # server-side metadata, never client-supplied
    assert state["queue"][0]["title"] == f"Test Song {vid(1)}"


def test_idempotent_enqueue(party):
    api = party.api
    g = api.join(party.code, "Ana")
    first = api.add(g.token, party.sid, vid(1), key="retry-key-123")
    again = api.add(g.token, party.sid, vid(1), key="retry-key-123")
    assert first["duplicate"] is False and again["duplicate"] is True
    assert first["item"]["id"] == again["item"]["id"]
    assert len(party.state()["queue"]) == 1


def test_cancel_rules(party):
    api = party.api
    a = api.join(party.code, "A")
    b = api.add(api.join(party.code, "B").token, party.sid, vid(2))["item"]["id"]
    mine = api.add(a.token, party.sid, vid(1))["item"]["id"]
    r = api.c.delete(f"/api/sessions/{party.sid}/queue/{b}", headers=auth(a.token))
    assert r.status_code == 403
    r = api.c.delete(f"/api/sessions/{party.sid}/queue/{mine}", headers=auth(a.token))
    assert r.status_code == 200 and [i["id"] for i in r.json()["queue"]] == [b]
    r = api.c.delete(f"/api/sessions/{party.sid}/queue/{mine}", headers=auth(a.token))
    assert r.status_code == 409  # already cancelled
    # the TV (host-equivalent) may remove anyone's pending song
    r = api.c.delete(f"/api/sessions/{party.sid}/queue/{b}", headers=auth(party.tv))
    assert r.status_code == 200 and r.json()["queue"] == []


def test_cannot_cancel_current_song(party):
    api = party.api
    g = api.join(party.code, "G")
    item = api.add(g.token, party.sid, vid(1))["item"]["id"]
    api.command(party.tv, party.sid, "start")
    r = api.c.delete(f"/api/sessions/{party.sid}/queue/{item}", headers=auth(g.token))
    assert r.status_code == 409 and r.json()["error"]["code"] == "item_active"


def test_queue_lock(party):
    api = party.api
    g = api.join(party.code, "G")
    api.command(party.tv, party.sid, "lock_queue")
    err = api.add(g.token, party.sid, vid(1), expect=409)
    assert err["error"]["code"] == "queue_locked"
    api.command(party.tv, party.sid, "unlock_queue")
    api.add(g.token, party.sid, vid(1))


def test_host_bypasses_lock(party, api):
    host = api.c.post(
        f"/api/admin/sessions/{party.sid}/host",
        json={"display_name": "Duffy"},
        headers=auth(api.admin),
    ).json()
    assert host["participant"]["role"] == "host"
    api.command(party.tv, party.sid, "lock_queue")
    api.add(host["token"], party.sid, vid(9))


def test_max_pending_per_guest(party):
    api = party.api
    r = api.c.patch(
        f"/api/sessions/{party.sid}/settings",
        json={"max_pending_per_guest": 2},
        headers=auth(party.tv),
    )
    assert r.status_code == 200 and r.json()["session"]["max_pending_per_guest"] == 2
    g = api.join(party.code, "G")
    api.add(g.token, party.sid, vid(1))
    api.add(g.token, party.sid, vid(2))
    assert api.add(g.token, party.sid, vid(3), expect=409)["error"]["code"] == "too_many_requests"


def test_requeue_respects_max_pending_per_guest(party):
    api = party.api
    api.c.patch(
        f"/api/sessions/{party.sid}/settings",
        json={"max_pending_per_guest": 1},
        headers=auth(party.tv),
    )
    g = api.join(party.code, "G")
    first = api.add(g.token, party.sid, vid(1))["item"]["id"]
    api.c.delete(f"/api/sessions/{party.sid}/queue/{first}", headers=auth(g.token))
    again = f"/api/sessions/{party.sid}/queue/{first}/requeue"
    assert api.c.post(again, headers=auth(g.token)).status_code == 200
    r = api.c.post(again, headers=auth(g.token))
    assert r.status_code == 409 and r.json()["error"]["code"] == "too_many_requests"
    # Hosts (here the TV) are exempt, as for normal requests.
    assert api.c.post(again, headers=auth(party.tv)).status_code == 200


def test_blank_party_title_rejected(party):
    url = f"/api/sessions/{party.sid}/settings"
    r = party.api.c.patch(url, json={"title": "   "}, headers=auth(party.tv))
    assert r.status_code == 422
    r = party.api.c.patch(url, json={"title": "  Friday   Night "}, headers=auth(party.tv))
    assert r.status_code == 200 and r.json()["session"]["title"] == "Friday Night"


def test_host_reorder_keeps_fifo_for_new_items(party):
    api = party.api
    g = api.join(party.code, "G")
    ids = [api.add(g.token, party.sid, vid(n))["item"]["id"] for n in range(1, 5)]
    r = api.c.post(
        f"/api/sessions/{party.sid}/queue/{ids[3]}/move",
        json={"to_index": 0},
        headers=auth(party.tv),
    )
    assert r.status_code == 200
    assert [i["id"] for i in r.json()["queue"]] == [ids[3], ids[0], ids[1], ids[2]]
    new = api.add(g.token, party.sid, vid(5))["item"]["id"]
    assert [i["id"] for i in party.state()["queue"]][-1] == new
    # guests cannot reorder
    r = api.c.post(
        f"/api/sessions/{party.sid}/queue/{ids[0]}/move",
        json={"to_index": 0},
        headers=auth(g.token),
    )
    assert r.status_code == 403


def test_unavailable_video_rejected(party):
    api = party.api
    g = api.join(party.code, "G")
    err = api.add(g.token, party.sid, "blocked0001", expect=422)
    assert err["error"]["code"] == "video_unavailable"
    assert err["error"]["reason"] == "embed_disabled"
    assert party.state()["queue"] == []


def test_invalid_video_id_rejected(party):
    api = party.api
    g = api.join(party.code, "G")
    r = api.c.post(
        f"/api/sessions/{party.sid}/queue",
        json={"video_id": "../../etc", "idempotency_key": "abcdefgh"},
        headers=auth(g.token),
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_requeue_finished_song(party):
    api = party.api
    g = api.join(party.code, "G")
    item = api.add(g.token, party.sid, vid(1))["item"]["id"]
    api.command(party.tv, party.sid, "start")
    gen = party.state()["playback"]["generation"]
    api.tv_event(party.tv, party.sid, "started", item, gen)
    api.tv_event(party.tv, party.sid, "ended", item, gen)
    r = api.c.post(f"/api/sessions/{party.sid}/queue/{item}/requeue", headers=auth(g.token))
    assert r.status_code == 200
    state = r.json()
    assert state["now_playing"]["video_id"] == vid(1) and state["now_playing"]["id"] != item


def test_join_validation(party):
    c = party.api.c
    r = c.post("/api/sessions/join", json={"join_code": party.code, "display_name": "   "})
    assert r.status_code == 422
    r = c.post("/api/sessions/join", json={"join_code": "ZZZZZZ", "display_name": "Bob"})
    assert r.status_code == 404
    r = c.get(f"/api/sessions/lookup/{party.code}")
    assert r.status_code == 200 and r.json()["session_id"] == party.sid


def test_search_and_resolve(party):
    api = party.api
    g = api.join(party.code, "G")
    r = api.c.get("/api/search", params={"q": "mr brightside"}, headers=auth(g.token))
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "mr brightside karaoke" and len(body["results"]) == 6
    # mock results carry an inline placeholder image (fake IDs have no YouTube thumbnail)
    assert all(r["thumbnail_url"].startswith("data:image/svg+xml") for r in body["results"])
    # a result can be queued by ID and keeps its searched metadata
    first = body["results"][0]
    added = api.add(g.token, party.sid, first["video_id"])
    assert added["item"]["title"] == first["title"]
    # pasting a link into search resolves it directly
    r = api.c.get("/api/search", params={"q": f"https://youtu.be/{vid(7)}"}, headers=auth(g.token))
    assert [v["video_id"] for v in r.json()["results"]] == [vid(7)]
    r = api.c.get("/api/videos/resolve", params={"input": "not a link"}, headers=auth(g.token))
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_url"
    # search needs a party credential
    assert api.c.get("/api/search", params={"q": "x"}).status_code == 401


def test_duet_with_guest_and_typed_name(party):
    api = party.api
    jess = api.join(party.code, "Jessica")
    mike = api.join(party.code, "Mike")
    r = api.c.post(
        f"/api/sessions/{party.sid}/queue",
        json={"video_id": vid(1), "idempotency_key": "duet-key-1", "partner_id": mike.id},
        headers=auth(jess.token),
    )
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    assert (item["singer"], item["partner"], item["partner_id"]) == ("Jessica", "Mike", mike.id)

    r = api.c.post(
        f"/api/sessions/{party.sid}/queue",
        json={"video_id": vid(2), "idempotency_key": "duet-key-2", "partner_name": " Grandma "},
        headers=auth(jess.token),
    )
    assert r.status_code == 200, r.text
    assert (r.json()["item"]["partner"], r.json()["item"]["partner_id"]) == ("Grandma", None)

    # can't duet with yourself, or name both a guest and a typed name
    r = api.c.post(
        f"/api/sessions/{party.sid}/queue",
        json={"video_id": vid(3), "idempotency_key": "duet-key-3", "partner_id": jess.id},
        headers=auth(jess.token),
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "partner_is_self"
    r = api.c.post(
        f"/api/sessions/{party.sid}/queue",
        json={
            "video_id": vid(3),
            "idempotency_key": "duet-key-4",
            "partner_id": mike.id,
            "partner_name": "X",
        },
        headers=auth(jess.token),
    )
    assert r.status_code == 422


def test_set_partner_permissions(party):
    api = party.api
    jess = api.join(party.code, "Jessica")
    mike = api.join(party.code, "Mike")
    ana = api.join(party.code, "Ana")
    item = api.add(jess.token, party.sid, vid(1))["item"]["id"]
    url = f"/api/sessions/{party.sid}/queue/{item}/partner"

    # only the requester (or a host) can pick the partner
    r = api.c.put(url, json={"partner_id": mike.id}, headers=auth(ana.token))
    assert r.status_code == 403
    r = api.c.put(url, json={"partner_id": mike.id}, headers=auth(jess.token))
    assert r.status_code == 200 and r.json()["queue"][0]["partner"] == "Mike"

    # the partner may bow out, but not swap someone else in
    r = api.c.put(url, json={"partner_id": ana.id}, headers=auth(mike.token))
    assert r.status_code == 403
    r = api.c.put(url, json={}, headers=auth(mike.token))
    assert r.status_code == 200 and r.json()["queue"][0]["partner"] is None

    # host-equivalent TV can set it too
    r = api.c.put(url, json={"partner_name": "Uncle Bob"}, headers=auth(party.tv))
    assert r.status_code == 200 and r.json()["queue"][0]["partner"] == "Uncle Bob"


def test_removed_partner_keeps_name_on_duet(party):
    api = party.api
    jess = api.join(party.code, "Jessica")
    mike = api.join(party.code, "Mike")
    item = api.add(jess.token, party.sid, vid(1))["item"]["id"]
    api.c.put(
        f"/api/sessions/{party.sid}/queue/{item}/partner",
        json={"partner_id": mike.id},
        headers=auth(jess.token),
    )
    r = api.c.delete(f"/api/sessions/{party.sid}/participants/{mike.id}", headers=auth(party.tv))
    assert r.status_code == 200
    queued = r.json()["queue"][0]
    assert (queued["partner"], queued["partner_id"]) == ("Mike", None)


def test_join_with_avatar(party):
    c = party.api.c
    r = c.post(
        "/api/sessions/join",
        json={"join_code": party.code, "display_name": "Ana", "avatar": "frog"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["participant"]["avatar"] == "frog"
    me = next(p for p in body["state"]["participants"] if p["id"] == body["participant"]["id"])
    assert me["avatar"] == "frog"
    # No picture is fine (initials); a malformed key is rejected.
    assert party.api.join(party.code, "Bo")
    r = c.post(
        "/api/sessions/join",
        json={"join_code": party.code, "display_name": "Cy", "avatar": "<script>"},
    )
    assert r.status_code == 422
