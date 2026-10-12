import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('installed app and icons resolve within the manifest directory', () => {
  const manifest = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8'));
  const url = 'https://example.com/openmic/manifest.webmanifest';
  assert.equal(new URL(manifest.start_url, url).pathname, '/openmic/');
  for (const icon of manifest.icons) assert.ok(new URL(icon.src, url).pathname.startsWith('/openmic/'));
});

for (const base of ['', '/openmic']) {
  test(`build supports base ${JSON.stringify(base)}`, () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      "import config from './svelte.config.js'; console.log(JSON.stringify(config.kit.paths?.base ?? ''));"
    ], { cwd: process.cwd(), env: { ...process.env, BASE_PATH: base }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout), base);
  });
}
