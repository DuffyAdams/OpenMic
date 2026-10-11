<script lang="ts">
  import { minutes, singsOn, waitTimes } from '$lib/format';
  import { useParty } from '$lib/party.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import type { QueueItem } from '$lib/types';
  import DuetSheet from './DuetSheet.svelte';
  import QueueRow from './QueueRow.svelte';

  const party = useParty();
  const me = party.creds.participantId;
  const s = $derived(party.state);

  const onStage = $derived(s?.now_playing && singsOn(s.now_playing, me) ? s.now_playing : null);
  const upcoming = $derived(
    (s?.queue ?? []).map((item, i) => ({ item, position: i + 1 })).filter((x) => singsOn(x.item, me))
  );
  const sung = $derived((s?.history ?? []).filter((i) => singsOn(i, me)));
  let duetFor = $state<QueueItem | null>(null);
  const waits = $derived.by(() => {
    void party.ticker.now;
    return s ? waitTimes(s, party.room.position()) : new Map<string, number>();
  });
  const nextWait = $derived(upcoming.length ? (waits.get(upcoming[0].item.id) ?? 0) : 0);
</script>

<section class="mine">
  <header class="me">
    <Avatar id={me} name={party.creds.displayName} size="96px" />
    <div>
      <p class="kicker">{party.isHost ? 'Host' : 'Singer'}</p>
      <h2>{party.me?.display_name ?? party.creds.displayName}</h2>
      <p class="stats">
        {#if party.isHost}<span class="chip chip-gold"><Icon name="crown" size={13} /> Host</span>{/if}
        {sung.filter((i) => i.status === 'completed').length} sung · {upcoming.length} waiting
      </p>
    </div>
  </header>

  {#if onStage}
    <div class="spot card gold">
      <p class="eyebrow">You're on stage</p>
      <h3>{onStage.title}</h3>
      <p class="muted">
        {#if onStage.partner}
          Duet with {onStage.participant_id === me ? onStage.partner : onStage.singer} — grab both mics!
        {:else}
          Grab the mic and look at the TV — lyrics are on screen.
        {/if}
      </p>
    </div>
  {:else if upcoming.length}
    <div class="spot card" class:gold={upcoming[0].position === 1}>
      <p class="eyebrow">{upcoming[0].position === 1 ? "You're next!" : 'Your next turn'}</p>
      <h3>
        {#if upcoming[0].position === 1}Get ready to sing{:else}#{upcoming[0].position} in line{/if}
      </h3>
      <p class="muted">
        <Icon name="clock" size={15} />
        {nextWait < 45 ? 'Any moment now' : `In about ${minutes(nextWait)}`}
      </p>
    </div>
  {/if}

  <div class="head"><h2>Waiting</h2></div>
  {#if upcoming.length}
    <ol class="list">
      {#each upcoming as { item, position } (item.id)}
        <QueueRow {item} index={position} mine wait={waits.get(item.id) ?? null}>
          {#snippet actions()}
            {#if item.participant_id === me}
              <button
                class="icon-btn"
                class:on={!!item.partner}
                aria-label={item.partner ? 'Change duet partner' : 'Make it a duet'}
                onclick={() => (duetFor = item)}
              >
                <Icon name="duet" size={20} />
              </button>
              <button class="icon-btn" aria-label="Cancel" onclick={() => party.cancel(item.id)}>
                <Icon name="x" size={20} />
              </button>
            {:else}
              <button class="btn btn-sm btn-ghost" onclick={() => party.setPartner(item.id, {})}>Leave duet</button>
            {/if}
          {/snippet}
        </QueueRow>
      {/each}
    </ol>
  {:else}
    <div class="empty card">
      <p>You have no songs waiting.</p>
      <button class="btn btn-primary" onclick={() => (party.tab = 'search')}>
        <Icon name="search" size={18} /> Pick a song
      </button>
    </div>
  {/if}

  {#if sung.length}
    <div class="head"><h2>Your history</h2></div>
    <ul class="list">
      {#each sung as item (item.id)}
        <QueueRow {item} mine showStatus>
          {#snippet actions()}
            {#if item.status === 'failed'}
              <button class="btn btn-sm" onclick={() => party.findAnotherVersion(item.title)}>Find another</button>
            {:else if item.participant_id === me}
              <button class="btn btn-sm btn-ghost" onclick={() => party.requeue(item.id)}>Again</button>
            {/if}
          {/snippet}
        </QueueRow>
      {/each}
    </ul>
  {/if}
</section>

<DuetSheet item={duetFor} onclose={() => (duetFor = null)} />

<style>
  .mine {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .me {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin: 4px 0 8px;
  }
  .me :global(.avatar) {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .kicker {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .me h2 {
    margin: 0 0 6px;
    font-size: 2.2rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
    word-break: break-word;
  }
  .stats {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.86rem;
    color: var(--text-2);
  }
  .spot {
    padding: 18px;
  }
  .spot.gold {
    background: linear-gradient(135deg, #5b2fa8, #2c1850 70%);
  }
  .icon-btn.on {
    color: var(--accent);
  }
  .spot .eyebrow {
    margin: 0 0 6px;
    color: var(--accent);
  }
  .spot.gold .eyebrow {
    color: var(--accent-strong);
  }
  .spot.gold .muted {
    color: rgba(255, 255, 255, 0.8);
  }
  .spot h3 {
    margin: 0 0 6px;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.6rem;
    letter-spacing: -0.03em;
    line-height: 1.15;
  }
  .spot p:last-child {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .head h2 {
    margin: 8px 0 0;
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.02em;
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
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 22px;
    color: var(--text-2);
  }
  .empty p {
    margin: 0;
  }
</style>
