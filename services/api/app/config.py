from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_SECRET = "dev-insecure-secret-change-me"


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "OpenMic"
    environment: str = "development"  # development | production | test

    database_url: str = "sqlite+aiosqlite:///./openmic.db"
    auto_migrate: bool = True  # run Alembic migrations on startup
    db_create_all: bool = False  # tests only: create tables directly from models

    secret_key: str = INSECURE_DEFAULT_SECRET
    admin_password: str = ""
    admin_token_days: int = 30

    # Public URL guests use (e.g. https://karaoke.example.com).
    # Empty = clients use their own origin.
    public_base_url: str = ""

    # YouTube discovery. Without a key, pasted links still work (via oEmbed) but search is disabled.
    youtube_api_key: str = ""
    youtube_region_code: str = ""
    youtube_daily_search_budget: int = 90
    search_provider: str = "auto"  # auto | youtube | mock | none
    search_cache_ttl_seconds: int = 3600
    # Curated songs guests can browse without searching. Empty = the bundled app/songbook.json.
    songbook_path: str = ""

    default_party_title: str = "Karaoke Night"
    session_idle_hours: float = 12.0
    pairing_code_minutes: int = 15
    host_invite_minutes: int = 15

    # Optional: serve the built SvelteKit app from FastAPI (single-process / LAN mode).
    web_dist_dir: str = ""

    log_level: str = "INFO"
    log_json: bool = False

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def validate_for_startup(self) -> list[str]:
        """Return a list of fatal configuration problems."""
        problems: list[str] = []
        if self.is_production:
            if self.secret_key == INSECURE_DEFAULT_SECRET or len(self.secret_key) < 32:
                problems.append("SECRET_KEY must be set to a random value of 32+ characters")
            if len(self.admin_password) < 8:
                problems.append("ADMIN_PASSWORD must be set (8+ characters)")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
