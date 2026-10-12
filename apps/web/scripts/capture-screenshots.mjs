// Capture real UI screens against an isolated backend with the offline demo catalog.
// Run from apps/web: npm run screenshots (requires a production build and Chromium).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'docs/images');
const scratch = await mkdtemp(resolve(tmpdir(), 'openmic-screenshots-'));
const baseURL = 'http://127.0.0.1:8810';
const password = 'screenshot-demo-password';
const server = spawn('uv', ['run', 'uvicorn', 'app.asgi:app', '--port', '8810', '--log-level', 'error'], {
  cwd: resolve(root, 'services/api'),
  env: {
    ...process.env,
    ENVIRONMENT: 'test',
    DATABASE_URL: `sqlite+aiosqlite:///${scratch}/demo.db`,
    ADMIN_PASSWORD: password,
    SECRET_KEY: 'screenshot-demo-only-not-a-production-secret',
    SEARCH_PROVIDER: 'mock',
    YOUTUBE_API_KEY: '',
    PUBLIC_BASE_URL: '',
    DEFAULT_PARTY_TITLE: 'Friday Night',
    WEB_DIST_DIR: resolve(root, 'apps/web/build'),
    LOG_LEVEL: 'ERROR'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', (data) => { serverLog = (serverLog + data).slice(-4000); });
server.stderr.on('data', (data) => { serverLog = (serverLog + data).slice(-4000); });
const stopped = once(server, 'close');
let browser;

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' });
}

try {
  await expect.poll(async () => {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { return (await fetch(`${baseURL}/api/health`)).ok; } catch { return false; }
  }, { timeout: 30_000 }).toBe(true);
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  const tv = await browser.newPage({ baseURL, viewport: { width: 1920, height: 1080 } });
  await tv.goto('/tv?player=fake&fakeDuration=180');
  await expect(tv.getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  const pairingCode = (await tv.locator('.code span').allTextContents()).join('');
  const login = await tv.request.post('/api/admin/login', { data: { password } });
  const auth = { Authorization: `Bearer ${(await login.json()).token}` };
  const paired = await tv.request.post('/api/admin/devices/pair', {
    data: { code: pairingCode, name: 'Living Room' }, headers: auth
  });
  expect(paired.ok()).toBe(true);
  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible({ timeout: 15_000 });
  const code = (await tv.locator('.code span').allTextContents()).join('');
  const lookup = await tv.request.get(`/api/sessions/lookup/${code}`);
  const session = (await lookup.json()).session_id;
  const settings = await tv.request.patch(`/api/sessions/${session}/settings`, {
    headers: auth, data: { intro_seconds: 20, show_notifications: false }
  });
  expect(settings.ok()).toBe(true);

  async function phone() {
    return browser.newPage({ baseURL, viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true });
  }
  async function join(name, avatar) {
    const page = await phone();
    await page.goto(`/join/${code}`);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('radio', { name: avatar }).check();
    await page.getByRole('button', { name: /Join/ }).click();
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
    return page;
  }
  async function search(page, query) {
    await page.getByRole('button', { name: 'Search', exact: true }).first().click();
    await page.getByRole('searchbox').fill(query);
    await page.getByRole('searchbox').press('Enter');
    // Songs in the songbook show up without a YouTube search.
    await expect(page.getByText(`Results for “${query}”`).or(page.getByText('In the songbook'))).toBeVisible();
  }
  async function add(page, query) {
    await search(page, query);
    await page.locator('.result').first().click();
    await page.getByRole('button', { name: 'Add to queue' }).click();
    await expect(page.getByRole('button', { name: 'Add to queue' })).toBeHidden();
  }

  const maya = await join('Maya', 'Kitty Purry');
  const jordan = await join('Jordan', 'Ribbit Astley');
  const sam = await join('Sam', 'Llama Del Rey');
  await search(maya, 'Shallow');
  await maya.locator('.result').first().click();
  await maya.getByRole('radio', { name: 'Jordan', exact: true }).click();
  await shot(maya, 'phone-duet');
  await maya.getByRole('button', { name: 'Add to queue' }).click();
  await expect(maya.getByRole('button', { name: 'Add to queue' })).toBeHidden();
  await add(jordan, 'Dancing Queen');
  await add(sam, 'Mr. Brightside');
  await add(maya, 'I Wanna Dance with Somebody');

  const host = await phone();
  await host.goto('/admin');
  await host.getByLabel('Admin password').fill(password);
  await host.getByRole('button', { name: 'Sign in' }).click();
  await host.locator('.party', { hasText: code }).getByRole('button', { name: 'Host controls' }).click();
  await expect(host.getByRole('heading', { name: 'Start the party' })).toBeVisible();
  await shot(host, 'phone-host');
  await expect(tv.locator('.queue li')).toHaveCount(4);
  await shot(tv, 'tv-lobby');

  await search(maya, 'Dancing Queen');
  await maya.getByRole('searchbox').blur();
  await shot(maya, 'phone-search');
  await host.getByRole('button', { name: 'Start the party' }).last().click();
  await expect(tv.locator('.singer')).toHaveText('Maya & Jordan');
  await shot(tv, 'tv-duet');
  console.log(`Saved 5 OpenMic screenshots to ${output}`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await stopped;
  await rm(scratch, { recursive: true, force: true });
}
