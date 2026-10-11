<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { singers } from '$lib/format';
  import { thumbnail } from '$lib/youtube';
  import { useTv } from '../context';
  import { focusScope } from '../focus';

  const tv = useTv();
  const s = $derived(tv.room.state!);
  const item = $derived(s.now_playing!);
  const next = $derived(s.queue[0] ?? null);
  const total = $derived((s.session.intro_seconds || 1) * 1000);
  const left = $derived.by(() => {
    if (tv.introHeldLeft !== null) return tv.introHeldLeft;
    return Math.max(0, tv.introEndsAt - tv.ticker.now);
  });
  const secs = $derived(Math.ceil(left / 1000));
  const progress = $derived(1 - left / total);
  let bgFailed = $state(false);
  // Demo/mock items carry an inline placeholder image instead of a YouTube thumbnail.
  const inlineArt = $derived(item.thumbnail_url.startsWith('data:') ? item.thumbnail_url : '');
  const art = $derived(inlineArt || (bgFailed ? thumbnail(item.video_id, 'hq') : thumbnail(item.video_id, 'maxres')));
  const names = $derived(singers(item));
  // Long names (especially duets) step down so they stay on one line.
  const nameSize = $derived(names.length > 22 ? '5rem' : names.length > 14 ? '6.5rem' : '8.5rem');
</script>

<section class="tv-screen intro" class:duet={!!item.partner} use:focusScope>
  <div class="bg" style:background-image="url(&quot;{art}&quot;)"></div>
  <img class="probe" src={thumbnail(item.video_id, 'maxres')} alt="" onerror={() => (bgFailed = true)} onload={(e) => { if ((e.currentTarget as HTMLImageElement).naturalWidth < 200) bgFailed = true; }} />
  <div class="shade"></div>

  <div class="content">
    <header class="hero">
      <div class="art" style:background-image="url(&quot;{art}&quot;)"></div>
      <div class="text">
        <p class="kicker">
          {#if item.partner}<span class="duet-tag"><Icon name="duet" size="1.4rem" stroke={2.4} /> Duet</span>{/if}
          Up next
        </p>
        <h1 class="singer" style:font-size={nameSize}>{names}</h1>
        <p class="song">{item.title}</p>
        {#if item.channel}<p class="channel">{item.channel} · on YouTube</p>{/if}
      </div>
    </header>

    <div class="count">
      <svg viewBox="0 0 100 100" class="ring" aria-hidden="true">
        <circle cx="50" cy="50" r="45" class="track" />
        <circle cx="50" cy="50" r="45" class="fill" style:stroke-dashoffset={283 * (1 - progress)} />
      </svg>
      <span class="num">{tv.introHeldLeft !== null ? '❚❚' : secs}</span>
      <span class="label">
        {tv.introHeldLeft !== null ? 'Paused by the host' : item.partner ? 'Grab both mics!' : 'Grab the mic!'}
      </span>
    </div>
  </div>

  {#if next}
    <footer class="then">
      <span class="tv-eyebrow">Then</span>
      <Icon name={next.partner ? 'duet' : 'mic'} size="1.5rem" />
      <strong>{singers(next)}</strong>
      <span class="faint">— {next.title}</span>
    </footer>
  {/if}
</section>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--bg);
  }
  .bg {
    position: absolute;
    inset: -4%;
    background-size: cover;
    background-position: center;
    filter: blur(3rem) saturate(1.3);
    opacity: 0.5;
    transform: scale(1.08);
    animation: drift 14s ease-in-out infinite alternate;
  }
  @keyframes drift {
    to {
      transform: scale(1.14) translateX(-1.5%);
    }
  }
  .probe {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(61, 31, 110, 0.82) 0%, rgba(36, 18, 74, 0.86) 40%, rgba(18, 18, 18, 0.97) 85%);
  }
  .content {
    position: relative;
    animation: rise 700ms var(--ease) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(2rem);
    }
  }
  .hero {
    display: flex;
    align-items: flex-end;
    gap: 3rem;
  }
  .art {
    flex: none;
    width: 34rem;
    aspect-ratio: 16 / 9;
    border-radius: 0.5rem;
    background-size: cover;
    background-position: center;
    background-color: var(--surface-2);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.6);
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .kicker {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
  }
  .duet-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.5rem;
    padding: 0 1rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 1.25rem;
    font-weight: 800;
  }
  .singer {
    margin: 0.5rem 0 1rem;
    font-weight: 900;
    letter-spacing: -0.045em;
    line-height: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .song {
    margin: 0;
    font-size: 2.6rem;
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .channel {
    margin: 0.75rem 0 0;
    font-size: 1.5rem;
    color: var(--text-2);
  }
  .count {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-top: 4.5rem;
  }
  .ring {
    width: 7.5rem;
    height: 7.5rem;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 6;
  }
  .track {
    stroke: rgba(255, 255, 255, 0.15);
  }
  .fill {
    stroke: var(--accent);
    stroke-linecap: round;
    stroke-dasharray: 283;
    transition: stroke-dashoffset 250ms linear;
  }
  .num {
    position: absolute;
    left: 0;
    width: 7.5rem;
    text-align: center;
    font-size: 2.8rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .label {
    font-size: 2.2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .then {
    position: absolute;
    left: var(--safe-x);
    right: var(--safe-x);
    bottom: var(--safe-y);
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.7rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
  }
  .then strong {
    color: var(--text);
  }
  .then .faint {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
