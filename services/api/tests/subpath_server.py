"""Real ASGI mount for testing a prefix-stripping production proxy."""

from contextlib import asynccontextmanager

from starlette.applications import Starlette
from starlette.routing import Mount

from app.main import create_app

api = create_app()


@asynccontextmanager
async def lifespan(_app):
    async with api.router.lifespan_context(api):
        yield


app = Starlette(routes=[Mount('/openmic', app=api)], lifespan=lifespan)
