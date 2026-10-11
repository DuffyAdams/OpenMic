# Deployment

## Option A — VPS with HTTPS (recommended)

Any small Linux VPS works (1 vCPU / 1 GB RAM is plenty). You need a domain or subdomain whose DNS
`A` record points at the server, and ports 80 and 443 open.

```bash
# On the server (Ubuntu example)
curl -fsSL https://get.docker.com | sh
git clone https://github.com/DuffyAdams/OpenMic.git
cd OpenMic/infrastructure
#   (or copy it from your computer:
#    rsync -a --exclude node_modules --exclude .venv --exclude build ./OpenMic/ server:openmic/)
./scripts/setup.sh          # asks for domain, admin password, optional YouTube API key
docker compose up -d --build
docker compose ps           # all services healthy?
```

Caddy obtains and renews a Let's Encrypt certificate automatically. Open
`https://your-domain/admin` to check the admin login.

### Services

| Service | Image | Notes |
|---|---|---|
| `caddy` | built from `infrastructure/web.Dockerfile` | Serves the web app, proxies `/api` (incl. WebSockets), HTTPS |
| `api` | built from `services/api/Dockerfile` | Runs migrations on start; one worker by design |
| `postgres` | `postgres:17-alpine` | Data in the `pgdata` volume |
| `backup` | `postgres:17-alpine` | `pg_dump` every 24 h into `infrastructure/backups/`, keeps 14 days |

All services restart automatically. The API exposes `GET /api/health` (used by the container
health check) and logs one JSON object per line (`docker compose logs -f api`).

### Configuration (`infrastructure/.env`)

| Variable | Required | Meaning |
|---|---|---|
| `DOMAIN` | yes | Hostname for HTTPS, or `:80` for plain HTTP |
| `PUBLIC_BASE_URL` | recommended | e.g. `https://karaoke.example.com`; used in the TV's join QR code |
| `ADMIN_PASSWORD` | yes | Host login at `/admin` (8+ characters) |
| `SECRET_KEY` | yes | 32+ random characters (setup.sh generates it). Changing it signs out admins |
| `POSTGRES_PASSWORD` | yes | Hex/URL-safe characters only (setup.sh generates it) |
| `YOUTUBE_API_KEY` | no | Enables search. Without it, guests paste links |
| `YOUTUBE_REGION_CODE` | no | e.g. `US`; hides region-blocked results |
| `YOUTUBE_DAILY_SEARCH_BUDGET` | no | Searches allowed per UTC day (default 90 ≈ 9,100 quota units) |
| `DEFAULT_PARTY_TITLE` | no | Title for new parties (hosts can rename) |
| `BACKUP_KEEP_DAYS` | no | Nightly backup retention (default 14) |
| `HTTP_PORT` / `HTTPS_PORT` | no | Host ports if 80/443 are taken |

API-only settings (env vars on the `api` service): `SESSION_IDLE_HOURS` (auto-end idle parties,
default 12), `PAIRING_CODE_MINUTES` (15), `HOST_INVITE_MINUTES` (15), `LOG_LEVEL`.

### Getting a YouTube API key

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. Enable **YouTube Data API v3**.
3. Create an **API key**; under *API restrictions* allow only YouTube Data API v3.
   (Don't add an HTTP-referrer restriction: the server calls the API, not the browser.)
4. Put it in `YOUTUBE_API_KEY` and `docker compose up -d`.

### Backups and restore

```bash
./scripts/backup.sh                                   # on-demand dump
./scripts/restore.sh backups/openmic-<date>.sql.gz  # asks for confirmation, then restores
```

Copy `infrastructure/backups/` off the server occasionally (e.g. `rsync` or your VPS snapshots).

### Updating

```bash
./scripts/update.sh     # git pull, backup, rebuild, restart (migrations run automatically)
```

The TV loads its interface from the server, so most updates reach the Fire TV without
reinstalling the APK.

## Option B — home network, no cloud

On any computer that stays on during the party (Mac, Linux, or a Raspberry Pi with uv and Node):

```bash
ADMIN_PASSWORD=choose-one ./scripts/lan.sh
```

This builds the web app and runs one process on port 8000 with a SQLite database
(`openmic-lan.db`). Use the printed `http://192.168.x.x:8000` address on the Fire TV and phones
(all on the same Wi-Fi). Phones on mobile data can't reach it.

To run the Docker stack on a home server instead, set `DOMAIN=:80` in `.env`.

## Option C — VPS without Docker

For an existing Nginx website and a nested public path, see
[native `/openmic` deployment](native-subpath-deployment.md), including systemd, PostgreSQL,
path-aware builds, private credentials and verified backups.

```bash
cd apps/web && npm ci && npm run build
cd ../../services/api && uv sync --no-dev
ENVIRONMENT=production DATABASE_URL=postgresql+asyncpg://… SECRET_KEY=… ADMIN_PASSWORD=… \
WEB_DIST_DIR=../../apps/web/build uv run uvicorn app.asgi:app --host 127.0.0.1 --port 8000 \
  --workers 1 --proxy-headers
```

Put any HTTPS reverse proxy in front (WebSocket support required for `/api/ws`) and run it under
systemd with `Restart=always`.

## Operations checklist

- [ ] `https://your-domain/api/health` returns `{"status":"ok"}`
- [ ] `/admin` login works; TV paired and shows the lobby
- [ ] A phone on mobile data can join (proves the public URL and TLS)
- [ ] `infrastructure/backups/` receives a file each day
- [ ] YouTube quota: Google Cloud console → APIs → YouTube Data API v3 → Quotas
