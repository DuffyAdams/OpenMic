#!/usr/bin/env bash
# Restore a backup made by backup.sh or the nightly backup service.
#   ./scripts/restore.sh backups/openmic-20261011-030000.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:?Usage: restore.sh <backup.sql.gz>}"
[[ -f "$file" ]] || { echo "No such file: $file"; exit 1; }
read -rp "This replaces ALL current party data with $file. Type 'restore' to continue: " ok
[[ "$ok" == "restore" ]] || { echo "Cancelled."; exit 1; }
docker compose stop api
gunzip -c "$file" | docker compose exec -T postgres psql -U openmic -d openmic -v ON_ERROR_STOP=1 -q
docker compose start api
echo "Restored from $file"
