#!/usr/bin/env bash
# Home-network mode: no Docker, no cloud. One process serves the web app and API on port 8000,
# with data in SQLite. Point the Fire TV app at http://<this-computer's-IP>:8000.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD, e.g. ADMIN_PASSWORD=choose-one ./scripts/lan.sh}"
port="${PORT:-8000}"

(cd "$root/apps/web" && { [[ -d node_modules ]] || npm ci; } && npm run build)

ip=$( (ipconfig getifaddr en0 || hostname -I 2>/dev/null | awk '{print $1}') 2>/dev/null || true)
echo
echo "  OpenMic is starting on http://${ip:-<this-computer>}:$port"
echo "  Fire TV server address: http://${ip:-<this-computer>}:$port"
echo

cd "$root/services/api"
export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///$root/openmic-lan.db}"
export WEB_DIST_DIR="$root/apps/web/build"
export SECRET_KEY="${SECRET_KEY:-$(cat "$root/.lan-secret" 2>/dev/null || (openssl rand -hex 32 | tee "$root/.lan-secret"))}"
exec uv run uvicorn app.asgi:app --host 0.0.0.0 --port "$port" --workers 1
