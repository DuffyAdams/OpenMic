import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const ADMIN_PASSWORD = 'e2e-admin-password';
const PHONE = { width: 390, height: 844 };
const SHOTS = 'screenshots';

// Every test closes the browsers it opened, so idle TV pages don't keep running in the background.
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.close();
});

async function context(browser: Browser, options: Parameters<Browser['newContext']>[0]) {
  const ctx = await browser.newContext(options);
  contexts.push(ctx);
  return ctx;
}

async function phone(browser: Browser): Promise<Page> {
  const ctx = await context(browser, { viewport: PHONE, deviceScaleFactor: 2, hasTouch: true });
  return ctx.newPage();
}

/** Let entrance animations finish so screenshots show the settled UI. */
async function settle(page: Page) {
  await page.waitForTimeout(900);
}

async function code(page: Page): Promise<string> {
  return (await page.locator('.code span').allTextContents()).join('');
}

async function joinAs(browser: Browser, joinCode: string, name: string): Promise<Page> {
  const p = await phone(browser);
  await p.goto(`/join/${joinCode}`);
  await p.getByLabel('Your name').fill(name);
  await p.getByRole('button', { name: /Join/ }).click();
  await expect(p.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  return p;
}

test('a full karaoke party, from pairing to the last song', async ({ browser, request }) => {
  // ---------------------------------------------------------------- TV pairing
  const tvCtx = await context(browser, { viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await tv.goto('/tv?player=fake&fakeDuration=14');
  await expect(tv.getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  const pairingCode = await code(tv);
  expect(pairingCode).toMatch(/^[A-Z0-9]{6}$/);
  await settle(tv);
  await tv.screenshot({ path: `${SHOTS}/tv-1-pairing.png` });

  const admin = await phone(browser);
  await admin.goto(`/admin/pair?code=${pairingCode}`);
  await admin.getByLabel('Admin password').fill(ADMIN_PASSWORD);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.getByLabel('TV name').fill('Living Room');
  await admin.getByRole('button', { name: 'Pair TV' }).click();
  await expect(admin.getByText('Living Room is ready')).toBeVisible();

  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible({ timeout: 15_000 });
  const joinCode = await code(tv);
  expect(joinCode).toMatch(/^[A-Z0-9]{6}$/);

  // ---------------------------------------------------------------- Guests join
  const jess = await joinAs(browser, joinCode, 'Jessica');
  await settle(jess);
  await jess.screenshot({ path: `${SHOTS}/phone-1-search-empty.png` });
  const mike = await joinAs(browser, joinCode, 'Mike');
  await expect(tv.getByText('2 singers')).toBeVisible();

  // Jessica searches and adds the first result. The songbook answers first; YouTube on request.
  await jess.getByRole('searchbox').fill('dancing queen');
  await jess.getByRole('searchbox').press('Enter');
  await expect(jess.getByText('In the songbook')).toBeVisible();
  await jess.getByRole('button', { name: 'Search YouTube for “dancing queen”' }).click();
  await expect(jess.getByText('Results for “dancing queen”')).toBeVisible();
  await settle(jess);
  await jess.screenshot({ path: `${SHOTS}/phone-2-results.png` });
  await jess.locator('.result').first().click();
  await expect(jess.getByRole('button', { name: 'Add to queue' })).toBeVisible();
  await settle(jess);
  await jess.screenshot({ path: `${SHOTS}/phone-3-add-sheet.png` });
  await jess.getByRole('button', { name: 'Add to queue' }).click();
  await expect(jess.getByText('Added to the queue!')).toBeVisible();

  // Mike pastes a YouTube link; it resolves straight to the confirm sheet. He makes it a duet.
  await mike.getByRole('searchbox').fill('https://youtu.be/song0000002?si=abc');
  await expect(mike.getByRole('button', { name: 'Add to queue' })).toBeVisible();
  await mike.getByRole('radio', { name: 'Jessica' }).click();
  await expect(mike.getByRole('radio', { name: 'Jessica' })).toHaveAttribute('aria-checked', 'true');
  await settle(mike);
  await mike.screenshot({ path: `${SHOTS}/phone-3b-duet-picker.png` });
  await mike.getByRole('button', { name: 'Add to queue' }).click();
  await expect(mike.getByText('Duet with Jessica added!')).toBeVisible();
  await expect(mike.getByText(/#2 in line/)).toBeVisible();
  // The duet shows up in Jessica's songs too.
  await jess.getByRole('button', { name: 'My songs' }).first().click();
  await expect(jess.locator('.list .row')).toHaveCount(2);
  await expect(jess.locator('.list .row').last()).toContainText('You & Mike');
  await jess.getByRole('button', { name: 'Search' }).first().click();

  // The TV lobby shows the queue and a banner.
  await expect(tv.locator('.queue li')).toHaveCount(2);
  await expect(tv.locator('.q-singer').first()).toContainText('Jessica');
  await expect(tv.locator('.q-singer').last()).toContainText('Mike & Jessica');
  await settle(tv);
  await tv.screenshot({ path: `${SHOTS}/tv-2-lobby.png` });

  // ---------------------------------------------------------------- Host via TV menu QR
  const secret = await tv.evaluate(() => JSON.parse(localStorage.getItem('ok:tv:secret') ?? 'null'));
  const sessionState = await request.post('/api/tv/session', { headers: { Authorization: `Bearer ${secret}` } });
  const sessionId = (await sessionState.json()).session_id;
  const invite = await request.post(`/api/tv/sessions/${sessionId}/host-invite`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const host = await phone(browser);
  await host.goto((await invite.json()).path);
  await host.getByLabel('Your name').fill('Duffy');
  await host.getByRole('button', { name: 'Become the host' }).click();
  await expect(host.getByRole('heading', { name: 'Start the party' })).toBeVisible();
  // Shorten the up-next card for the test: 15s → 5s.
  for (let i = 0; i < 2; i++) await host.getByRole('button', { name: 'Decrease Up-next card' }).click();
  await expect(host.locator('output').first()).toHaveText('5s');
  await settle(host);
  await host.screenshot({ path: `${SHOTS}/phone-4-host.png`, fullPage: true });

  // ---------------------------------------------------------------- Playback
  await host.getByRole('button', { name: 'Start the party' }).last().click();
  await expect(tv.getByText('Up next', { exact: true })).toBeVisible();
  await expect(tv.locator('.singer')).toHaveText('Jessica');
  await settle(tv);
  await tv.screenshot({ path: `${SHOTS}/tv-3-intro.png` });

  const fake = tv.getByTestId('fake-player');
  await expect(fake).toHaveAttribute('data-state', 'playing', { timeout: 8_000 });
  await expect(jess.getByText("You're on! Grab the mic")).toBeVisible();
  await settle(tv);
  await tv.screenshot({ path: `${SHOTS}/tv-4-playing.png` });

  // Host pauses from the phone; the TV pauses and shows the band under the video.
  await host.getByRole('button', { name: 'Pause' }).click();
  await expect(fake).toHaveAttribute('data-state', 'paused');
  await expect(tv.locator('.band')).toContainText('Paused');
  await settle(tv);
  await tv.screenshot({ path: `${SHOTS}/tv-5-paused.png` });
  await host.getByRole('button', { name: 'Resume' }).click();
  await expect(fake).toHaveAttribute('data-state', 'playing');

  // Jessica's song ends → Mike & Jessica's duet intro → the duet.
  await expect(tv.locator('.singer')).toHaveText('Mike & Jessica', { timeout: 20_000 });
  await expect(tv.getByText('Grab both mics!')).toBeVisible();
  await tv.waitForTimeout(700);
  await tv.screenshot({ path: `${SHOTS}/tv-3b-duet-intro.png` });
  await expect(fake).toHaveAttribute('data-state', 'playing', { timeout: 8_000 });
  await expect(jess.getByText("You're on with Mike!")).toBeVisible();
  await mike.getByRole('button', { name: 'Queue' }).first().click();
  await expect(mike.locator('.np')).toContainText("You're on stage");
  await settle(mike);
  await mike.screenshot({ path: `${SHOTS}/phone-5-queue-onstage.png` });

  // An unplayable video fails on the TV, is auto-skipped, and its owner is told.
  await jess.getByRole('button', { name: 'Search' }).first().click();
  await jess.getByRole('searchbox').fill('https://www.youtube.com/watch?v=errVideo001');
  await jess.getByRole('button', { name: 'Add to queue' }).click();
  await expect(jess.getByText("Your song couldn't play")).toBeVisible({ timeout: 25_000 });

  // Queue drains back to the open-stage lobby.
  await expect(tv.getByText('The stage is open')).toBeVisible({ timeout: 20_000 });
  await jess.getByRole('button', { name: 'Queue' }).first().click();
  await jess.getByRole('button', { name: /Recently sung/ }).click();
  await expect(jess.locator('.s-failed')).toHaveCount(1);
  await expect(jess.locator('.s-completed')).toHaveCount(2);

  // ---------------------------------------------------------------- Remote control
  await tv.keyboard.press('m');
  await expect(tv.locator('.side')).toBeVisible();
  await settle(tv);
  await tv.screenshot({ path: `${SHOTS}/tv-6-menu.png` });
  // Navigate to "Song requests" and toggle it with the D-pad.
  const requests = tv.locator('.mi', { hasText: 'Song requests' });
  for (let i = 0; i < 12 && !(await requests.evaluate((el) => el === document.activeElement)); i++) {
    await tv.keyboard.press('ArrowDown');
  }
  await tv.keyboard.press('Enter');
  await expect(requests).toContainText('Paused');
  await expect(jess.getByText('The host has paused new requests.')).toBeVisible();
  await tv.keyboard.press('Enter');
  await expect(requests).toContainText('Open');
  await tv.keyboard.press('Escape');
  await expect(tv.locator('.side')).toHaveCount(0);

  // ---------------------------------------------------------------- End
  await host.getByRole('button', { name: 'Host' }).last().click();
  await host.getByRole('button', { name: 'End the party' }).click();
  await host.getByRole('button', { name: 'End party' }).click();
  await expect(tv.getByText('Thanks for singing!')).toBeVisible();
  await expect(tv.locator('.stats strong').first()).toHaveText('2');
  await settle(tv);
  await tv.screenshot({ path: `${SHOTS}/tv-7-ended.png` });
  await expect(jess.getByText('Thanks for singing!')).toBeVisible();
  await settle(jess);
  await jess.screenshot({ path: `${SHOTS}/phone-6-ended.png` });

  // The TV starts a new party with a fresh code.
  await tv.getByRole('button', { name: 'Start a new party' }).click();
  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible();
  expect(await code(tv)).not.toBe(joinCode);
});

test('guests add songs from the songbook without searching', async ({ browser }) => {
  const tvCtx = await context(browser, { viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  await tv.goto('/tv?player=fake');
  await expect(tv.getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  const pairingCode = await code(tv);
  const login = await tv.request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } });
  await tv.request.post('/api/admin/devices/pair', {
    data: { code: pairingCode },
    headers: { Authorization: `Bearer ${(await login.json()).token}` }
  });
  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible({ timeout: 15_000 });
  const guest = await joinAs(browser, await code(tv), 'Ana');

  // Browse a category and add a song.
  await expect(guest.getByText('Songbook', { exact: true })).toBeVisible();
  const duets = guest.getByRole('button', { name: 'Duets', exact: true });
  await duets.click();
  await expect(duets).toHaveAttribute('aria-pressed', 'true');
  await expect(guest.locator('.book .result').first()).toContainText('Duet');
  await guest.locator('.book .result').first().click();
  await guest.getByRole('button', { name: 'Add to queue' }).click();
  await expect(guest.getByText('Added to the queue!')).toBeVisible();
  await expect(tv.locator('.queue li')).toHaveCount(1);

  // Typing matches the songbook instantly, and Enter doesn't spend a YouTube search.
  await guest.getByRole('searchbox').fill('brightside');
  await expect(guest.getByText('In the songbook')).toBeVisible();
  await guest.getByRole('searchbox').press('Enter');
  await expect(guest.getByText(/Results for/)).toHaveCount(0);
  await expect(guest.locator('.result').first()).toContainText('Mr. Brightside');
  await guest.locator('.result').first().click();
  await guest.getByRole('button', { name: 'Add to queue' }).click();
  await expect(tv.locator('.queue li')).toHaveCount(2);
  await expect(tv.locator('.queue li').last()).toContainText('Mr. Brightside – The Killers');
});

test('TV resumes the current song after a reload', async ({ browser }) => {
  const tvCtx = await context(browser, { viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  await tv.goto('/tv?fakeDuration=30'); // no ?player=fake: mock-search servers pick the demo player
  await expect(tv.getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  const pairingCode = await code(tv);
  const login = await tv.request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } });
  const adminToken = (await login.json()).token;
  await tv.request.post('/api/admin/devices/pair', {
    data: { code: pairingCode },
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible({ timeout: 15_000 });
  await expect(tv.getByText('Demo mode')).toBeVisible();
  const joinCode = await code(tv);

  const guest = await joinAs(browser, joinCode, 'Ana');
  await guest.getByRole('searchbox').fill('https://youtu.be/song0000009');
  await guest.getByRole('button', { name: 'Add to queue' }).click();
  await tv.keyboard.press('Enter'); // "Start the party" has focus
  await expect(tv.locator('.singer')).toHaveText('Ana');
  await tv.keyboard.press('Enter'); // skip the up-next countdown
  const fake = tv.getByTestId('fake-player');
  await expect(fake).toHaveAttribute('data-state', 'playing', { timeout: 15_000 });
  await tv.waitForTimeout(6000); // let a progress report land

  await tv.reload();
  await expect(fake).toHaveAttribute('data-state', 'playing', { timeout: 15_000 });
  const label = await tv.locator('.fp-state').textContent();
  const seconds = Number(label?.match(/· (\d+)s/)?.[1] ?? 0);
  expect(seconds).toBeGreaterThanOrEqual(2); // resumed mid-song, not from zero
});

test('confirm sheets and the TV skip dialog act on the right song', async ({ browser }) => {
  const tvCtx = await context(browser, { viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await tv.goto('/tv?player=fake&fakeDuration=60');
  await expect(tv.getByRole('heading', { name: 'Pair this TV' })).toBeVisible();
  const pairingCode = await code(tv);
  const adminToken = (await (await tv.request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } })).json()).token;
  const auth = { Authorization: `Bearer ${adminToken}` };
  await tv.request.post('/api/admin/devices/pair', { data: { code: pairingCode }, headers: auth });
  await expect(tv.getByRole('button', { name: 'Start the party' })).toBeVisible({ timeout: 15_000 });
  const joinCode = await code(tv);

  const ana = await joinAs(browser, joinCode, 'Ana');
  const ben = await joinAs(browser, joinCode, 'Ben');
  for (const id of ['song0000101', 'song0000102', 'song0000103']) {
    await ana.getByRole('searchbox').fill(`https://youtu.be/${id}`);
    await ana.getByRole('button', { name: 'Add to queue' }).click();
    await expect(ana.getByText('Added to the queue!').last()).toBeVisible();
  }
  await ben.getByRole('searchbox').fill('https://youtu.be/song0000201');
  await ben.getByRole('button', { name: 'Add to queue' }).click();
  await expect(ben.getByText(/#4 in line/)).toBeVisible();

  // Guest cancels their own second song through the confirm sheet.
  await ana.getByRole('button', { name: 'Queue' }).first().click();
  await expect(ana.locator('.list .row')).toHaveCount(4);
  await ana.getByRole('button', { name: 'Cancel my song' }).nth(1).click();
  await ana.getByRole('button', { name: 'Cancel song' }).click();
  await expect(ana.locator('.list .row')).toHaveCount(3);
  await expect(ana.locator('.list')).not.toContainText('song0000102');

  // Host (via admin) moves Ben's song to the front, then removes Ben entirely.
  const host = await phone(browser);
  await host.goto('/admin');
  await host.evaluate((t) => localStorage.setItem('ok:admin', JSON.stringify(t)), adminToken);
  await host.goto('/admin');
  await host.locator('.party', { hasText: joinCode }).getByRole('button', { name: 'Host controls' }).click();
  await host.getByRole('button', { name: 'Queue' }).first().click();
  await host.getByRole('button', { name: 'Song options' }).last().click();
  await host.getByRole('button', { name: 'Play next' }).click();
  await expect(host.locator('.list .row').first()).toContainText('Ben');
  await host.getByRole('button', { name: 'Host' }).last().click();
  await host.locator('.guest', { hasText: 'Ben' }).click();
  await host.getByRole('button', { name: 'Remove from party' }).click();
  await expect(host.locator('.guest', { hasText: 'Ben' })).toHaveCount(0);
  await expect(ben.getByText('You were removed from the party')).toBeVisible();

  // TV remote: fast-forward asks for confirmation; Up selects "Skip song"; OK skips.
  await host.getByRole('button', { name: 'Start the party' }).last().click();
  // The up-next card runs 15s by default; OK on the remote starts the song straight away.
  await expect(tv.getByText('Press OK to start', { exact: false })).toBeVisible({ timeout: 10_000 });
  await tv.keyboard.press('Enter');
  const fake = tv.getByTestId('fake-player');
  await expect(fake).toHaveAttribute('data-state', 'playing', { timeout: 8_000 });
  const firstId = await tv.locator('.fp-id').textContent();
  await tv.keyboard.press('n'); // not mapped → ignored
  await tv.keyboard.press('MediaTrackNext');
  await expect(tv.getByText('Skip this song?')).toBeVisible();
  await expect(tv.getByRole('button', { name: 'Cancel' })).toBeFocused(); // safe default
  await tv.keyboard.press('ArrowUp');
  await expect(tv.getByRole('button', { name: 'Skip song' })).toBeFocused();
  await tv.keyboard.press('Enter');
  await expect(tv.locator('.singer')).toHaveText('Ana', { timeout: 10_000 }); // next song's intro
  await tv.keyboard.press('Enter');
  await expect(tv.locator('.fp-id')).not.toHaveText(firstId ?? '', { timeout: 20_000 });
});
