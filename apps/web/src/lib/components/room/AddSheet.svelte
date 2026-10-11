<script lang="ts">
  import { ApiError } from '$lib/api';
  import { duration, minutes, waitTimes } from '$lib/format';
  import { useParty } from '$lib/party.svelte';
  import { haptic, toasts } from '$lib/toast.svelte';
  import type { DuetPartner, Video } from '$lib/types';
  import { thumbnail } from '$lib/youtube';
  import Icon from '../Icon.svelte';
  import Sheet from '../Sheet.svelte';
  import DuetPicker from './DuetPicker.svelte';

  interface Props {
    video: Video | null;
    onclose: () => void;
    onadded?: () => void;
  }
  let { video, onclose, onadded }: Props = $props();
  const party = useParty();

  let busy = $state(false);
  let error = $state('');
  let duet = $state<DuetPartner>({});

  const s = $derived(party.state);
  const queuedBy = $derived(video ? party.queuedVideos.get(video.video_id) : undefined);
  const position = $derived(s ? (s.now_playing || s.session.status !== 'active' ? s.queue.length + 1 : 0) : 1);
  const eta = $derived.by(() => {
    if (!s || position === 0) return 0;
    const waits = waitTimes(s, party.room.position());
    const last = s.queue.at(-1);
    const base = last ? (waits.get(last.id) ?? 0) + (last.duration_seconds ?? 225) : 0;
    return base + (s.session.intro_seconds ?? 8);
  });

  const locked = $derived(!!s && !s.session.queue_open && !party.isHost);

  $effect(() => {
    if (video) {
      error = '';
      duet = {};
    }
  });

  async function add() {
    if (!video) return;
    busy = true;
    error = '';
    try {
      const res = await party.enqueue(video, duet);
      haptic([10, 40, 10]);
      const partner = res.item.partner;
      toasts.show({
        kind: 'success',
        title: res.duplicate
          ? 'Already added'
          : partner
            ? `Duet with ${partner} added!`
            : 'Added to the queue!',
        body:
          res.position === 0
            ? "You're up now — grab the mic!"
            : res.position === 1
              ? "You're next in line."
              : `You're #${res.position} in line.`,
        action: { label: 'View', run: () => (party.tab = 'mine') }
      });
      onadded?.();
      onclose();
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Could not add that song. Try again.';
    } finally {
      busy = false;
    }
  }
</script>

<Sheet open={!!video} {onclose} title="">
  {#if video}
    <div class="hero">
      <img src={video.thumbnail_url || thumbnail(video.video_id, 'hq')} alt="" />
    </div>
    <h2 class="title">{video.title}</h2>
    <p class="meta muted">
      {video.channel}{#if video.duration_seconds}&nbsp;· {duration(video.duration_seconds)}{/if}
    </p>
    {#if video.labels.length}
      <div class="labels">
        {#each video.labels as label (label)}
          <span class="chip {label.startsWith('Karaoke') ? 'chip-gold' : 'chip-accent'}">{label}</span>
        {/each}
      </div>
    {/if}

    {#if !video.is_karaoke}
      <p class="note warn">
        <Icon name="alert" size={18} />
        This doesn't look like a karaoke version — it may include the original vocals.
      </p>
    {/if}
    {#if queuedBy}
      <p class="note">
        <Icon name="queue" size={18} />
        {queuedBy === party.creds.displayName ? 'You already queued' : `${queuedBy} already queued`} this
        song. You can still add it.
      </p>
    {/if}

    {#if !locked}
      {#key video.video_id}
        <DuetPicker bind:value={duet} ownerId={party.creds.participantId} />
      {/key}
    {/if}

    <div class="eta">
      {#if locked}
        <span class="danger">The host has paused new requests.</span>
      {:else if position === 0}
        <span>It'll start <strong>right away</strong>.</span>
      {:else}
        <span>You'll be <strong>#{position}</strong> in line{#if eta > 60}&nbsp;· about {minutes(eta)}{/if}.</span>
      {/if}
    </div>

    <button class="btn btn-primary btn-lg btn-block" onclick={add} disabled={busy || locked}>
      {#if busy}Adding…{:else}<Icon name="plus" size={20} /> Add to queue{/if}
    </button>
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <button class="btn btn-ghost btn-block cancel" onclick={onclose}>Cancel</button>
  {/if}
</Sheet>

<style>
  .hero {
    margin: 0 -4px 14px;
    border-radius: var(--radius);
    overflow: hidden;
    aspect-ratio: 16 / 9;
    background: var(--surface);
  }
  .hero img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .title {
    margin: 0 0 6px;
    font-size: 1.2rem;
    font-weight: 800;
    line-height: 1.3;
  }
  .meta {
    margin: 0 0 12px;
    font-size: 0.92rem;
  }
  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }
  .note {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin: 0 0 12px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text-2);
    font-size: 0.9rem;
  }
  .note :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .note.warn {
    color: var(--warning);
    background: rgba(240, 201, 135, 0.08);
  }
  .eta {
    margin: 4px 0 16px;
    color: var(--text-2);
  }
  .eta strong {
    color: var(--text);
  }
  .danger {
    color: var(--danger);
  }
  .cancel {
    margin-top: 10px;
  }
</style>
