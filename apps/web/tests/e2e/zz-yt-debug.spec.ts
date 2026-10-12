import { expect, test } from '@playwright/test';
test.setTimeout(240_000);
test('real youtube: does playing get reported?', async ({ browser, request }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  const t0 = Date.now();
  tv.on('console', (m) => { if (m.text().startsWith('[dbg]')) console.log(((Date.now() - t0) / 1000).toFixed(1), m.text()); });
  tv.on('request', (r) => { if (r.url().includes('/playback')) console.log(((Date.now() - t0) / 1000).toFixed(1), '[req]', r.postData()); });
  tv.on('websocket', (ws) => ws.on('framesent', (f) => { const t = String(f.payload); if (t.includes('progress')) console.log(((Date.now() - t0) / 1000).toFixed(1), '[ws]', t.slice(0, 160)); }));
  await tv.addInitScript(() => {
    const iv = setInterval(() => {
      const YT = (window as any).YT;
      if (!YT?.Player || YT.__wrapped) return;
      const Orig = YT.Player;
      YT.Player = function (el: any, opts: any) {
        const ev = opts.events || {};
        const sc = ev.onStateChange, er = ev.onError, rd = ev.onReady;
        opts.events = {
          ...ev,
          onReady: (e: any) => { console.log('[dbg] YT onReady'); rd?.(e); },
          onStateChange: (e: any) => { console.log('[dbg] YT state ' + e.data); sc?.(e); },
          onError: (e: any) => { console.log('[dbg] YT error ' + e.data); er?.(e); }
        };
        return new Orig(el, opts);
      };
      YT.__wrapped = true;
      clearInterval(iv);
    }, 5);
  });
  await tv.goto('/tv?player=youtube');
  await expect(tv.getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  const pairingCode = (await tv.locator('.code span').allTextContents()).join('');
  const admin = await (await browser.newContext()).newPage();
  await admin.goto(`/admin/pair?code=${pairingCode}`);
  await admin.getByLabel('Admin password').fill('e2e-admin-password');
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.getByLabel('TV name').fill('Living Room');
  await admin.getByRole('button', { name: 'Pair TV' }).click();
  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible({ timeout: 15_000 });
  const joinCode = (await tv.locator('.code span').allTextContents()).join('');
  const jess = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await jess.goto(`/join/${joinCode}`);
  await jess.getByLabel('Your name').fill('Jessica');
  await jess.getByRole('button', { name: /Join/ }).click();
  await jess.getByRole('searchbox').fill('https://youtu.be/NvZyU7ij_bs');
  await jess.getByRole('button', { name: 'Add to queue' }).click();
  await expect(jess.getByText('Added to the queue!')).toBeVisible();
  const secret = await tv.evaluate(() => JSON.parse(localStorage.getItem('ok:tv:secret') ?? 'null'));
  const sessionId = (await (await request.post('/api/tv/session', { headers: { Authorization: `Bearer ${secret}` } })).json()).session_id;
  const invite = await request.post(`/api/tv/sessions/${sessionId}/host-invite`, { headers: { Authorization: `Bearer ${secret}` } });
  const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await host.goto((await invite.json()).path);
  await host.getByLabel('Your name').fill('Duffy');
  await host.getByRole('button', { name: 'Become the host' }).click();
  for (let i = 0; i < 3; i++) await host.getByRole('button', { name: 'Decrease Up-next card' }).click();
  await host.getByRole('button', { name: 'Start the party' }).last().click();
  for (let i = 0; i < 6; i++) {
    await tv.waitForTimeout(5000);
    const screen = await tv.evaluate(() => document.querySelector('.tv-root')?.getAttribute('data-screen'));
    console.log(((Date.now() - t0) / 1000).toFixed(1), '[poll] screen=' + screen);
  }
  await tv.keyboard.press('Enter');
  await tv.waitForTimeout(800);
  console.log(await tv.locator('pre.log').textContent().catch(() => 'no log panel'));
  // Open the TV menu to read the controller's own log.
  await tv.keyboard.press('Escape').catch(() => {});
  await tv.screenshot({ path: '/private/tmp/claude-501/-Users-duffyadams-Documents-Developer-OpenKaraoke/0b442d13-ee23-4ca5-a467-9b6d072aed8e/scratchpad/yt-end.png' });
});
