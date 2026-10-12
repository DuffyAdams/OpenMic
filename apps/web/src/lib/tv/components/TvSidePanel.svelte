<script lang="ts">
  import Icon, { type IconName } from '$lib/components/Icon.svelte';
  import Qr from '$lib/components/Qr.svelte';
  import { singers } from '$lib/format';
  import { useTv } from '../context';
  import { focusScope } from '../focus';
  import { native } from '../native';

  const tv = useTv();
  const s = $derived(tv.room.state);
  const item = $derived(s?.now_playing ?? null);
  const active = $derived(s?.playback.phase === 'playing' || s?.playback.phase === 'intro');
  const host = $derived(tv.joinBase.replace(/^https?:\/\//, ''));
  const introSteps = [0, 5, 10, 15, 20, 25, 30];

  function nextIntro(cur: number) {
    const i = introSteps.findIndex((v) => v > cur);
    return introSteps[i === -1 ? 0 : i];
  }

  type Item = { icon: IconName; label: string; value?: string; danger?: boolean; run: () => void };
  const items = $derived.by((): Item[] => {
    if (!s) return [];
    const list: Item[] = [];
    if (s.session.status === 'lobby') list.push({ icon: 'play', label: 'Start the party', run: () => { tv.closeMenu(); tv.command('start'); } });
    if (item && active) {
      list.push({ icon: s.playback.paused ? 'play' : 'pause', label: s.playback.paused ? 'Resume' : 'Pause', run: () => tv.togglePause() });
      list.push({ icon: 'restart', label: 'Restart song', run: () => tv.command('restart') });
      list.push({ icon: 'skip', label: 'Skip song', run: () => tv.askSkip() });
    }
    list.push({ icon: 'qr', label: 'Show join code', run: () => { tv.closeMenu(); tv.openJoinPanel(); } });
    list.push({ icon: 'crown', label: 'Host from your phone', run: () => tv.showHostInvite() });
    list.push({ icon: 'queue', label: 'Up next', value: String(s.queue.length), run: () => (tv.menu = 'queue') });
    list.push({
      icon: s.session.queue_open ? 'unlock' : 'lock',
      label: 'Song requests',
      value: s.session.queue_open ? 'Open' : 'Paused',
      run: () => tv.command(s.session.queue_open ? 'lock_queue' : 'unlock_queue')
    });
    list.push({
      icon: 'sparkle',
      label: 'Up-next card',
      value: s.session.intro_seconds ? `${s.session.intro_seconds}s` : 'Off',
      run: () => tv.settings({ intro_seconds: nextIntro(s.session.intro_seconds) })
    });
    list.push({
      icon: 'users',
      label: 'Notifications',
      value: s.session.show_notifications ? 'On' : 'Off',
      run: () => tv.settings({ show_notifications: !s.session.show_notifications })
    });
    list.push({
      icon: 'alert',
      label: 'Auto-skip broken videos',
      value: s.session.auto_skip_failed ? 'On' : 'Off',
      run: () => tv.settings({ auto_skip_failed: !s.session.auto_skip_failed })
    });
    list.push({ icon: 'history', label: 'Diagnostics', run: () => (tv.menu = 'diag') });
    list.push({ icon: 'plus', label: 'Start a new party', danger: true, run: () => tv.askNewParty() });
    if (native.available) {
      list.push({ icon: 'tv', label: 'Server settings', run: () => native.openSettings() });
      list.push({ icon: 'logout', label: 'Exit app', run: () => tv.askExit() });
    }
    return list;
  });
</script>

{#key tv.confirm ? 'confirm' : (tv.menu ?? 'join')}
  <aside class="side" use:focusScope>
    {#if tv.confirm}
      {@const c = tv.confirm}
      <div class="confirm">
        <p class="tv-eyebrow">Confirm</p>
        <h2>{c.title}</h2>
        {#if c.body}<p class="body">{c.body}</p>{/if}
        <div class="stack">
          <button class="tv-btn {c.danger ? 'danger' : 'primary'}" data-focus onclick={() => { const run = c.action; tv.confirm = null; run(); }}>
            {c.confirmLabel}
          </button>
          <button class="tv-btn" data-focus data-autofocus onclick={() => (tv.confirm = null)}>Cancel</button>
        </div>
      </div>
    {:else if tv.menu === 'main'}
      <header>
        <p class="tv-eyebrow">Menu</p>
        <h2>{s?.session.title}</h2>
        <p class="faint">Room {s?.session.join_code} · {s?.participants.length ?? 0} singers</p>
      </header>
      <ul class="menu">
        {#each items as it, i (it.label)}
          <li>
            <button class="mi" class:danger={it.danger} data-focus data-autofocus={i === 0 ? '' : undefined} onclick={it.run}>
              <Icon name={it.icon} size="1.75rem" />
              <span class="lbl">{it.label}</span>
              {#if it.value}<span class="val">{it.value}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
      <p class="hint">Back closes this menu</p>
    {:else if tv.menu === 'host'}
      <header>
        <p class="tv-eyebrow">Host controls</p>
        <h2>Run the party from your phone</h2>
      </header>
      {#if tv.hostInvite}
        <div class="qr"><Qr value={tv.hostInvite.url} label="Scan to become host" /></div>
        <p class="body">Scan with the phone that should control playback. This code works for 15 minutes.</p>
      {/if}
      <button class="tv-btn" data-focus data-autofocus onclick={() => (tv.menu = 'main')}>
        <Icon name="left" size="1.625rem" /> Back
      </button>
    {:else if tv.menu === 'queue'}
      <header>
        <p class="tv-eyebrow">Up next</p>
        <h2>{s?.queue.length ? `${s.queue.length} waiting` : 'Nothing queued'}</h2>
      </header>
      <ol class="q">
        {#if item && active}
          <!-- The song on stage (or about to start) heads the line. -->
          <li class="now">
            <span class="n"><Icon name="mic" size="1.4rem" /></span>
            <span class="t"><em>{s?.playback.phase === 'intro' ? 'Up next' : 'On stage'}</em><strong>{singers(item)}</strong>{item.title}</span>
          </li>
        {/if}
        {#each s?.queue.slice(0, item && active ? 7 : 8) ?? [] as q, i (q.id)}
          <li><span class="n">{i + 1}</span><span class="t"><strong>{singers(q)}</strong>{q.title}</span></li>
        {/each}
      </ol>
      <button class="tv-btn" data-focus data-autofocus onclick={() => (tv.menu = 'main')}>
        <Icon name="left" size="1.625rem" /> Back
      </button>
    {:else if tv.menu === 'diag'}
      <header>
        <p class="tv-eyebrow">Diagnostics</p>
        <h2>Playback &amp; connection</h2>
      </header>
      <dl class="diag">
        <dt>Server</dt><dd>{location.host}</dd>
        <dt>Connection</dt><dd>{tv.room.status}</dd>
        <dt>Player</dt><dd>{tv.playerKind} · {tv.playerState}</dd>
        <dt>App</dt><dd>{native.available ? `Fire TV ${native.version}` : 'Browser'}</dd>
        <dt>Screen</dt><dd>{innerWidth}×{innerHeight} @{devicePixelRatio}x</dd>
      </dl>
      {#if tv.playerError}<p class="err">{tv.playerError}</p>{/if}
      <pre class="log">{tv.logs.slice(-14).join('\n')}</pre>
      <div class="row">
        <button class="tv-btn" data-focus data-autofocus onclick={() => (tv.menu = 'main')}>
          <Icon name="left" size="1.625rem" /> Back
        </button>
        <button class="tv-btn" data-focus onclick={() => native.reload()}>
          <Icon name="restart" size="1.625rem" /> Reload
        </button>
      </div>
    {:else}
      <!-- Join panel (Show join code) -->
      <header>
        <p class="tv-eyebrow">Join the party</p>
        <h2>Scan to add your songs</h2>
      </header>
      <div class="qr"><Qr value={tv.joinUrl} label="Scan to join" /></div>
      <p class="body center">{host} · code <strong class="tv-mono">{s?.session.join_code}</strong></p>
      <button class="tv-btn" data-focus data-autofocus onclick={() => (tv.joinPanel = false)}>Close</button>
    {/if}
  </aside>
{/key}

<style>
  .side {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    width: var(--side-w);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: var(--safe-y) 3rem var(--safe-y) 2.5rem;
    background: var(--bg);
    box-shadow: -2rem 0 4rem rgba(0, 0, 0, 0.45);
    animation: slide-in 280ms var(--ease) both;
    overflow: hidden;
  }
  @keyframes slide-in {
    from {
      transform: translateX(3rem);
      opacity: 0;
    }
  }
  header h2,
  .confirm h2 {
    margin: 0.5rem 0 0.4rem;
    font-size: 2.3rem;
    line-height: 1.15;
  }
  header p {
    margin: 0;
    font-size: 1.3rem;
  }
  .menu {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .menu::-webkit-scrollbar {
    display: none;
  }
  .mi {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    height: 4.1rem;
    padding: 0 1.4rem;
    border-radius: 1.1rem;
    font-size: 1.55rem;
    font-weight: 700;
    color: var(--text-2);
    outline: none;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .mi:focus {
    background: var(--text);
    color: var(--bg);
    transform: scale(1.02);
  }
  .mi.danger {
    color: var(--danger);
  }
  .mi.danger:focus {
    background: var(--danger);
    color: var(--bg);
  }
  .lbl {
    flex: 1;
    text-align: left;
  }
  .val {
    font-size: 1.3rem;
    color: var(--text-3);
  }
  .mi:focus .val {
    color: rgba(0, 0, 0, 0.6);
  }
  .hint {
    margin: 0;
    font-size: 1.2rem;
    color: var(--text-4);
  }
  .qr {
    width: 100%;
    aspect-ratio: 1;
    padding: 2rem;
    border-radius: 1rem;
    background: #fff;
  }
  .body {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-2);
    line-height: 1.4;
  }
  .center {
    text-align: center;
  }
  .confirm {
    margin: auto 0;
  }
  .confirm .body {
    margin-bottom: 2rem;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .q {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow: hidden;
  }
  .q li {
    display: flex;
    gap: 1rem;
    font-size: 1.4rem;
  }
  .n {
    width: 2rem;
    color: var(--text-3);
    font-weight: 800;
  }
  .t {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--text-2);
  }
  .t strong {
    color: var(--text);
  }
  .q .now {
    margin: 0 -1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
  }
  .now .n {
    color: var(--accent);
  }
  .t em {
    font-style: normal;
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .diag {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.4rem 1.5rem;
    margin: 0;
    font-size: 1.3rem;
  }
  .diag dt {
    color: var(--text-3);
  }
  .diag dd {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: 1.3rem;
  }
  .log {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 1rem;
    border-radius: 1rem;
    background: #000;
    color: var(--text-2);
    font-size: 1rem;
    line-height: 1.45;
    overflow: hidden;
    white-space: pre-wrap;
  }
  .row {
    display: flex;
    gap: 1rem;
  }
</style>
