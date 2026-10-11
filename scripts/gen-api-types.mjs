#!/usr/bin/env node
// Regenerates packages/contracts/openapi.json from the FastAPI app and the TypeScript types the
// web app imports (apps/web/src/lib/api/schema.d.ts). Run after changing app/schemas.py.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, 'services/api');
const specPath = resolve(root, 'packages/contracts/openapi.json');
const typesPath = resolve(root, 'apps/web/src/lib/api/schema.d.ts');

const dump = `
import json
from app.config import Settings
from app.main import create_app
app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", log_level="ERROR"))
print(json.dumps(app.openapi(), indent=2, sort_keys=True))
`;
const spec = execFileSync('uv', ['run', '--quiet', 'python', '-c', dump], { cwd: apiDir });
mkdirSync(dirname(specPath), { recursive: true });
writeFileSync(specPath, spec);

execFileSync(
  'npx',
  ['openapi-typescript', specPath, '-o', typesPath, '--alphabetize'],
  { cwd: resolve(root, 'apps/web'), stdio: 'inherit' }
);
console.log('Wrote', specPath, 'and', typesPath);
