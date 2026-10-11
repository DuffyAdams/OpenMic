<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { singers } from '$lib/format';
  import { useTv } from '../context';
  import { focusScope } from '../focus';

  /** The strip under the video: banners, playback controls, prompts. Never overlaps the player. */
  const tv = useTv();
  const s = $derived(tv.room.state);
  const item = $derived(s?.now_playing ?? null);
  const offline = $derived(tv.room.status === 'reconnecting');
  // Routine banners wait while paused; urgent ones (up next, errors) still show.
  const banner = $derived(
    tv.banner && (tv.banner.kind !== 'info' || !s?.playback.paused) ? tv.banner : null
  );
</script>

<div class="band" class:gold={banner?.kind === 'gold'} class:error={banner?.kind === 'error' || offline}>
  {#if tv.controls}
    <div class="controls" use:focusScope>
      <div class="now">
        {#if item}
          <strong>{singers(item)}</strong>
          <span>{item.title}</span>
        {/if}
      </div>
      <button class="tv-btn" data-focus onclick={() => tv.command('restart')}>
        <Icon name="restart" size="1.75rem" /> Restart
      </button>
      <button class="tv-btn primary" data-focus data-autofocus onclick={() => tv.togglePause()}>
        <Icon name={s?.playback.paused ? 'play' : 'pause'} size="1.75rem" fill={s?.playback.paused} stroke={s?.playback.paused ? 1.9 : 3} />
        {s?.playback.paused ? 'Resume' : 'Pause'}
      </button>
      <button class="tv-btn" data-focus onclick={() => tv.askSkip()}>
        <Icon name="skip" size="1.75rem" /> Skip
      </button>
      <button class="tv-btn" data-focus onclick={() => tv.openMenu()}>
        <Icon name="sliders" size="1.75rem" /> Menu
      </button>
    </div>
  {:else if tv.needsGesture}
    <div class="msg">
      <span class="ico"><Icon name="play" size="1.875rem" fill /></span>
      <div><strong>Press OK to start the song</strong><span>This browser needs a button press before it can play sound.</span></div>
    </div>
  {:else if offline}
    <div class="msg">
      <span class="ico"><Icon name="wifiOff" size="1.875rem" /></span>
      <div><strong>Reconnecting to the party server…</strong><span>The song keeps playing. The queue will catch up.</span></div>
    </div>
  {:else if banner}
    {#key banner.id}
      <div class="msg banner">
        <span class="ico">
          <Icon name={banner.kind === 'gold' ? 'mic' : banner.kind === 'error' ? 'alert' : 'plus'} size="1.875rem" />
        </span>
        <div><strong>{banner.title}</strong>{#if banner.body}<span>{banner.body}</span>{/if}</div>
      </div>
    {/key}
  {:else if s?.playback.paused}
    <div class="msg">
      <span class="ico"><Icon name="pause" size="1.875rem" stroke={3} /></span>
      <div><strong>Paused</strong><span>Press OK to show controls</span></div>
    </div>
  {/if}
</div>

<style>
  .band {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    height: var(--band-h);
    display: flex;
    align-items: center;
    padding: 0 var(--safe-x);
    background: #000;
    border-top: 0.25rem solid transparent;
    transition: background var(--dur-slow) var(--ease);
  }
  .band.gold {
    background: linear-gradient(90deg, #3d1f6e, #000 70%);
    border-top-color: var(--accent);
  }
  .band.error {
    border-top-color: var(--danger);
  }
  .msg {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    min-width: 0;
  }
  .banner {
    animation: band-in 380ms var(--ease) both;
  }
  @keyframes band-in {
    from {
      opacity: 0;
      transform: translateY(1rem);
    }
  }
  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .gold .ico {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .error .ico {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .msg div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .msg strong {
    font-size: 1.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gold .msg strong {
    color: var(--text);
  }
  .msg span {
    font-size: 1.45rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .controls {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }
  .controls .tv-btn {
    height: 4.25rem;
    padding: 0 1.75rem;
    font-size: 1.45rem;
  }
  .now {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .now strong {
    color: var(--accent);
    font-size: 1.5rem;
  }
  .now span {
    font-size: 1.35rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
