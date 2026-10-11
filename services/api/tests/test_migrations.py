"""The Alembic migrations must produce exactly the schema described by the models."""

import asyncio

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy.ext.asyncio import create_async_engine

from app.main import run_migrations
from app.models import Base
from tests.conftest import TEST_DATABASE_URL


async def test_migrations_match_models(tmp_path):
    url = TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path}/migrated.db"
    await asyncio.to_thread(run_migrations, url)  # Alembic runs its own event loop
    engine = create_async_engine(url)

    def diff(conn):
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return compare_metadata(ctx, Base.metadata)

    async with engine.connect() as conn:
        changes = await conn.run_sync(diff)
    await engine.dispose()
    assert changes == []
