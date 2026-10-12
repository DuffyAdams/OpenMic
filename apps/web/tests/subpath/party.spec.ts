import QRCode from 'qrcode';
import { expect, test } from '@playwright/test';

const base = '/openmic';
test('nested deployment keeps navigation, API, QR and live rooms under its base', async ({ browser, page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/`);
  await expect(page.getByRole('link', { name: 'Host & TV setup' })).toHaveAttribute('href', `${base}/admin`);
  await page.getByRole('link', { name: 'Host & TV setup' }).click();
  await page.getByLabel('Admin password').fill('e2e-admin-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Sign out')).toBeVisible();

  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const sockets: string[] = [];
  tv.on('websocket', ws => sockets.push(ws.url()));
  await tv.goto(`${base}/tv?player=fake`);
  await expect(tv.getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  await expect(tv.locator('ol')).toContainText('127.0.0.1:8198/openmic/admin');
  const pairingCode = (await tv.locator('.code span').allTextContents()).join('');
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('/openmic:ok:admin') ?? 'null'));
  const pairing = await request.post(`${base}/api/admin/devices/pair`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { code: pairingCode, name: 'Subpath regression TV' }
  });
  expect(pairing.ok()).toBeTruthy();
  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible({ timeout: 15000 });
  const code = (await tv.locator('.code span').allTextContents()).join('');
  await expect(tv.locator('.url')).toHaveText('127.0.0.1:8198/openmic');
  const qr = await QRCode.toString(`http://127.0.0.1:8198/openmic/join/${code}`, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#000000', light: '#00000000' }
  });
  await expect(tv.locator('[aria-label="Scan to join the party"] path').last()).toHaveAttribute('d', qr.match(/stroke="#000000" d="([^"]+)"/)![1]);
  await page.goto(`${base}/join/${code}`);
  await page.getByLabel('Your name').fill('Subpath Guest');
  await page.getByRole('button', { name: /Join/ }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/room/${code}$`));
  await expect(tv.getByText('1 singer', { exact: true })).toBeVisible();
  expect(sockets).toContain('ws://127.0.0.1:8198/openmic/api/ws');
  expect(errors).toEqual([]);
  await tv.close();
});

test('simulator frames stay under the deployment base', async ({ page }) => {
  await page.goto(`${base}/sim`);
  await expect(page.locator('iframe')).toHaveCount(3);
  await expect(page.locator('iframe[name="sim:tv"]')).toHaveAttribute('src', `${base}/tv`);
  await expect(page.locator('iframe[name="sim:host"]')).toHaveAttribute('src', `${base}/`);
  await expect(page.locator('iframe[name="sim:guest1"]')).toHaveAttribute('src', `${base}/`);
  await expect(page.frameLocator('iframe[name="sim:tv"]').getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  await expect(page.frameLocator('iframe[name="sim:host"]').getByRole('link', { name: 'Host & TV setup' })).toHaveAttribute('href', `${base}/admin`);
});
