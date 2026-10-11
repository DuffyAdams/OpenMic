<script lang="ts">
  import { singsOn } from '$lib/format';
  import { PartyClient, setParty, type Tab } from '$lib/party.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon, { type IconName } from '../Icon.svelte';
  import Toasts from '../Toasts.svelte';
  import HostTab from './HostTab.svelte';
  import MineTab from './MineTab.svelte';
  import NowPlayingCard from './NowPlayingCard.svelte';
  import QueueTab from './QueueTab.svelte';
  import SearchTab from './SearchTab.svelte';

  interface Props {
    party: PartyClient;
  }
  let { party }: Props = $props();
  // svelte-ignore state_referenced_locally
  setParty(party);

  const s = $derived(party.state!);

  const tabs = $derived.by(() => {
    const mine = s.queue.filter((i) => singsOn(i, party.creds.participantId)).length;
    const list: { id: Tab; label: string; icon: IconName; badge?: number }[] = [
      { id: 'search', label: 'Search', icon: 'search' },
      { id: 'queue', label: 'Queue', icon: 'queue', badge: s.queue.length || undefined },
      { id: 'mine', label: 'My songs', icon: 'mic', badge: mine || undefined }
    ];
    if (party.isHost) list.push({ id: 'host', label: 'Host', icon: 'sliders' });
    return list;
  });

  // The header turns solid once content scrolls under it.
  let scrolled = $state(false);

  // Hosts land on their controls the first time they become a host.
  let sawHost = false;
  $effect(() => {
    if (party.isHost && !sawHost) {
      sawHost = true;
      if (s.session.status === 'lobby') party.tab = 'host';
    }
  });
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 8)} />

<div class="room">
  <div class="wash" aria-hidden="true"></div>
  <header class="top" class:scrolled>
    <div class="title">
      <h1>{s.session.title}</h1>
      <p>
        <span class="code">{s.session.join_code}</span>
        {#if party.room.status === 'reconnecting'}
          <span class="conn"><Icon name="wifiOff" size={14} /> Reconnecting…</span>
        {:else if !s.tv_online}
          <span class="conn faint"><Icon name="tv" size={14} /> TV offline</span>
        {/if}
      </p>
    </div>
    <button class="me" onclick={() => (party.tab = 'mine')} aria-label="My songs">
      <Avatar id={party.creds.participantId} name={party.me?.display_name ?? party.creds.displayName} size="38px" />
    </button>
  </header>

  <main class="content">
    {#if party.tab === 'search'}
      <SearchTab />
    {:else if party.tab === 'queue'}
      <QueueTab />
    {:else if party.tab === 'mine'}
      <MineTab />
    {:else if party.tab === 'host' && party.isHost}
      <HostTab />
    {:else}
      <SearchTab />
    {/if}
  </main>

  {#if s.now_playing && party.tab !== 'queue' && party.tab !== 'host'}
    <button class="mini" onclick={() => (party.tab = 'queue')} aria-label="Open queue">
      <NowPlayingCard compact />
    </button>
  {/if}

  <nav class="tabs" aria-label="Sections">
    {#each tabs as t (t.id)}
      <button
        class="tab"
        class:active={party.tab === t.id}
        aria-current={party.tab === t.id ? 'page' : undefined}
        onclick={() => (party.tab = t.id)}
      >
        <span class="ico">
          <Icon name={t.icon} size={24} stroke={party.tab === t.id ? 2.4 : 1.9} />
          {#if t.badge}<span class="badge">{t.badge}</span>{/if}
        </span>
        <span class="lbl">{t.label}</span>
      </button>
    {/each}
  </nav>
</div>
<Toasts bottom="calc(84px + env(safe-area-inset-bottom))" />

<style>
  .room {
    position: relative;
    isolation: isolate; /* keeps the header wash above the page background */
    width: min(560px, 100%);
    margin: 0 auto;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .wash {
    position: absolute;
    inset: 0 0 auto;
    height: 340px;
    z-index: -1;
    pointer-events: none;
    background: linear-gradient(180deg, var(--wash) 0%, var(--wash-2) 45%, var(--bg) 100%);
  }
  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: calc(14px + env(safe-area-inset-top)) 16px 12px;
    background: transparent;
    transition: background var(--dur) var(--ease);
  }
  .top.scrolled {
    background: var(--wash-2);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  .title h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: -0.03em;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title p {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 2px 0 0;
    font-size: 0.8rem;
  }
  .code {
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--text-2);
  }
  .conn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--warning);
    font-weight: 700;
  }
  .me {
    border-radius: 50%;
  }
  .content {
    flex: 1;
    padding: 6px 16px calc(170px + env(safe-area-inset-bottom));
  }
  .mini {
    position: fixed;
    left: 50%;
    bottom: calc(68px + env(safe-area-inset-bottom));
    z-index: 25;
    transform: translateX(-50%);
    width: min(544px, calc(100% - 16px));
    text-align: left;
    box-shadow: var(--shadow-2);
    border-radius: var(--radius-sm);
  }
  .tabs {
    position: fixed;
    left: 50%;
    bottom: 0;
    z-index: 30;
    transform: translateX(-50%);
    width: min(560px, 100%);
    display: flex;
    padding: 18px 8px calc(6px + env(safe-area-inset-bottom));
    background: linear-gradient(to top, #000 0%, rgba(0, 0, 0, 0.92) 55%, transparent);
  }
  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 4px 0;
    color: var(--text-2);
    font-size: 0.7rem;
    font-weight: 600;
    transition: color var(--dur-fast) var(--ease);
  }
  .tab.active {
    color: var(--text);
    font-weight: 700;
  }
  .ico {
    position: relative;
    display: grid;
    place-items: center;
    width: 52px;
    height: 28px;
    transition: transform var(--dur-fast) var(--ease);
  }
  .tab:active .ico {
    transform: scale(0.9);
  }
  .badge {
    position: absolute;
    top: -2px;
    right: 4px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 18px;
  }
</style>
