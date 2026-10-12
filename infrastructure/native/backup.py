#!/usr/bin/python3
"""OpenMic-only nightly PostgreSQL custom dump. Run as OS user postgres (peer auth)."""
import os
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

os.umask(0o077)
root = Path('/var/backups/openmic')
root.mkdir(mode=0o700, exist_ok=True)
stamp = datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')
partial = root / f'openmic-{stamp}.dump.partial'
complete = partial.with_suffix('')
subprocess.run(['/usr/bin/pg_dump', '--format=custom', '--dbname=openmic', f'--file={partial}'], check=True)
listing = subprocess.check_output(['/usr/bin/pg_restore', '--list', str(partial)], text=True)
for table in ('devices', 'sessions', 'participants', 'queue_items', 'playback_events'):
    if f'TABLE public {table} ' not in listing:
        raise RuntimeError(f'Backup missing expected table: {table}')
partial.rename(complete)
cutoff = datetime.now(UTC) - timedelta(days=14)
for old in root.glob('openmic-*.dump'):
    if old != complete and datetime.fromtimestamp(old.stat().st_mtime, UTC) < cutoff:
        old.unlink()
print(f'Verified OpenMic custom dump: {complete}')
