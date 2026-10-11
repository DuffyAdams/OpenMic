# Native deployment under `/openmic`

This deployment uses the existing Nginx TLS virtual host, one FastAPI worker and an isolated
PostgreSQL database. It does not start Caddy or replace the portfolio or Updraft routes.

## Public entry points

- Guest entry: `https://duffyadams.com/openmic/` (enter the room code shown on the TV)
- TV: `https://duffyadams.com/openmic/tv`
- Owner: `https://duffyadams.com/openmic/admin`
- Pairing: `https://duffyadams.com/openmic/admin/pair?code=<TV-CODE>`
- Guest QR: `https://duffyadams.com/openmic/join/<ROOM-CODE>`
- Host invitation: `/openmic/host/claim#<short-lived-invite>`

Exact `/openmic` redirects to `/openmic/` with a 308 and preserves the query string.
The `^~` proxy prevents the portfolio's generic static-file regex from intercepting application
assets. Nginx strips `/openmic/` before forwarding to loopback port **8012**. Uvicorn's
`--root-path /openmic` preserves the external API documentation base.

## Build and path handling

```sh
cd apps/web
npm ci
BASE_PATH=/openmic npm run check
BASE_PATH=/openmic npm run build
node --test tests/base-path.test.mjs
npx playwright test --config playwright.subpath.config.ts
```

`BASE_PATH` is a build-time setting; no credentials are required by the frontend build.
Omit it for the original root-path development/LAN experience. All navigation, API and WSS
endpoints use SvelteKit's base. Pairing, guest and host QR links use the configured public base.
The manifest uses relative start/scope/icon URLs. Browser credentials use base-namespaced
localStorage, with the original keys retained for root deployments. Authentication is bearer-token
based, not cookie based; no cross-origin CORS allowance or cookie-path rewrite is required.

For the Fire TV shell, set the server URL to **`https://duffyadams.com/openmic`**, not `/tv`.
URL normalization now retains the base path before appending `/tv`. Existing APKs compiled
before this change must be rebuilt/reinstalled to obtain that fix. The standalone normalization
regression runs with `bash apps/fire-tv/tests/test-server-url.sh` and a JVM/Kotlin compiler;
its Android boundary stubs do not constitute an Android build or a hardware playback test.

## Runtime and secrets

- Service: `openmic-api.service`, enabled on boot, single worker, dedicated non-login `openmic` OS user.
- Runtime: Python 3.12 virtualenv in `services/api/.venv`; source and frontend build are read-only
  to the systemd service. Its writable state directory is `/var/lib/openmic`.
- Backend environment: `/etc/openmic/backend.env`, root-owned, mode **0600**, outside Git.
- The uploaded `/srv/file-transfer/OpenMic.env` is preserved; its YouTube key is loaded only
  by the backend, never by the frontend build.
- Generated strong owner password and signing secret replace development defaults.
- Owner access file: `/srv/file-transfer/OpenMic-admin-access.txt`, mode **0600**, owned by
  `fileportal:fileportal`. Obtain it through the authenticated private file portal; never publish it.
- `PUBLIC_BASE_URL=https://duffyadams.com/openmic`, `ENVIRONMENT=production`,
  `SEARCH_PROVIDER=youtube`, daily search budget **90**. HTTP client URL logging is suppressed.
- Trusted forwarded headers are accepted only from loopback Nginx. Nginx overwrites the client
  address and preserves HTTPS; no public backend listener or database listener is exposed.

## PostgreSQL, migrations and backups

The host had PostgreSQL client tools but no running server/cluster. PostgreSQL 18 was installed
without upgrading other packages or restarting other application services. Its new `18/main`
cluster listens on loopback **5432**. Database **`openmic`** belongs to login role **`openmic`**,
which has no superuser, role-creation, database-creation or replication privileges; public database
access is revoked. Persistent cluster data: `/var/lib/postgresql/18/main`.

The API applies Alembic migrations on startup; the deployed revision is **0002**. Never set
`TEST_DATABASE_URL` to production: the test suite drops its test schema. Verification used a
separate ephemeral `openmic_test` role/database and removed them afterward.

`openmic-backup.timer` runs daily at **03:40 America/Los_Angeles**, with up to five minutes of
jitter and missed-run catchup. `openmic-backup.service` runs the OpenMic-only `pg_dump` helper
as OS user `postgres`, using Unix-socket peer authentication. Verified custom-format dumps
are written to private `/var/backups/openmic`; complete dumps older than 14 days are pruned
only after a new dump contains all expected application tables. Failed `.partial` files are
not treated as valid backups. The helper is installed at `/usr/local/lib/openmic/backup.py`.

```sh
sudo systemctl start openmic-backup.service
sudo journalctl -u openmic-backup.service -n 10 --no-pager
sudo -u postgres pg_restore --list /var/backups/openmic/<verified-file>.dump
```

These are logical on-host backups, not off-host disaster recovery. A verification dump was
successfully restored into a separate disposable database, all six application/Alembic tables
were present, and that restore-check database was removed afterward. This does not replace a
production recovery rehearsal. Copy verified dumps to private off-host storage. To restore, stop
only OpenMic, preserve its
current database first, and restore the selected dump into a newly created isolated database
before switching the protected backend URL. Never restore over another application's database.

The pre-change TLS vhost is saved outside Git at
`/var/backups/openmic-config/duffyadams.com.before-openmic`. The only vhost modification is
including `/etc/nginx/snippets/openmic.conf` alongside the existing Updraft include.

## Updating

Back up OpenMic before schema changes. Run locked `uv sync --frozen` in `services/api`, build
with the same `BASE_PATH`, then restart only `openmic-api.service`. Validate `nginx -t` before
reloading Nginx if routing changes. Verify `/openmic/api/health`, exact new asset bytes, real
WSS authentication and room updates, and both existing portfolio/Updraft surfaces. Commit and
push intended source/configuration only; never include environments, backups, databases or
build artifacts.

## Verified boundaries and playback caveat

Verification exercised real public HTTPS admin authentication, TV pairing, guest browser join,
YouTube discovery using the supplied key, queue addition and live WSS updates, host-invite
claim and authoritative start/pause/resume/skip controls. It used isolated verification rooms,
ended them via the legitimate admin API and revoked their TVs afterward. Root and subpath
browser suites use the project's explicit offline player; production uses the real YouTube player.

One upstream YouTube search plus its metadata-details request used approximately **101 quota
units**. Repeated verification read the same in-memory cached results, with the remaining daily
search budget unchanged at **89**. Real YouTube IFrame initialization succeeded, but two sampled
karaoke results returned an embed-disabled error and were automatically skipped. Therefore
successful audible/video playback on the user's browser/Fire TV is **not yet verified**. Search
metadata's embeddable flag does not guarantee every video plays on every device/location. Try
another version; validate actual playback and remote/autoplay behavior on the intended TV.
No mock search provider or fake playback result was substituted for this production check.

The search budget/cache are currently process-local and reset on API restart. Dependency
installation reported three low-severity frontend audit findings; no forced upgrades were made.
