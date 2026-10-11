<script lang="ts">
  import { onDestroy } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { useTv } from '../context';
  import { focusScope } from '../focus';

  const AUTO_NEW_PARTY_S = 60;
  const tv = useTv();
  const s = $derived(tv.room.state!);
  const sung = $derived(s.history.filter((i) => i.status === 'completed'));
  const top = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const i of sung) {
      for (const name of i.partner ? [i.singer, i.partner] : [i.singer]) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  });

  const startedAt = Date.now();
  const left = $derived(Math.max(0, AUTO_NEW_PARTY_S - Math.floor((tv.ticker.now - startedAt) / 1000)));
  let started = false;
  $effect(() => {
    if (left === 0 && !started) {
      started = true;
      void tv.openSession(true);
    }
  });
  onDestroy(() => (started = true));
</script>

<section class="tv-screen ended" use:focusScope>
  <div class="tv-glow"></div>
  <div class="box">
    <p class="tv-eyebrow">That's a wrap</p>
    <h1 class="tv-display">Thanks for singing!</h1>
    <div class="stats">
      <div><strong>{sung.length}</strong><span>songs sung</span></div>
      <div><strong>{new Set(sung.flatMap((i) => [i.participant_id, i.partner_id ?? i.partner].filter(Boolean))).size}</strong><span>singers</span></div>
    </div>
    {#if top.length}
      <p class="top">
        <Icon name="crown" size="1.875rem" />
        {#each top as [name, n], i (name)}
          <span>{name} <em>{n}</em></span>{#if i < top.length - 1}<span class="dot">·</span>{/if}
        {/each}
      </p>
    {/if}
    <button class="tv-btn gold" data-focus data-autofocus onclick={() => tv.openSession(true)}>
      <Icon name="sparkle" size="1.75rem" /> Start a new party
    </button>
    <p class="auto">A new party opens automatically in {left}s</p>
  </div>
</section>

<style>
  .ended {
    display: grid;
    place-items: center;
  }
  .box {
    position: relative;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  h1 {
    margin: 1rem 0 3rem;
    font-size: 7.5rem;
    color: var(--text);
  }
  .stats {
    display: flex;
    gap: 5rem;
    margin-bottom: 2.5rem;
  }
  .stats div {
    display: flex;
    flex-direction: column;
  }
  .stats strong {
    font-size: 5rem;
    font-weight: 800;
    line-height: 1;
  }
  .stats span {
    font-size: 1.5rem;
    color: var(--text-3);
    margin-top: 0.5rem;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0 0 3rem;
    font-size: 1.9rem;
    color: var(--accent);
  }
  .top span {
    color: var(--text);
    font-weight: 700;
  }
  .top em {
    font-style: normal;
    color: var(--text-3);
    margin-left: 0.3rem;
  }
  .top .dot {
    color: var(--text-3);
  }
  .auto {
    margin: 2rem 0 0;
    font-size: 1.4rem;
    color: var(--text-3);
  }
</style>
