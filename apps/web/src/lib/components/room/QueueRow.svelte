<script lang="ts">
  import type { Snippet } from 'svelte';
  import { duration, minutes, singers, statusLabel } from '$lib/format';
  import { useParty } from '$lib/party.svelte';
  import type { QueueItem } from '$lib/types';
  import Icon from '../Icon.svelte';
  import Thumb from '../Thumb.svelte';

  interface Props {
    item: QueueItem;
    index?: number | null;
    /** The viewer sings on this song (requested it, or is the duet partner). */
    mine?: boolean;
    wait?: number | null;
    showStatus?: boolean;
    actions?: Snippet;
  }
  let { item, index = null, mine = false, wait = null, showStatus = false, actions }: Props =
    $props();
  const party = useParty();
</script>

<li class="row" class:mine>
  {#if index !== null}<span class="idx" class:next={index === 1}>{index}</span>{/if}
  <Thumb videoId={item.video_id} src={item.thumbnail_url} width="52px" square radius="var(--radius-xs)" />
  <div class="meta">
    <p class="title">{item.title}</p>
    <p class="sub">
      {#if item.partner}<span class="duet" title="Duet"><Icon name="duet" size={13} stroke={2.2} /></span>{/if}
      <span class="singer">{singers(item, party.creds.participantId)}</span>
      {#if showStatus}
        <span class="status s-{item.status}">· {statusLabel(item)}</span>
      {:else if wait !== null}
        <span>· {index === 1 ? 'next' : `~${minutes(wait)}`}</span>
      {:else if item.duration_seconds}
        <span>· {duration(item.duration_seconds)}</span>
      {/if}
    </p>
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</li>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 4px 8px 8px;
    border-radius: var(--radius-sm);
    animation: fade-up var(--dur) var(--ease) both;
    transition: background var(--dur-fast) var(--ease);
  }
  @media (hover: hover) {
    .row:hover {
      background: var(--surface-2);
    }
  }
  .idx {
    flex: none;
    width: 20px;
    text-align: center;
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .idx.next {
    color: var(--accent);
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .title {
    margin: 0 0 2px;
    font-weight: 600;
    font-size: 1rem;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mine .title {
    color: var(--accent);
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    font-size: 0.86rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
  }
  .sub > span:not(.duet) {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .singer {
    flex: 0 1 auto;
  }
  .sub > span:last-child:not(.singer) {
    flex: none;
  }
  .duet {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-xs);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .s-failed {
    color: var(--danger);
  }
  .s-skipped {
    color: var(--text-3);
  }
  .actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }
</style>
