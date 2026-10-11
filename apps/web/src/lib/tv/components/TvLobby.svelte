<script lang="ts">
  import Avatar from '$lib/components/Avatar.svelte';
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Qr from '$lib/components/Qr.svelte';
  import { duration, singers } from '$lib/format';
  import { thumbnail } from '$lib/youtube';
  import { useTv } from '../context';
  import { focusScope } from '../focus';

  const tv = useTv();
  const s = $derived(tv.room.state!);
  const lobby = $derived(s.session.status === 'lobby');
  const host = $derived(tv.joinBase.replace(/^https?:\/\//, ''));
  const code = $derived(s.session.join_code);
</script>

<section class="tv-screen lobby" use:focusScope>
  <div class="tv-glow"></div>

  <header class="top">
    <Brand size="2.75rem" />
    <div class="status">
      <span class="pill"><Icon name="users" size="1.625rem" /> {s.participants.length} {s.participants.length === 1 ? 'singer' : 'singers'}</span>
      {#if tv.playerKind === 'fake'}
        <span class="pill demo" title="The server uses fake search results; songs play in a demo player">Demo mode</span>
      {/if}
      {#if tv.room.status !== 'online'}
        <span class="pill warn"><Icon name="wifiOff" size="1.5rem" /> Reconnecting…</span>
      {/if}
    </div>
  </header>

  <div class="grid">
    <div class="left">
      <p class="tv-eyebrow">{lobby ? 'Welcome to' : 'The stage is open'}</p>
      <h1 class="tv-display title">{s.session.title}</h1>
      <p class="lede">
        {#if lobby}Scan to join and add your songs — no app needed.
        {:else}Add a song from your phone and it starts right away.{/if}
      </p>

      <div class="join">
        <div class="qr-card" class:locked={!s.session.queue_open}>
          <Qr value={tv.joinUrl} label="Scan to join the party" />
        </div>
        <div class="how">
          <p class="step"><span>1</span> Scan the code, or go to</p>
          <p class="url">{host}</p>
          <p class="step"><span>2</span> Enter room code</p>
          <p class="code tv-mono" aria-label="Room code {code.split('').join(' ')}">
            {#each code.split('') as ch, i (i)}<span>{ch}</span>{/each}
          </p>
        </div>
      </div>

      <div class="actions">
        {#if lobby}
          <button class="tv-btn gold" data-focus data-autofocus onclick={() => tv.command('start')}>
            <Icon name="play" size="1.875rem" fill /> Start the party
          </button>
        {/if}
        <button class="tv-btn" data-focus data-autofocus={lobby ? undefined : ""} onclick={() => tv.openMenu()}>
          <Icon name="sliders" size="1.75rem" /> Menu
        </button>
        {#if !s.session.queue_open}
          <span class="pill warn"><Icon name="lock" size="1.5rem" /> Requests paused</span>
        {/if}
      </div>
    </div>

    <aside class="right">
      <div class="panel">
        <p class="tv-eyebrow">Up next</p>
        {#if s.queue.length}
          <ol class="queue">
            {#each s.queue.slice(0, 5) as item, i (item.id)}
              <li style:animation-delay="{i * 60}ms">
                <img src={item.thumbnail_url || thumbnail(item.video_id, 'mq')} alt="" />
                <div>
                  <p class="q-title">{item.title}</p>
                  <p class="q-singer"><Icon name={item.partner ? 'duet' : 'mic'} size="1.25rem" /> {singers(item)}{#if item.duration_seconds}<span> · {duration(item.duration_seconds)}</span>{/if}</p>
                </div>
              </li>
            {/each}
          </ol>
          {#if s.queue.length > 5}<p class="more">+ {s.queue.length - 5} more</p>{/if}
        {:else}
          <div class="empty">
            <Icon name="music" size="3rem" />
            <p>No songs yet</p>
            <span>Be the first to pick one!</span>
          </div>
        {/if}
      </div>

      {#if s.participants.length}
        <div class="guests">
          {#each s.participants.slice(0, 12) as p (p.id)}
            <span class="guest"><Avatar id={p.id} name={p.display_name} size="3rem" /> {p.display_name}</span>
          {/each}
        </div>
      {/if}
    </aside>
  </div>
</section>

<style>
  .lobby {
    display: flex;
    flex-direction: column;
  }
  .top {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 1.6rem;
  }
  .status {
    display: flex;
    gap: 1rem;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    height: 3.25rem;
    padding: 0 1.4rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--text);
    font-size: 1.3rem;
    font-weight: 700;
  }
  .pill.warn {
    color: var(--warning);
  }
  .pill.demo {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .grid {
    position: relative;
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 38rem;
    gap: 5rem;
    margin-top: 3rem;
    min-height: 0;
  }
  .left {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .title {
    margin: 0.75rem 0 1rem;
    font-size: 7rem;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lede {
    margin: 0 0 2.75rem;
    font-size: 1.9rem;
    color: var(--text-2);
  }
  .join {
    display: flex;
    align-items: center;
    gap: 3.5rem;
  }
  .qr-card {
    flex: none;
    width: 21rem;
    height: 21rem;
    padding: 1.6rem;
    border-radius: 1rem;
    background: #fff;
    box-shadow: 0 2rem 5rem -1rem rgba(0, 0, 0, 0.7);
  }
  .qr-card.locked {
    opacity: 0.45;
  }
  .how p {
    margin: 0;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.6rem;
    color: var(--text-2);
  }
  .step span {
    display: inline-grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
    font-size: 1.3rem;
  }
  .url {
    margin: 0.6rem 0 2rem 3.6rem !important;
    font-size: 2.1rem;
    font-weight: 700;
    color: var(--accent);
  }
  .code {
    display: flex;
    gap: 0.6rem;
    margin: 0.9rem 0 0 3.6rem !important;
  }
  .code span {
    display: inline-grid;
    place-items: center;
    width: 4.6rem;
    height: 5.6rem;
    border-radius: 0.5rem;
    background: var(--surface-2);
    font-size: 3.4rem;
    font-weight: 800;
    color: var(--text);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-top: auto;
    padding-top: 2rem;
  }
  .right {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 0;
  }
  .panel {
    flex: 1;
    min-height: 0;
    padding: 2rem;
    border-radius: 0.75rem;
    background: rgba(18, 18, 18, 0.85);
    overflow: hidden;
  }
  .queue {
    list-style: none;
    margin: 1.25rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }
  .queue li {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    animation: fade-up var(--dur-slow) var(--ease) both;
  }
  .queue img {
    flex: none;
    width: 8.5rem;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 0.25rem;
    background: var(--surface-2);
  }
  .queue div {
    min-width: 0;
  }
  .q-title {
    margin: 0 0 0.3rem;
    font-size: 1.45rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .q-singer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-2);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
  }
  .q-singer :global(svg) {
    flex: none;
    color: var(--accent);
  }
  .q-singer span {
    color: var(--text-3);
  }
  .more {
    margin: 1rem 0 0;
    color: var(--text-3);
    font-size: 1.25rem;
  }
  .empty {
    height: 80%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    color: var(--text-3);
    text-align: center;
  }
  .empty p {
    margin: 0.6rem 0 0;
    font-size: 2rem;
    font-weight: 800;
    color: var(--text);
  }
  .empty span {
    font-size: 1.4rem;
  }
  .guests {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    max-height: 8.5rem;
    overflow: hidden;
  }
  .guest {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    height: 3.75rem;
    padding: 0 1.2rem 0 0.4rem;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 1.25rem;
    font-weight: 700;
  }
</style>
