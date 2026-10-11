import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import auth, make_settings, vid


def test_guest_cannot_use_host_controls(party):
    api = party.api
    g = api.join(party.code, "G")
    api.add(g.token, party.sid, vid(1))
    for command in ("start", "pause", "skip", "lock_queue", "show_join"):
        assert api.command(g.token, party.sid, command, expect=403)["error"]["code"] == "forbidden"
    r = api.c.patch(
        f"/api/sessions/{party.sid}/settings", json={"title": "X"}, headers=auth(g.token)
    )
    assert r.status_code == 403


def test_tokens_are_scoped_to_their_party(api):
    tv1, tv2 = api.paired_tv(), api.paired_tv()
    p1, p2 = api.tv_session(tv1), api.tv_session(tv2)
    g = api.join(p1["join_code"], "G")
    r = api.c.get(f"/api/sessions/{p2['session_id']}/state", headers=auth(g.token))
    assert r.status_code == 403
    r = api.c.post(
        f"/api/sessions/{p2['session_id']}/commands", json={"command": "start"}, headers=auth(tv1)
    )
    assert r.status_code == 403


def test_invalid_and_missing_tokens(party):
    c = party.api.c
    assert c.get(f"/api/sessions/{party.sid}/state").status_code == 401
    for bad in ("p_nope", "d_nope", "a_nope", "garbage"):
        assert c.get(f"/api/sessions/{party.sid}/state", headers=auth(bad)).status_code == 401


def test_admin_login(api):
    r = api.c.post("/api/admin/login", json={"password": "wrong"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "wrong_password"
    assert api.c.get("/api/admin/overview").status_code == 401
    r = api.c.get("/api/admin/overview", headers=auth(api.admin))
    assert r.status_code == 200 and r.json()["search_enabled"] is True


def test_admin_token_from_other_secret_rejected(api, tmp_path):
    from app.security import Signer

    forged = Signer("another-secret-" * 4).admin_token()
    assert api.c.get("/api/admin/overview", headers=auth(forged)).status_code == 401


def test_pairing_flow(api):
    secret, code = api.register_tv()
    me = api.c.get("/api/tv/me", headers=auth(secret)).json()
    assert me["paired"] is False and me["pairing_code"] == code
    r = api.c.post("/api/tv/session", headers=auth(secret))
    assert r.status_code == 403 and r.json()["error"]["code"] == "device_not_paired"
    r = api.c.post("/api/admin/devices/pair", json={"code": "WRONG1"}, headers=auth(api.admin))
    assert r.status_code == 404
    r = api.c.post(
        "/api/admin/devices/pair",
        json={"code": code.lower(), "name": "Den TV"},
        headers=auth(api.admin),
    )
    assert r.status_code == 200 and r.json()["name"] == "Den TV"
    me = api.c.get("/api/tv/me", headers=auth(secret)).json()
    assert me["paired"] is True and me["pairing_code"] is None
    # pairing codes are single-use
    r = api.c.post("/api/admin/devices/pair", json={"code": code}, headers=auth(api.admin))
    assert r.status_code == 404


def test_revoked_device_loses_access(party, api):
    devices = api.c.get("/api/admin/overview", headers=auth(api.admin)).json()["devices"]
    device = next(d for d in devices if d["active_session_id"] == party.sid)
    assert (
        api.c.delete(f"/api/admin/devices/{device['id']}", headers=auth(api.admin)).status_code
        == 204
    )
    assert api.c.get("/api/tv/me", headers=auth(party.tv)).status_code == 401


def test_host_invite_claim_and_upgrade(party):
    api = party.api
    invite = api.c.post(f"/api/tv/sessions/{party.sid}/host-invite", headers=auth(party.tv)).json()
    assert invite["path"].startswith("/host/claim#")

    # a brand-new phone becomes a host
    r = api.c.post("/api/host/claim", json={"invite": invite["invite"], "display_name": "Duffy"})
    assert r.status_code == 200 and r.json()["participant"]["role"] == "host"
    host_token = r.json()["token"]
    api.command(host_token, party.sid, "lock_queue")

    # an existing guest is upgraded in place, keeping their identity and token
    g = api.join(party.code, "Guest")
    r = api.c.post("/api/host/claim", json={"invite": invite["invite"]}, headers=auth(g.token))
    assert r.status_code == 200
    assert r.json()["participant"]["id"] == g.id and r.json()["token"] == g.token
    api.command(g.token, party.sid, "unlock_queue")

    r = api.c.post("/api/host/claim", json={"invite": "tampered-invite-value"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invite_invalid"


def test_host_can_promote_and_remove_guests(party):
    api = party.api
    g = api.join(party.code, "G")
    other = api.join(party.code, "Other")
    api.add(other.token, party.sid, vid(1))
    r = api.c.post(f"/api/sessions/{party.sid}/participants/{g.id}/host", headers=auth(party.tv))
    assert r.status_code == 200
    r = api.c.delete(f"/api/sessions/{party.sid}/participants/{other.id}", headers=auth(g.token))
    assert r.status_code == 200
    state = r.json()
    assert state["queue"] == [] and {p["display_name"] for p in state["participants"]} == {"G"}
    assert (
        api.c.get(f"/api/sessions/{party.sid}/state", headers=auth(other.token)).status_code == 401
    )
    r = api.c.delete(f"/api/sessions/{party.sid}/participants/{g.id}", headers=auth(g.token))
    assert r.status_code == 409


def test_rate_limit_on_join(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as c:
        statuses = [
            c.post(
                "/api/sessions/join", json={"join_code": "AAAAAA", "display_name": "X"}
            ).status_code
            for _ in range(14)
        ]
    assert statuses[:12] == [404] * 12 and statuses[-1] == 429


def test_production_requires_secrets(tmp_path):
    app = create_app(
        make_settings(tmp_path, environment="production", admin_password="", secret_key="short")
    )
    with pytest.raises(RuntimeError, match="SECRET_KEY"), TestClient(app):
        pass


def test_public_config_and_health(client):
    cfg = client.get("/api/config").json()
    assert cfg["search_enabled"] is True and cfg["admin_configured"] is True
    assert client.get("/api/health").json()["status"] == "ok"
