#!/usr/bin/env bash
# Creates infrastructure/.env with generated secrets. Safe to re-run: never overwrites secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  echo ".env already exists — edit it directly, or delete it to start over."
  exit 0
fi

read -rp "Domain for HTTPS (e.g. karaoke.example.com), or blank for home-network HTTP: " domain
read -rsp "Host/admin password (8+ characters): " admin; echo
if [[ ${#admin} -lt 8 ]]; then echo "Password too short."; exit 1; fi
read -rp "YouTube Data API key (optional, Enter to skip): " ytkey

if [[ -n "$domain" ]]; then
  site="$domain"; base="https://$domain"
else
  site=":80"; base=""
fi
rand() { openssl rand -hex 32; }

umask 077
cat > .env <<ENV
DOMAIN=$site
PUBLIC_BASE_URL=$base
ADMIN_PASSWORD=$admin
SECRET_KEY=$(rand)
POSTGRES_PASSWORD=$(rand)
YOUTUBE_API_KEY=$ytkey
YOUTUBE_REGION_CODE=US
YOUTUBE_DAILY_SEARCH_BUDGET=90
DEFAULT_PARTY_TITLE=Karaoke Night
BACKUP_KEEP_DAYS=14
ENV
echo "Wrote infrastructure/.env. Next: docker compose up -d --build"
