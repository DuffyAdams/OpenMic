<script lang="ts">
  import { useParty } from '$lib/party.svelte';
  import { toasts } from '$lib/toast.svelte';
  import type { Participant } from '$lib/types';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import Sheet from '../Sheet.svelte';
  import Stepper from '../Stepper.svelte';
  import Switch from '../Switch.svelte';
  import NowPlayingCard from './NowPlayingCard.svelte';

  const party = useParty();
  const s = $derived(party.state);
  const phase = $derived(s?.playback.phase ?? 'idle');
  const current = $derived(s?.now_playing ?? null);
  const active = $derived(phase === 'intro' || phase === 'playing');

  let confirmSkip = $state(false);
  let confirmEnd = $state(false);
  let guestFor = $state<Participant | null>(null);
  let editingTitle = $state(false);
  let titleDraft = $state('');

  function skip() {
    confirmSkip = false;
    if (current) party.command('skip', current.id);
  }

  async function saveTitle(e: Event) {
    e.preventDefault();
    const title = titleDraft.trim();
    if (title && title !== s?.session.title) await party.settings({ title });
    editingTitle = false;
  }

  async function showJoin() {
    const r = await party.command('show_join');
    if (r) toasts.show({ kind: 'success', title: 'Join code is on the TV' });
  }
</script>

{#if s}
  <section class="host">
    <div class="status-row">
      <span class="chip" class:chip-success={s.tv_online} class:chip-danger={!s.tv_online}>
        <Icon name="tv" size={14} />
        {s.tv_online ? 'TV connected' : 'TV offline'}
      </span>
      <span class="chip">{s.participants.length} {s.participants.length === 1 ? 'guest' : 'guests'}</span>
      <span class="chip">Code {s.session.join_code}</span>
    </div>

    {#if s.session.status === 'lobby'}
      <div class="start card">
        <p class="eyebrow">Ready when you are</p>
        <h2 class="display">Start the party</h2>
        <p class="muted">
          {s.queue.length
            ? `${s.queue.length} ${s.queue.length === 1 ? 'song is' : 'songs are'} waiting.`
            : 'Guests can join and queue songs before you start.'}
        </p>
        <button class="btn btn-gold btn-lg btn-block" onclick={() => party.command('start')}>
          <Icon name="play" size={20} fill /> Start the party
        </button>
      </div>
    {/if}

    {#if current || s.session.status === 'active'}<NowPlayingCard />{/if}

    {#if current}
      {#if phase === 'error'}
        <div class="error card">
          <p><Icon name="alert" size={18} /> {current.failure_reason ?? "This video can't play on the TV."}</p>
          <div class="row2">
            <button class="btn btn-primary btn-lg" onclick={() => party.command('skip', current.id)}>
              <Icon name="skip" size={20} /> Skip it
            </button>
            <button class="btn btn-lg" onclick={() => party.command('retry')}>
              <Icon name="restart" size={20} /> Try again
            </button>
          </div>
        </div>
      {:else}
        <div class="controls">
          <button class="ctl" onclick={() => party.command('restart')} disabled={!active} aria-label="Restart song">
            <Icon name="restart" size={24} /><span>Restart</span>
          </button>
          <button
            class="ctl main"
            onclick={() => party.command(s.playback.paused ? 'resume' : 'pause')}
            disabled={!active}
            aria-label={s.playback.paused ? 'Resume' : 'Pause'}
          >
            <Icon name={s.playback.paused ? 'play' : 'pause'} size={30} fill={s.playback.paused} stroke={s.playback.paused ? 1.9 : 3} />
          </button>
          <button class="ctl" onclick={() => (confirmSkip = true)} disabled={!active} aria-label="Skip song">
            <Icon name="skip" size={24} /><span>Skip</span>
          </button>
        </div>
      {/if}
    {/if}

    <div class="group card">
      <Switch
        checked={s.session.queue_open}
        label="Accept new songs"
        hint={s.session.queue_open ? 'Guests can add songs' : 'Requests are paused (hosts can still add)'}
        onchange={(v) => party.command(v ? 'unlock_queue' : 'lock_queue')}
      />
      <button class="link-row" onclick={showJoin}>
        <Icon name="qr" size={20} />
        <span>Show join code on the TV</span>
        <Icon name="right" size={18} />
      </button>
    </div>

    <h3 class="section">Party settings</h3>
    <div class="group card">
      {#if editingTitle}
        <form class="title-edit" onsubmit={saveTitle}>
          <!-- svelte-ignore a11y_autofocus -->
          <input class="input" bind:value={titleDraft} maxlength="60" autofocus aria-label="Party name" />
          <button class="btn btn-primary">Save</button>
        </form>
      {:else}
        <button class="link-row" onclick={() => { titleDraft = s.session.title; editingTitle = true; }}>
          <Icon name="edit" size={20} />
          <span><span class="faint">Party name</span><br /><strong>{s.session.title}</strong></span>
          <Icon name="right" size={18} />
        </button>
      {/if}
      <Stepper
        label="Up-next card"
        hint="Seconds the TV shows the next singer"
        value={s.session.intro_seconds}
        min={0}
        max={20}
        step={2}
        format={(v) => (v ? `${v}s` : 'Off')}
        onchange={(v) => party.settings({ intro_seconds: v })}
      />
      <Stepper
        label="Songs per guest"
        hint="Max waiting at once"
        value={s.session.max_pending_per_guest}
        min={0}
        max={10}
        format={(v) => (v ? String(v) : '∞')}
        onchange={(v) => party.settings({ max_pending_per_guest: v })}
      />
      <Switch
        checked={s.session.auto_skip_failed}
        label="Auto-skip unplayable videos"
        hint="Otherwise the TV waits for you"
        onchange={(v) => party.settings({ auto_skip_failed: v })}
      />
      <Switch
        checked={s.session.show_notifications}
        label="TV notifications"
        hint="“Added to queue” banners beside the video"
        onchange={(v) => party.settings({ show_notifications: v })}
      />
    </div>

    <h3 class="section">Guests</h3>
    <ul class="group card guests">
      {#each s.participants as p (p.id)}
        <li>
          <button class="guest" onclick={() => (guestFor = p)} disabled={p.id === party.creds.participantId}>
            <Avatar id={p.id} name={p.display_name} online={p.online ?? false} />
            <span class="name">{p.display_name}{#if p.id === party.creds.participantId}&nbsp;<span class="faint">(you)</span>{/if}</span>
            {#if p.role === 'host'}<span class="chip chip-gold"><Icon name="crown" size={12} /> Host</span>{/if}
          </button>
        </li>
      {/each}
    </ul>

    <button class="btn btn-danger btn-block end" onclick={() => (confirmEnd = true)}>
      End the party
    </button>
  </section>

  <Sheet open={confirmSkip} onclose={() => (confirmSkip = false)} title="Skip this song?">
    <p class="muted sub">“{current?.title}” sung by {current?.singer} will stop now.</p>
    <div class="stack">
      <button class="btn btn-primary btn-lg btn-block" onclick={skip}><Icon name="skip" size={20} /> Skip song</button>
      <button class="btn btn-ghost btn-block" onclick={() => (confirmSkip = false)}>Keep playing</button>
    </div>
  </Sheet>

  <Sheet open={confirmEnd} onclose={() => (confirmEnd = false)} title="End the party?">
    <p class="muted sub">Everyone's queue is cleared and guests are signed out. The TV gets a fresh join code.</p>
    <div class="stack">
      <button class="btn btn-danger btn-lg btn-block" onclick={() => { confirmEnd = false; party.end(); }}>End party</button>
      <button class="btn btn-ghost btn-block" onclick={() => (confirmEnd = false)}>Keep singing</button>
    </div>
  </Sheet>

  <Sheet open={!!guestFor} onclose={() => (guestFor = null)} title={guestFor?.display_name ?? ''}>
    {#if guestFor}
      {@const g = guestFor}
      <div class="stack">
        {#if g.role !== 'host'}
          <button class="btn btn-block" onclick={() => { const id = g.id; guestFor = null; party.promote(id); }}>
            <Icon name="crown" size={18} /> Make a host
          </button>
        {/if}
        <button class="btn btn-danger btn-block" onclick={() => { const id = g.id; guestFor = null; party.removeGuest(id); }}>
          <Icon name="logout" size={18} /> Remove from party
        </button>
        <p class="faint small">Removing cancels their waiting songs.</p>
      </div>
    {/if}
  </Sheet>
{/if}

<style>
  .host {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .status-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .start {
    padding: 20px;
    background: linear-gradient(135deg, #5b2fa8, #2c1850 70%) border-box;
  }
  .start h2 {
    margin: 6px 0 6px;
    font-size: 2rem;
  }
  .start .eyebrow {
    color: var(--accent-strong);
  }
  .start :global(.muted) {
    color: rgba(255, 255, 255, 0.8);
  }
  .start p {
    margin: 0 0 16px;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
    padding: 6px 0;
  }
  .ctl {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 72px;
    padding: 8px;
    border-radius: var(--radius);
    color: var(--text-2);
    font-size: 0.78rem;
    font-weight: 700;
  }
  .ctl:disabled {
    opacity: 0.35;
  }
  .ctl.main {
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    min-width: 0;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    transition: transform var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
  }
  .ctl.main:hover {
    transform: scale(1.06);
    background: var(--accent-strong);
  }
  .ctl:active {
    transform: scale(0.95);
  }
  .error {
    padding: 16px;
    background: linear-gradient(180deg, var(--danger-soft), var(--surface));
  }
  .error p {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0 0 14px;
    color: var(--danger);
    font-weight: 700;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .group {
    padding: 4px 0;
    overflow: hidden;
  }
  .group > :global(* + *) {
    border-top: 1px solid var(--border);
  }
  .section {
    margin: 14px 0 -2px;
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .link-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    text-align: left;
    color: var(--text);
  }
  .link-row > span {
    flex: 1;
    font-weight: 700;
  }
  .link-row .faint {
    font-size: 0.82rem;
    font-weight: 600;
  }
  .link-row :global(svg:first-child) {
    color: var(--accent);
  }
  .title-edit {
    display: flex;
    gap: 8px;
    padding: 10px;
  }
  .title-edit .input {
    height: 48px;
  }
  .guests {
    list-style: none;
    margin: 0;
  }
  .guest {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    text-align: left;
  }
  .guest:disabled {
    cursor: default;
  }
  .guest .name {
    flex: 1;
    font-weight: 700;
  }
  .end {
    margin-top: 14px;
  }
  .sub {
    margin: -6px 0 18px;
  }
  .stack {
    display: grid;
    gap: 10px;
  }
  .small {
    margin: 4px 0 0;
    font-size: 0.85rem;
    text-align: center;
  }
</style>
