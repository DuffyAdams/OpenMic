<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { api, ApiError } from '$lib/api';
  import AdminLogin from '$lib/components/AdminLogin.svelte';
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import { credentials, prefs } from '$lib/storage';
  import { toasts } from '$lib/toast.svelte';
  import type { AdminOverview, DeviceOut, JoinResponse } from '$lib/types';

  let token = $state(prefs.adminToken);
  let overview = $state<AdminOverview | null>(null);
  let pairCode = $state('');
  let pairName = $state('');
  let pairBusy = $state(false);
  let renaming = $state<DeviceOut | null>(null);
  let renameValue = $state('');
  let confirmRevoke = $state<DeviceOut | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function call<T>(path: string, opts: Parameters<typeof api>[1] = {}) {
    try {
      return await api<T>(path, { ...opts, token });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        prefs.adminToken = null;
        token = null;
      }
      throw e;
    }
  }

  async function load() {
    if (!token) return;
    try {
      overview = await call<AdminOverview>('/api/admin/overview');
    } catch (e) {
      if (token) toasts.error(e instanceof ApiError ? e.message : 'Could not load');
    }
  }

  onMount(() => {
    load();
    timer = setInterval(load, 5000);
  });
  onDestroy(() => clearInterval(timer));

  async function pair(e: Event) {
    e.preventDefault();
    pairBusy = true;
    try {
      const d = await call<DeviceOut>('/api/admin/devices/pair', {
        method: 'POST',
        body: { code: pairCode, name: pairName || null }
      });
      toasts.show({ kind: 'success', title: `${d.name} paired`, body: 'The TV will open the party lobby.' });
      pairCode = '';
      pairName = '';
      load();
    } catch (err) {
      toasts.error(err instanceof ApiError ? err.message : 'Pairing failed');
    } finally {
      pairBusy = false;
    }
  }

  async function hostParty(sessionId: string, joinCode: string) {
    const existing = credentials.get(joinCode);
    if (existing?.sessionId === sessionId) {
      goto(`${base}/room/${joinCode}`);
      return;
    }
    try {
      const r = await call<JoinResponse>(`/api/admin/sessions/${sessionId}/host`, {
        method: 'POST',
        body: { display_name: prefs.name || 'Host' }
      });
      credentials.set({
        token: r.token,
        participantId: r.participant.id,
        sessionId: r.session_id,
        joinCode: r.join_code,
        displayName: r.participant.display_name
      });
      goto(`${base}/room/${r.join_code}`);
    } catch (err) {
      toasts.error(err instanceof ApiError ? err.message : 'Could not open the party');
    }
  }

  async function endParty(sessionId: string) {
    try {
      await call(`/api/admin/sessions/${sessionId}/end`, { method: 'POST' });
      toasts.show({ kind: 'success', title: 'Party ended' });
      load();
    } catch (err) {
      toasts.error(err instanceof ApiError ? err.message : 'Could not end the party');
    }
  }

  async function rename(e: Event) {
    e.preventDefault();
    if (!renaming) return;
    try {
      await call(`/api/admin/devices/${renaming.id}`, { method: 'PATCH', body: { name: renameValue } });
      renaming = null;
      load();
    } catch (err) {
      toasts.error(err instanceof ApiError ? err.message : 'Rename failed');
    }
  }

  async function revoke(d: DeviceOut) {
    confirmRevoke = null;
    try {
      await call(`/api/admin/devices/${d.id}`, { method: 'DELETE' });
      toasts.show({ title: `${d.name} removed` });
      load();
    } catch (err) {
      toasts.error(err instanceof ApiError ? err.message : 'Could not remove');
    }
  }

  function logout() {
    prefs.adminToken = null;
    token = null;
    overview = null;
  }

  function ago(iso: string | null | undefined) {
    if (!iso) return 'never';
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  }

  const openParties = $derived(overview?.sessions.filter((s) => s.status !== 'ended') ?? []);
  const pastParties = $derived(overview?.sessions.filter((s) => s.status === 'ended').slice(0, 5) ?? []);
</script>

<svelte:head><title>Host setup · OpenMic</title></svelte:head>

<div class="lounge-bg"></div>
<main class="page admin">
  <header>
    <a href="{base}/" class="home"><Brand /></a>
    {#if token}<button class="btn btn-ghost btn-sm" onclick={logout}>Sign out</button>{/if}
  </header>

  {#if !token}
    <AdminLogin onlogin={(t) => { token = t; load(); }} />
  {:else if !overview}
    <p class="faint">Loading…</p>
  {:else}
    <section>
      <h2>Parties</h2>
      {#if openParties.length}
        <ul class="list">
          {#each openParties as s (s.id)}
            <li class="card party">
              <div class="row">
                <div class="grow">
                  <strong>{s.title}</strong>
                  <p class="faint">
                    Code <span class="mono">{s.join_code}</span> · {s.guest_count} guests · {s.pending_count} waiting · {s.songs_played} sung
                  </p>
                </div>
                <span class="chip" class:chip-success={s.status === 'active'}>{s.status === 'active' ? 'Live' : 'Lobby'}</span>
              </div>
              <div class="row actions">
                <button class="btn btn-primary btn-sm" onclick={() => hostParty(s.id, s.join_code)}>
                  <Icon name="sliders" size={16} /> Host controls
                </button>
                <a class="btn btn-ghost btn-sm" href="{base}/join/{s.join_code}">Guest view</a>
                <button class="btn btn-danger btn-sm" onclick={() => endParty(s.id)}>End</button>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="card empty muted">No party is running. Open OpenMic on a paired TV to start one.</p>
      {/if}
    </section>

    <section>
      <h2>TVs</h2>
      {#if overview.devices.length}
        <ul class="list">
          {#each overview.devices as d (d.id)}
            <li class="card device">
              <span class="tv-ico" class:on={d.online}><Icon name="tv" size={22} /></span>
              <div class="grow">
                <strong>{d.name}</strong>
                <p class="faint">
                  {d.online ? 'Online' : `Last seen ${ago(d.last_seen_at)}`}{#if d.active_join_code} · party {d.active_join_code}{/if}
                </p>
              </div>
              <button class="icon-btn" aria-label="Rename {d.name}" onclick={() => { renaming = d; renameValue = d.name; }}>
                <Icon name="edit" size={18} />
              </button>
              <button class="icon-btn" aria-label="Remove {d.name}" onclick={() => (confirmRevoke = d)}>
                <Icon name="trash" size={18} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <form class="card pair" onsubmit={pair}>
        <p class="eyebrow">Pair a TV</p>
        <p class="muted">Open OpenMic on the TV. Enter the code it shows, or scan its QR code.</p>
        <div class="pair-row">
          <input class="input mono code" bind:value={pairCode} placeholder="CODE12" maxlength="8" autocapitalize="characters" aria-label="Pairing code" />
          <input class="input" bind:value={pairName} placeholder="Name (optional)" maxlength="40" aria-label="TV name" />
        </div>
        <button class="btn btn-primary btn-block" disabled={pairBusy || pairCode.trim().length < 4}>Pair TV</button>
      </form>
    </section>

    <section>
      <h2>YouTube search</h2>
      <div class="card info">
        {#if overview.search_enabled}
          <p><Icon name="check" size={18} /> Search is on.
            {#if overview.searches_remaining_today !== null}{overview.searches_remaining_today} searches left today.{/if}</p>
        {:else}
          <p><Icon name="alert" size={18} /> Search is off — guests can still paste YouTube links.</p>
          <p class="faint">Set <code>YOUTUBE_API_KEY</code> on the server to enable search.</p>
        {/if}
      </div>
    </section>

    {#if pastParties.length}
      <section>
        <h2>Recent parties</h2>
        <ul class="list">
          {#each pastParties as s (s.id)}
            <li class="past faint">{s.title} · {new Date(s.created_at).toLocaleDateString()} · {s.songs_played} songs</li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</main>

<Sheet open={!!renaming} onclose={() => (renaming = null)} title="Rename TV">
  <form class="rename" onsubmit={rename}>
    <input class="input" bind:value={renameValue} maxlength="40" aria-label="TV name" />
    <button class="btn btn-primary btn-block">Save</button>
  </form>
</Sheet>

<Sheet open={!!confirmRevoke} onclose={() => (confirmRevoke = null)} title="Remove this TV?">
  {#if confirmRevoke}
    {@const d = confirmRevoke}
    <p class="muted">{d.name} will be signed out and any party on it ends. You can pair it again later.</p>
    <div class="rename">
      <button class="btn btn-danger btn-block" onclick={() => revoke(d)}>Remove TV</button>
      <button class="btn btn-ghost btn-block" onclick={() => (confirmRevoke = null)}>Cancel</button>
    </div>
  {/if}
</Sheet>

<Toasts bottom="24px" />

<style>
  .admin {
    display: flex;
    flex-direction: column;
    gap: 26px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .home {
    color: var(--text);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .list {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .party {
    padding: 16px;
    display: grid;
    gap: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .grow p {
    margin: 2px 0 0;
    font-size: 0.86rem;
  }
  .actions {
    flex-wrap: wrap;
  }
  .mono {
    font-family: var(--font-mono);
    letter-spacing: 0.1em;
  }
  .device {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 12px 16px;
  }
  .tv-ico {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--text-3);
  }
  .tv-ico.on {
    background: var(--success-soft);
    color: var(--success);
  }
  .pair {
    padding: 18px;
    display: grid;
    gap: 12px;
  }
  .pair p {
    margin: 0;
  }
  .pair-row {
    display: grid;
    grid-template-columns: 1fr 1.3fr;
    gap: 8px;
  }
  .code {
    text-transform: uppercase;
    font-weight: 800;
  }
  .empty {
    padding: 18px;
    margin: 0;
  }
  .info {
    padding: 16px;
  }
  .info p {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .info p + p {
    margin-top: 6px;
  }
  .past {
    font-size: 0.88rem;
  }
  .rename {
    display: grid;
    gap: 10px;
    margin-top: 6px;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.85em;
  }
</style>
