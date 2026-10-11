#!/usr/bin/env bash
# Local development: API with auto-reload on :8000 and the Vite dev server on :5173.
# Open http://localhost:5173/tv in one window (the "TV") and /join/<code> on your phone.
#
# Real YouTube is the default. Put YOUTUBE_API_KEY in services/api/.env to enable search;
# without a key, guests paste YouTube links (real videos, real thumbnails).
#   SEARCH_PROVIDER=mock ./scripts/dev.sh   # offline demo: fake songs + demo player on the TV
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

export ADMIN_PASSWORD="${ADMIN_PASSWORD:-karaoke}"
export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./dev.db}"
export SEARCH_PROVIDER="${SEARCH_PROVIDER:-auto}"

key_set=""
[[ -n "${YOUTUBE_API_KEY:-}" ]] && key_set=1
grep -qE '^YOUTUBE_API_KEY=.+' "$root/services/api/.env" 2>/dev/null && key_set=1
if [[ "$SEARCH_PROVIDER" == "mock" ]]; then
  mode="DEMO — fake songs, demo player on the TV (nothing real plays)"
elif [[ -n "$key_set" ]]; then
  mode="YouTube search ON"
else
  mode="YouTube search OFF (no YOUTUBE_API_KEY in services/api/.env) — guests paste links"
fi

(cd "$root/services/api" && uv run uvicorn app.asgi:app --reload --host 0.0.0.0 --port 8000) &
api=$!
trap 'kill $api 2>/dev/null' EXIT
[[ -d "$root/apps/web/node_modules" ]] || (cd "$root/apps/web" && npm install)
echo
echo "  Songs:  $mode"
echo "  TV:     http://localhost:5173/tv      Admin: http://localhost:5173/admin (password: $ADMIN_PASSWORD)"
echo
cd "$root/apps/web" && npm run dev
