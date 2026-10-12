import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from app import __version__
from app.config import Settings, get_settings
from app.db import create_engine, create_sessionmaker
from app.deps import Services
from app.errors import AppError, app_error_handler
from app.logging_setup import configure_logging
from app.models import Base
from app.ratelimit import Limits
from app.realtime import Hub
from app.routers import admin, public, search, sessions, tv, ws
from app.security import Signer
from app.services.rooms import RoomService
from app.songbook import Songbook
from app.youtube import YouTubeService

log = logging.getLogger("openmic")
API_DIR = Path(__file__).resolve().parent.parent


def run_migrations(database_url: str) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


async def _reaper(services: Services) -> None:
    """End parties that have been idle for SESSION_IDLE_HOURS."""
    while True:
        await asyncio.sleep(600)
        try:
            ended = await services.rooms.end_idle_parties()
            if ended:
                log.info("ended idle parties", extra={"count": ended})
        except Exception:  # noqa: BLE001
            log.exception("idle reaper failed")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        problems = settings.validate_for_startup()
        if problems:
            raise RuntimeError("Invalid configuration: " + "; ".join(problems))
        if settings.auto_migrate and not settings.db_create_all:
            await asyncio.to_thread(run_migrations, settings.database_url)
        engine = create_engine(settings)
        if settings.db_create_all:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        sessionmaker = create_sessionmaker(engine)
        hub = Hub()
        songbook = Songbook.load(settings.songbook_path)
        youtube = YouTubeService(settings, songbook=songbook)
        services = Services(
            settings=settings,
            engine=engine,
            sessionmaker=sessionmaker,
            hub=hub,
            rooms=RoomService(sessionmaker, hub, settings, on_unplayable=youtube.mark_unplayable),
            youtube=youtube,
            songbook=songbook,
            signer=Signer(settings.secret_key),
            limits=Limits(),
        )
        app.state.services = services
        for video_id in await services.rooms.known_unplayable_videos():
            youtube.mark_unplayable(video_id)
        reaper = asyncio.create_task(_reaper(services))
        log.info(
            "OpenMic API ready",
            extra={
                "version": __version__,
                "search": services.youtube.provider,
                "songbook_songs": len(songbook),
            },
        )
        try:
            yield
        finally:
            reaper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await reaper
            await services.youtube.close()
            await engine.dispose()

    app = FastAPI(
        title="OpenMic API",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.add_exception_handler(AppError, app_error_handler)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        message = str(first.get("msg", "Invalid request")).removeprefix("Value error, ")
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "invalid_request", "message": message}},
        )

    for module in (public, sessions, search, tv, admin, ws):
        app.include_router(module.router)

    if settings.web_dist_dir:
        _mount_spa(app, Path(settings.web_dist_dir))
    return app


def _mount_spa(app: FastAPI, dist: Path) -> None:
    """Serve the built web app (single-process / LAN mode). Unknown paths get the SPA shell."""
    dist = dist.resolve()
    fallback = dist / "200.html" if (dist / "200.html").exists() else dist / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(
                status_code=404, content={"error": {"code": "not_found", "message": "Not found"}}
            )
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist in candidate.parents:
            headers = {}
            if "/_app/immutable/" in f"/{full_path}":
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return FileResponse(candidate, headers=headers)
        return FileResponse(fallback, headers={"Cache-Control": "no-cache"})
