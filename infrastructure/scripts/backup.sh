#!/usr/bin/env bash
# On-demand database backup (the `backup` service also writes one every night).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/openmic-$(date +%Y%m%d-%H%M%S)-manual.sql.gz"
docker compose exec -T postgres pg_dump -U openmic --no-owner --clean --if-exists openmic | gzip > "$file"
echo "Backup written to infrastructure/$file"
