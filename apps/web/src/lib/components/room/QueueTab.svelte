<script lang="ts">
  import { singers, singsOn, waitTimes } from '$lib/format';
  import { useParty } from '$lib/party.svelte';
  import type { QueueItem } from '$lib/types';
  import Icon from '../Icon.svelte';
  import Sheet from '../Sheet.svelte';
  import DuetSheet from './DuetSheet.svelte';
  import NowPlayingCard from './NowPlayingCard.svelte';
  import QueueRow from './QueueRow.svelte';

  const party = useParty();
  const s = $derived(party.state);
  const waits = $derived.by(() => {
    void party.ticker.now;
    return s ? waitTimes(s, party.room.position()) : new Map<string, number>();
  });

  let actionFor = $state<{ item: QueueItem; index: number } | null>(null);
  let confirmCancel = $state<QueueItem | null>(null);
  let duetFor = $state<QueueItem | null>(null);
  let showHistory = $state(false);

  // Start the action before closing the sheet: `{@const}` aliases of `actionFor` go null with it.
  async function act(fn: () => Promise<unknown>) {
    const pending = fn();
    actionFor = null;
    await pending;
  }
</script>

<section class="queue">
  <NowPlayingCard />

  {#if s && !s.session.queue_open}
    <p class="locked"><Icon name="lock" size={16} /> The host has paused new requests.</p>
  {/if}

  <div class="head">
    <h2>Up next</h2>
    <span class="faint">{s?.queue.length ?? 0} {s?.queue.length === 1 ? 'song' : 'songs'}</span>
  </div>

  {#if s?.queue.length}
    <ol class="list">
      {#each s.queue as item, i (item.id)}
        {@const owner = item.participant_id === party.creds.participantId}
        <QueueRow {item} index={i + 1} mine={singsOn(item, party.creds.participantId)} wait={waits.get(item.id) ?? null}>
          {#snippet actions()}
            {#if party.isHost}
              <button class="icon-btn" aria-label="Song options" onclick={() => (actionFor = { item, index: i })}>
                <Icon name="more" size={22} />
              </button>
            {:else if owner}
              <button class="icon-btn" class:on={!!item.partner} aria-label="Duet partner" onclick={() => (duetFor = item)}>
                <Icon name="duet" size={20} />
              </button>
              <button class="icon-btn" aria-label="Cancel my song" onclick={() => (confirmCancel = item)}>
                <Icon name="x" size={20} />
              </button>
            {/if}
          {/snippet}
        </QueueRow>
      {/each}
    </ol>
  {:else}
    <div class="empty card">
      <Icon name="music" size={26} />
      <p><strong>No songs waiting.</strong></p>
      <p class="faint">{s?.now_playing ? 'Pick the next song.' : 'Be the first to pick one.'}</p>
      <button class="btn btn-primary" onclick={() => (party.tab = 'search')}>
        <Icon name="search" size={18} /> Find a song
      </button>
    </div>
  {/if}

  {#if s?.history.length}
    <button class="history-toggle" onclick={() => (showHistory = !showHistory)} aria-expanded={showHistory}>
      <Icon name="history" size={18} /> Recently sung ({s.history.length})
      <Icon name={showHistory ? 'up' : 'down'} size={18} />
    </button>
    {#if showHistory}
      <ul class="list">
        {#each s.history.slice(0, 25) as item (item.id)}
          <QueueRow {item} mine={singsOn(item, party.creds.participantId)} showStatus />
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<Sheet open={!!actionFor} onclose={() => (actionFor = null)} title={actionFor?.item.title ?? ''}>
  {#if actionFor}
    {@const { item, index } = actionFor}
    <p class="sheet-sub faint">{singers(item)} · #{index + 1} in line</p>
    <div class="actions">
      <button class="btn btn-block" onclick={() => { actionFor = null; duetFor = item; }}>
        <Icon name="duet" size={18} /> {item.partner ? 'Change duet partner' : 'Make it a duet'}
      </button>
      {#if index > 0}
        <button class="btn btn-block" onclick={() => act(() => party.move(item.id, 0))}>
          <Icon name="sparkle" size={18} /> Play next
        </button>
        <button class="btn btn-block" onclick={() => act(() => party.move(item.id, index - 1))}>
          <Icon name="up" size={18} /> Move up
        </button>
      {/if}
      {#if s && index < s.queue.length - 1}
        <button class="btn btn-block" onclick={() => act(() => party.move(item.id, index + 1))}>
          <Icon name="down" size={18} /> Move down
        </button>
      {/if}
      <button class="btn btn-danger btn-block" onclick={() => act(() => party.cancel(item.id))}>
        <Icon name="trash" size={18} /> Remove from queue
      </button>
    </div>
  {/if}
</Sheet>

<Sheet open={!!confirmCancel} onclose={() => (confirmCancel = null)} title="Cancel this song?">
  {#if confirmCancel}
    {@const item = confirmCancel}
    <p class="sheet-sub muted">“{item.title}” will be removed from the queue.</p>
    <div class="actions">
      <button class="btn btn-danger btn-block btn-lg" onclick={() => { const id = item.id; confirmCancel = null; party.cancel(id); }}>
        Cancel song
      </button>
      <button class="btn btn-ghost btn-block" onclick={() => (confirmCancel = null)}>Keep it</button>
    </div>
  {/if}
</Sheet>

<DuetSheet item={duetFor} onclose={() => (duetFor = null)} />

<style>
  .queue {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .locked {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 10px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--warning);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 6px;
  }
  h2 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .icon-btn.on {
    color: var(--accent);
  }
  .list {
    list-style: none;
    margin: 0 -8px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 28px 20px;
    text-align: center;
    color: var(--text-2);
  }
  .empty p {
    margin: 0;
  }
  .empty .btn {
    margin-top: 14px;
  }
  .history-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 10px 0;
    color: var(--text-2);
    font-weight: 700;
  }
  .sheet-sub {
    margin: -6px 0 16px;
  }
  .actions {
    display: grid;
    gap: 10px;
  }
  .actions .btn {
    justify-content: flex-start;
    border-radius: var(--radius-sm);
  }
  .actions .btn:hover {
    transform: none;
    background: var(--surface-3);
  }
</style>
