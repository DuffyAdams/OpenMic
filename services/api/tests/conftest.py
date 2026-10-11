import asyncio
import os
import uuid
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings
from app.main import create_app

ADMIN_PASSWORD = "test-admin-password"

# Set TEST_DATABASE_URL=postgresql+asyncpg://... to run the suite against PostgreSQL.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")


@pytest.fixture(autouse=True)
def _fresh_postgres():
    if TEST_DATABASE_URL:

        async def reset():
            engine = create_async_engine(TEST_DATABASE_URL)
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))
            await engine.dispose()

        asyncio.run(reset())
    yield


def make_settings(tmp_path, **overrides) -> Settings:
    values = dict(
        environment="test",
        database_url=TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path}/test.db",
        db_create_all=True,
        auto_migrate=False,
        admin_password=ADMIN_PASSWORD,
        secret_key="t" * 48,
        youtube_api_key="",
        search_provider="mock",
        log_level="WARNING",
    )
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def settings(tmp_path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
def client(settings):
    app = create_app(settings)
    with TestClient(app) as c:
        for limiter in vars(app.state.services.limits).values():
            limiter.limit = 10_000
        yield c


def vid(n: int) -> str:
    """A valid 11-character mock video ID."""
    return f"song{n:07d}"


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@dataclass
class Guest:
    token: str
    id: str
    name: str


class Api:
    """Thin test helper over the HTTP API."""

    def __init__(self, client: TestClient):
        self.c = client
        self._admin: str | None = None

    @property
    def admin(self) -> str:
        if self._admin is None:
            r = self.c.post("/api/admin/login", json={"password": ADMIN_PASSWORD})
            assert r.status_code == 200, r.text
            self._admin = r.json()["token"]
        return self._admin

    def register_tv(self) -> tuple[str, str]:
        r = self.c.post("/api/tv/register", json={"name": "Test TV"})
        assert r.status_code == 200, r.text
        return r.json()["device_secret"], r.json()["pairing_code"]

    def paired_tv(self) -> str:
        secret, code = self.register_tv()
        r = self.c.post("/api/admin/devices/pair", json={"code": code}, headers=auth(self.admin))
        assert r.status_code == 200, r.text
        return secret

    def tv_session(self, secret: str, new: bool = False) -> dict:
        r = self.c.post("/api/tv/session/new" if new else "/api/tv/session", headers=auth(secret))
        assert r.status_code == 200, r.text
        return r.json()

    def join(self, join_code: str, name: str) -> Guest:
        r = self.c.post("/api/sessions/join", json={"join_code": join_code, "display_name": name})
        assert r.status_code == 200, r.text
        body = r.json()
        return Guest(body["token"], body["participant"]["id"], name)

    def add(self, token: str, sid: str, video_id: str, key: str | None = None, expect=200):
        r = self.c.post(
            f"/api/sessions/{sid}/queue",
            json={"video_id": video_id, "idempotency_key": key or uuid.uuid4().hex},
            headers=auth(token),
        )
        assert r.status_code == expect, r.text
        return r.json()

    def command(self, token: str, sid: str, command: str, expected=None, expect=200):
        body = {"command": command}
        if expected is not None:
            body["expected_item_id"] = expected
        r = self.c.post(f"/api/sessions/{sid}/commands", json=body, headers=auth(token))
        assert r.status_code == expect, r.text
        return r.json()

    def tv_event(self, secret: str, sid: str, event: str, item_id: str, gen: int, **kw):
        r = self.c.post(
            f"/api/tv/sessions/{sid}/playback",
            json={"event": event, "item_id": item_id, "generation": gen, **kw},
            headers=auth(secret),
        )
        assert r.status_code == 200, r.text
        return r.json()

    def state(self, token: str, sid: str) -> dict:
        r = self.c.get(f"/api/sessions/{sid}/state", headers=auth(token))
        assert r.status_code == 200, r.text
        return r.json()


@dataclass
class PartyCtx:
    api: Api
    tv: str  # device secret
    sid: str
    code: str

    def state(self) -> dict:
        return self.api.state(self.tv, self.sid)


@pytest.fixture
def api(client) -> Api:
    return Api(client)


@pytest.fixture
def party(api) -> PartyCtx:
    tv = api.paired_tv()
    session = api.tv_session(tv)
    return PartyCtx(api, tv, session["session_id"], session["join_code"])
