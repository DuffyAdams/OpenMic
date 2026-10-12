<script lang="ts">
  import { api, ApiError } from '$lib/api';
  import { randomAvatar } from '$lib/avatars';
  import Icon, { type IconName } from '$lib/components/Icon.svelte';
  import SimDevice from '$lib/components/sim/SimDevice.svelte';
  import { clearSimDevices, simDevice, store } from '$lib/storage';
  import { fromKeyboard, type TvKey } from '$lib/tv/keys';
  import { SECRET_KEY } from '$lib/tv/tv.svelte';
  import type {
    AdminLoginResponse,
    HostInviteResponse,
    JoinResponse,
    TvRegisterResponse,
    TvSessionResponse,
    TvStatus
  } from '$lib/types';

  /**
   * Developer simulator: the TV, the host's phone and guest phones side by side, each a real copy
   * of the app in its own frame with its own storage (see `simDevice` in $lib/storage).
   */

  type PlayerMode = 'auto' | 'fake' | 'youtube';
  interface SimSettings {
    password: string;
    player: PlayerMode;
    fakeDuration: number;
    signIn: boolean;
    guests: number;
    stacked: boolean;
    party: { code: string; sessionId: string } | null;
  }

  const SETTINGS_KEY = 'ok:sim';
  const TV_NAME = 'Simulator TV';
  const HOST_NAME = 'Duffy';
  const GUEST_NAMES = ['Jessica', 'Mike', 'Priya'];
  const MAX_GUESTS = GUEST_NAMES.length;
  const TV_SIZE = { width: 1920, height: 1080 };
  const PHONE_SIZE = { width: 390, height: 844 };

  let settings = $state<SimSettings>({
    password: 'karaoke',
    player: 'auto',
    fakeDuration: 20,
    signIn: false,
    guests: 1,
    stacked: false,
    party: null,
    ...store.get<Partial<SimSettings>>(SETTINGS_KEY)
  });
  $effect(() => store.set(SETTINGS_KEY, $state.snapshot(settings)));

  const guestIds = $derived(Array.from({ length: settings.guests }, (_, i) => `guest${i + 1}`));

  function tvPage(): string {
    if (settings.player === 'fake') return `/tv?player=fake&fakeDuration=${settings.fakeDuration}`;
    if (settings.player === 'youtube') return '/tv?player=youtube';
    return '/tv';
  }

  /** Where a phone goes when the page opens: back into the party if it already joined. */
  function startPage(device: string): string {
    const code = settings.party?.code;
    if (!code) return '/';
    if (simDevice(device).credentials.get(code)) return `/room/${code}`;
    return device === 'host' ? '/' : `/join/${code}`;
  }

  const PHONES = ['host', ...GUEST_NAMES.map((_, i) => `guest${i + 1}`)];
  let srcs = $state<Record<string, string>>({
    tv: tvPage(),
    ...Object.fromEntries(PHONES.map((d) => [d, startPage(d)]))
  });

  let frames = $state<Record<string, SimDevice>>({});
  let tvFrame = $state<HTMLIFrameElement>();

  function go(device: string, path: string) {
    srcs[device] = path;
    frames[device]?.reload();
  }

  let busy = $state(false);
  let status = $state('');
  let failed = $state(false);

  function report(msg: string, error = false) {
    status = msg;
    failed = error;
  }

  /** A paired TV identity for the TV frame: reuse the saved one, or register and pair a new one. */
  async function pairedTvSecret(): Promise<string> {
    const tv = simDevice('tv').store;
    let secret = tv.get<string>(SECRET_KEY);
    let pairingCode: string | null = null;
    if (secret) {
      try {
        const me = await api<TvStatus>('/api/tv/me', { token: secret });
        if (me.paired) return secret;
        pairingCode = me.pairing_code ?? null;
      } catch {
        secret = null;
      }
    }
    if (!secret || !pairingCode) {
      const r = await api<TvRegisterResponse>('/api/tv/register', {
        method: 'POST',
        body: { name: TV_NAME }
      });
      secret = r.device_secret;
      pairingCode = r.pairing_code;
      tv.set(SECRET_KEY, secret);
    }
    const admin = await api<AdminLoginResponse>('/api/admin/login', {
      method: 'POST',
      body: { password: settings.password }
    });
    await api('/api/admin/devices/pair', {
      method: 'POST',
      token: admin.token,
      body: { code: pairingCode, name: TV_NAME }
    });
    return secret;
  }

  /** Save a join the way the join/claim pages do, in that phone's own storage. */
  function remember(device: string, r: JoinResponse) {
    const phone = simDevice(device);
    phone.prefs.name = r.participant.display_name;
    if (r.participant.avatar) phone.prefs.avatar = r.participant.avatar;
    phone.credentials.set({
      token: r.token,
      participantId: r.participant.id,
      sessionId: r.session_id,
      joinCode: r.join_code,
      displayName: r.participant.display_name,
      avatar: r.participant.avatar
    });
  }

  async function signInGuest(device: string, code: string) {
    const name = GUEST_NAMES[Number(device.replace('guest', '')) - 1] ?? 'Guest';
    const r = await api<JoinResponse>('/api/sessions/join', {
      method: 'POST',
      body: { join_code: code, display_name: name, avatar: randomAvatar() }
    });
    remember(device, r);
    go(device, `/room/${code}`);
  }

  /** Pair the TV if needed, start a fresh party, and send every phone to its first screen. */
  async function setUpParty() {
    busy = true;
    try {
      report('Pairing the TV…');
      const secret = await pairedTvSecret();

      report('Starting a new party…');
      const session = await api<TvSessionResponse>('/api/tv/session/new', {
        method: 'POST',
        token: secret
      });
      const code = session.join_code;
      settings.party = { code, sessionId: session.session_id };
      go('tv', tvPage());

      const invite = await api<HostInviteResponse>(
        `/api/tv/sessions/${session.session_id}/host-invite`,
        { method: 'POST', token: secret }
      );
      for (const device of ['host', ...guestIds]) clearSimDevices(device);

      if (settings.signIn) {
        report('Signing the phones in…');
        const host = await api<JoinResponse>('/api/host/claim', {
          method: 'POST',
          body: { invite: invite.invite, display_name: HOST_NAME, avatar: randomAvatar() }
        });
        remember('host', host);
        go('host', `/room/${code}`);
        for (const device of guestIds) await signInGuest(device, code);
      } else {
        go('host', invite.path);
        for (const device of guestIds) go(device, `/join/${code}`);
      }
      report(`Party ${code} is ready.`);
    } catch (e) {
      report(e instanceof ApiError ? e.message : 'Setup failed. Is the API running?', true);
    } finally {
      busy = false;
    }
  }

  /** Forget every simulated device: the TV shows a new pairing code, phones never joined. */
  function resetAll() {
    clearSimDevices();
    settings.party = null;
    go('tv', tvPage());
    for (const device of ['host', ...guestIds]) go(device, '/');
    report('Everything reset. The TV is waiting to be paired.');
  }

  function setGuests(n: number) {
    const next = Math.max(0, Math.min(MAX_GUESTS, n));
    for (let i = next + 1; i <= settings.guests; i++) {
      clearSimDevices(`guest${i}`);
      srcs[`guest${i}`] = '/';
    }
    settings.guests = next;
  }

  /** A guest added mid-party: sign them in too when that's the mode, else open the join page. */
  async function addGuest() {
    const device = `guest${settings.guests + 1}`;
    setGuests(settings.guests + 1);
    const code = settings.party?.code;
    if (!code) return;
    if (!settings.signIn) return go(device, `/join/${code}`);
    try {
      await signInGuest(device, code);
    } catch (e) {
      report(e instanceof ApiError ? e.message : 'Could not sign the guest in.', true);
    }
  }

  /**
   * The TV page keeps focus on its own controls: it re-focuses on blur and on every screen change.
   * On a real TV that's its own screen; here it would pull the keyboard away from the phone being
   * typed on. So the TV doesn't take focus while a phone has it; its D-pad focus comes back with
   * the next remote key (the parent's activeElement lags behind frames, so each frame is asked).
   */
  function keepPhoneFocus(win: Window) {
    const w = win as Window & typeof globalThis & { __simFocusGuard?: boolean };
    if (w.__simFocusGuard) return;
    w.__simFocusGuard = true;
    const phoneHasFocus = () =>
      [...document.querySelectorAll('iframe')].some((f) => f !== tvFrame && f.contentDocument?.hasFocus());
    const guard =
      <A extends unknown[]>(focus: (...args: A) => void) =>
      function (this: unknown, ...args: A) {
        if (!phoneHasFocus()) focus.apply(this, args);
      };
    w.HTMLElement.prototype.focus = guard(w.HTMLElement.prototype.focus);
    w.focus = guard(w.focus.bind(w));
  }

  function changePlayer() {
    go('tv', tvPage());
  }

  // ---- The remote: buttons, or the keyboard while the page itself (not a device) has focus.

  const REMOTE: { key: TvKey; icon?: IconName; label: string; area: string }[] = [
    { key: 'up', icon: 'up', label: 'Up', area: 'up' },
    { key: 'left', icon: 'left', label: 'Left', area: 'left' },
    { key: 'select', label: 'OK', area: 'ok' },
    { key: 'right', icon: 'right', label: 'Right', area: 'right' },
    { key: 'down', icon: 'down', label: 'Down', area: 'down' }
  ];
  const EXTRA: { key: TvKey; icon?: IconName; label: string }[] = [
    { key: 'back', label: 'Back' },
    { key: 'menu', label: 'Menu' },
    { key: 'rewind', icon: 'restart', label: 'Rewind' },
    { key: 'playpause', icon: 'play', label: 'Play/Pause' },
    { key: 'forward', icon: 'skip', label: 'Forward' }
  ];

  function press(key: TvKey) {
    const handled = tvFrame?.contentWindow?.__tvKey?.(key);
    if (handled === undefined) report('The TV isn’t ready for remote keys yet.', true);
  }

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, button, a')) return;
    const key = fromKeyboard(e);
    if (key) {
      e.preventDefault();
      press(key);
    }
  }
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Simulator · OpenMic</title></svelte:head>

<div class="sim">
  <header class="toolbar">
    <div class="title">
      <Icon name="tv" size={20} />
      <strong>Simulator</strong>
      {#if settings.party}
        <span class="chip chip-accent">Party {settings.party.code}</span>
      {:else}
        <span class="chip">No party</span>
      {/if}
    </div>

    <div class="actions">
      <button class="btn btn-primary btn-sm" disabled={busy} onclick={setUpParty}>
        <Icon name="sparkle" size={16} />
        {settings.party ? 'New party' : 'Set up party'}
      </button>
      <button class="btn btn-sm" disabled={busy} onclick={resetAll}>Reset all</button>
    </div>

    <p class="status" class:failed aria-live="polite">{status}</p>

    <div class="options">
      <label>
        Player
        <select bind:value={settings.player} onchange={changePlayer}>
          <option value="auto">Auto</option>
          <option value="fake">Demo</option>
          <option value="youtube">YouTube</option>
        </select>
      </label>
      {#if settings.player === 'fake'}
        <label>
          Song length
          <input type="number" min="5" max="600" bind:value={settings.fakeDuration} onchange={changePlayer} />s
        </label>
      {/if}
      <label title="Join the phones by API instead of typing names">
        <input type="checkbox" bind:checked={settings.signIn} />
        Skip name entry
      </label>
      <label>
        Admin password
        <input type="password" bind:value={settings.password} autocomplete="off" />
      </label>
      <span class="guests">
        Guests
        <button class="icon-btn step" aria-label="Remove a guest" disabled={settings.guests === 0}
          onclick={() => setGuests(settings.guests - 1)}>−</button>
        <output>{settings.guests}</output>
        <button class="icon-btn step" aria-label="Add a guest" disabled={settings.guests >= MAX_GUESTS}
          onclick={addGuest}>+</button>
      </span>
      <label>
        <input type="checkbox" bind:checked={settings.stacked} />
        TV on top
      </label>
    </div>
  </header>

  <main class="stage" class:stacked={settings.stacked}>
    <div class="tv-col">
      <SimDevice
        bind:this={frames.tv}
        bind:frame={tvFrame}
        device="tv"
        label="TV"
        kind="tv"
        src={srcs.tv}
        onload={keepPhoneFocus}
        {...TV_SIZE}
      >
        <div class="remote" aria-label="Fire TV remote">
          <div class="dpad">
            {#each REMOTE as b (b.key)}
              <button class="key" style:grid-area={b.area} aria-label={b.label} title={b.label}
                onclick={() => press(b.key)}>
                {#if b.icon}<Icon name={b.icon} size={16} />{:else}{b.label}{/if}
              </button>
            {/each}
          </div>
          <div class="extra">
            {#each EXTRA as b (b.key)}
              <button class="key wide" aria-label={b.label} title={b.label} onclick={() => press(b.key)}>
                {#if b.icon}<Icon name={b.icon} size={16} />{:else}{b.label}{/if}
              </button>
            {/each}
          </div>
          <p class="hint">
            Keyboard works too: click an empty spot on this page, then use arrows, Enter, Esc, M and P.
          </p>
        </div>
      </SimDevice>
    </div>

    <div class="phones">
      <SimDevice bind:this={frames.host} device="host" label="Host phone" src={srcs.host} {...PHONE_SIZE} />
      {#each guestIds as id, i (id)}
        <SimDevice
          bind:this={frames[id]}
          device={id}
          label={settings.guests > 1 ? `Guest ${i + 1}` : 'Guest phone'}
          src={srcs[id]}
          {...PHONE_SIZE}
        />
      {/each}
    </div>
  </main>
</div>

<style>
  .sim {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .toolbar {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .status {
    margin: 0;
    flex: 1 1 160px;
    min-width: 0;
    font-size: 0.85rem;
    color: var(--text-2);
  }
  .status.failed {
    color: var(--danger);
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    font-size: 0.82rem;
    color: var(--text-2);
  }
  .options label,
  .guests {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .options select,
  .options input[type='number'],
  .options input[type='password'] {
    height: 30px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.82rem;
  }
  .options input[type='number'] {
    width: 64px;
  }
  .options input[type='password'] {
    width: 110px;
  }
  .options input[type='checkbox'] {
    accent-color: var(--accent);
  }
  .step {
    width: 26px;
    height: 26px;
    background: var(--surface-2);
    font-weight: 800;
  }
  .step:disabled {
    opacity: 0.4;
  }
  .guests output {
    min-width: 1ch;
    text-align: center;
    color: var(--text);
    font-weight: 700;
  }

  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 20px;
    padding: 16px;
  }
  .tv-col {
    flex: 1 1 0;
    min-width: 280px;
    display: flex;
    flex-direction: column;
  }
  .tv-col > :global(.device) {
    flex: 1;
  }
  .phones {
    flex: none;
    display: flex;
    gap: 16px;
    height: 100%;
    max-width: 62%;
  }
  .phones > :global(.device) {
    height: 100%;
    aspect-ratio: 9 / 19;
    min-width: 0;
    flex: 0 1 auto;
  }
  .stacked {
    flex-direction: column;
  }
  .stacked .tv-col {
    flex: 1.2 1 0;
    min-height: 0;
  }
  .stacked .phones {
    flex: 1 1 0;
    min-height: 0;
    max-width: none;
    justify-content: center;
  }

  .remote {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px 18px;
  }
  .dpad {
    display: grid;
    grid-template-areas: '. up .' 'left ok right' '. down .';
    gap: 3px;
  }
  .extra {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .key {
    display: grid;
    place-items: center;
    min-width: 34px;
    height: 30px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.78rem;
    font-weight: 700;
  }
  .key:hover {
    background: var(--surface-3);
  }
  .key:active {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .hint {
    margin: 0;
    flex-basis: 100%;
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-3);
  }
</style>
