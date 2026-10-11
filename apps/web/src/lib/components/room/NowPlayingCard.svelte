<script lang="ts">
  import { duration, singers, singsOn } from '$lib/format';
  import { useParty } from '$lib/party.svelte';
  import { thumbnail } from '$lib/youtube';
  import Icon from '../Icon.svelte';

  interface Props {
    compact?: boolean;
  }
  let { compact = false }: Props = $props();
  const party = useParty();

  const s = $derived(party.state);
  const item = $derived(s?.now_playing ?? null);
  const phase = $derived(s?.playback.phase ?? 'idle');
  const mine = $derived(!!item && singsOn(item, party.creds.participantId));
  const pos = $derived.by(() => {
    void party.ticker.now;
    return party.room.position();
  });
  const total = $derived(item?.duration_seconds ?? party.room.progress?.duration ?? 0);
  const pct = $derived(total ? Math.min(100, (pos / total) * 100) : 0);
  const live = $derived(phase === 'playing' && !s?.playback.paused);

  const label = $derived.by(() => {
    if (!item) return '';
    if (phase === 'error') return "Can't play this video";
    if (phase === 'intro') return mine ? "You're up — grab the mic!" : 'Up now';
    if (s?.playback.paused) return 'Paused';
    if (party.room.progress?.state === 'buffering') return 'Loading…';
    return mine ? "You're on stage" : 'Now singing';
  });
</script>

{#snippet eq()}
  <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
{/snippet}

{#if item && compact}
  <article class="mini" class:mine>
    <img class="mini-art" src={thumbnail(item.video_id, 'mq')} alt="" />
    <div class="mini-text">
      <p class="mini-title">{item.title}</p>
      <p class="mini-sub">
        {#if item.partner}<Icon name="duet" size={13} />{/if}
        <span>{singers(item, party.creds.participantId)}</span>
      </p>
    </div>
    <span class="mini-state">
      {#if phase === 'error'}<Icon name="alert" size={20} />
      {:else if live}{@render eq()}
      {:else if s?.playback.paused}<Icon name="pause" size={20} />
      {:else}<Icon name="mic" size={20} />{/if}
    </span>
    {#if phase === 'playing' && total}
      <span class="mini-bar"><span style:width="{pct}%"></span></span>
    {/if}
  </article>
{:else if item}
  <article class="np" class:mine class:error={phase === 'error'}>
    <div class="art">
      <img src={thumbnail(item.video_id, 'hq')} alt="" />
    </div>
    <p class="status">
      {#if live}{@render eq()}{:else if phase === 'error'}<Icon name="alert" size={14} />{/if}
      {label}
    </p>
    <h3 class="title">{item.title}</h3>
    <p class="singer">
      <Icon name={item.partner ? 'duet' : 'mic'} size={16} />
      <strong>{singers(item, party.creds.participantId)}</strong>
      {#if item.channel}<span>· {item.channel}</span>{/if}
    </p>
    {#if phase === 'playing' && total}
      <div class="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style:width="{pct}%"></span>
      </div>
      <p class="times"><span>{duration(pos) || '0:00'}</span><span>{duration(total)}</span></p>
    {/if}
  </article>
{:else if !compact}
  <article class="np empty">
    <span class="empty-icon"><Icon name="mic" size={26} /></span>
    <div>
      <p class="status">The stage is empty</p>
      <h3 class="title">
        {#if s?.session.status === 'lobby'}Waiting for the host to start{:else}Waiting for the next song{/if}
      </h3>
      <p class="hint">Add a song and it'll start right away.</p>
    </div>
  </article>
{/if}

<style>
  /* ---- Full card ---- */
  .np {
    padding: 16px;
    border-radius: var(--radius-lg);
    background: linear-gradient(180deg, rgba(169, 112, 255, 0.22), var(--surface) 75%);
  }
  .np.error {
    background: linear-gradient(180deg, rgba(243, 114, 127, 0.18), var(--surface) 75%);
  }
  .art {
    margin-bottom: 16px;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface-2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 4px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-2);
  }
  .mine .status {
    color: var(--accent);
  }
  .error .status {
    color: var(--danger);
  }
  .title {
    margin: 0 0 4px;
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .singer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--text-2);
    font-size: 0.92rem;
    min-width: 0;
  }
  .singer strong {
    color: var(--text);
    font-weight: 700;
    white-space: nowrap;
  }
  .singer span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    height: 4px;
    margin-top: 16px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.24);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--text);
    transition: width 1s linear;
  }
  .mine .bar span {
    background: var(--accent);
  }
  .times {
    display: flex;
    justify-content: space-between;
    margin: 6px 0 0;
    font-size: 0.74rem;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--surface);
  }
  .empty-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: var(--radius-sm);
    background: linear-gradient(135deg, var(--wash), var(--accent));
    color: var(--text);
  }
  .empty .title {
    font-size: 1.1rem;
  }
  .hint {
    margin: 0;
    font-size: 0.86rem;
    color: var(--text-2);
  }

  /* ---- Mini player ---- */
  .mini {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 8px 8px;
    border-radius: var(--radius-sm);
    background: #3a2160;
    overflow: hidden;
  }
  .mini-art {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-xs);
    object-fit: cover;
    background: var(--surface-2);
  }
  .mini-text {
    flex: 1;
    min-width: 0;
  }
  .mini-title,
  .mini-sub {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini-title {
    font-size: 0.88rem;
    font-weight: 700;
  }
  .mini-sub {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.72);
  }
  .mini-sub span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini-state {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    color: var(--accent);
  }
  .mini.mine .mini-sub {
    color: var(--accent-strong);
  }
  .mini-bar {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: rgba(255, 255, 255, 0.24);
    overflow: hidden;
  }
  .mini-bar span {
    display: block;
    height: 100%;
    background: var(--text);
    transition: width 1s linear;
  }

  /* ---- Equalizer ---- */
  .eq {
    display: inline-flex;
    gap: 2px;
    align-items: flex-end;
    height: 12px;
    color: var(--accent);
  }
  .mini .eq {
    height: 16px;
    gap: 3px;
  }
  .eq i {
    width: 3px;
    background: currentColor;
    border-radius: 1px;
    animation: eq 0.9s ease-in-out infinite;
  }
  .eq i:nth-child(2) {
    animation-delay: -0.3s;
  }
  .eq i:nth-child(3) {
    animation-delay: -0.6s;
  }
  @keyframes eq {
    0%,
    100% {
      height: 25%;
    }
    50% {
      height: 100%;
    }
  }
</style>
