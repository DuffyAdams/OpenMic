#!/usr/bin/env bash
# Pull the latest code, rebuild, and restart. Migrations run automatically on API start.
set -euo pipefail
cd "$(dirname "$0")/.."
git -C .. pull --ff-only
./scripts/backup.sh
docker compose up -d --build
docker compose ps
