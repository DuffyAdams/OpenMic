<script lang="ts">
  import { fade } from 'svelte/transition';
  import { avatarInfo } from '$lib/avatars';
  import Avatar from '$lib/components/Avatar.svelte';
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Qr from '$lib/components/Qr.svelte';
  import { AVG_SONG_SECONDS, duration, minutes, singers, waitTimes } from '$lib/format';
  import type { Participant, QueueItem } from '$lib/types';
  import { thumbnail } from '$lib/youtube';
  import { useTv } from '../context';
  import { focusScope } from '../focus';

  const SHOWN = 5;

  const tv = useTv();
  const s = $derived(tv.room.state!);
  const item = $derived(s.now_playing!);
  const total = $derived((s.session.intro_seconds || 1) * 1000);
  const left = $derived.by(() => {
    if (tv.introHeldLeft !== null) return tv.introHeldLeft;
    return Math.max(0, tv.introEndsAt - tv.ticker.now);
  });
  const secs = $derived(Math.ceil(left / 1000));
  const progress = $derived(1 - left / total);
  const counting = $derived(tv.introHeldLeft === null && !tv.starting && tv.introEndsAt > 0);
  let bgFailed = $state(false);
  // Demo/mock items carry an inline placeholder image instead of a YouTube thumbnail.
  const inlineArt = $derived(item.thumbnail_url.startsWith('data:') ? item.thumbnail_url : '');
  const art = $derived(inlineArt || (bgFailed ? thumbnail(item.video_id, 'hq') : thumbnail(item.video_id, 'maxres')));
  const names = $derived(singers(item));
  const person = (id: string | null | undefined) => s.participants.find((p) => p.id === id);
  // Pictures of the singer (and duet partner) who picked one; initials would just repeat the name.
  const faces = $derived(
    [item.participant_id, item.partner_id]
      .map(person)
      .filter((p): p is Participant => !!p && !!avatarInfo(p.avatar))
  );
  // Long names (especially duets) step down so they stay on one line.
  const nameSize = $derived(names.length > 16 ? '4.75rem' : names.length > 11 ? '6rem' : '7.5rem');

  // The whole line, starting with this song: who's after it, roughly when, and how long it runs.
  const upcoming = $derived(s.queue.slice(0, SHOWN - 1));
  const waits = $derived(waitTimes(s, 0));
  const queueEnds = $derived.by(() => {
    const last = s.queue.at(-1);
    if (!last) return item.duration_seconds ?? AVG_SONG_SECONDS;
    return (waits.get(last.id) ?? 0) + (last.duration_seconds ?? AVG_SONG_SECONDS);
  });
  const songCount = $derived(s.queue.length + 1);
  const sung = $derived(s.history.filter((i) => i.status === 'completed'));
  const justSang = $derived(s.history[0]?.status === 'completed' ? s.history[0] : null);
  const host = $derived(tv.joinBase.replace(/^https?:\/\//, ''));
</script>

{#snippet row(q: QueueItem, pos: number, eta: string)}
  {@const p = person(q.participant_id)}
  <!-- Position 0 is the song that's about to start, so it reads as part of the line. -->
  <li class:now={pos === 0} style:animation-delay="{200 + pos * 70}ms">
    <span class="pos">{#if pos === 0}<Icon name="mic" size="1.6rem" />{:else}{pos}{/if}</span>
    <Avatar id={q.participant_id} name={q.singer} avatar={p?.avatar} size="3.5rem" />
    <div class="q-text">
      <p class="q-singer">
        {#if q.partner}<Icon name="duet" size="1.3rem" />{/if}
        {singers(q)}
      </p>
      <p class="q-title">{q.title}</p>
    </div>
    <span class="eta">{eta}</span>
  </li>
{/snippet}

<!-- Between songs: who's up, what follows, and how to get in line. Fades out over the video. -->
<section class="tv-screen intro" class:duet={!!item.partner} use:focusScope out:fade={{ duration: 900 }}>
  <div class="bg" style:background-image="url(&quot;{art}&quot;)"></div>
  <img class="probe" src={thumbnail(item.video_id, 'maxres')} alt="" onerror={() => (bgFailed = true)} onload={(e) => { if ((e.currentTarget as HTMLImageElement).naturalWidth < 200) bgFailed = true; }} />
  <div class="shade"></div>

  <header class="top">
    <div class="top-left">
      <Brand size="2.5rem" />
      {#if justSang}
        <p class="applause">
          <Icon name="sparkle" size="1.5rem" />
          <span>Big hand for <strong>{singers(justSang)}</strong></span>
          <span class="faint">— {justSang.title}</span>
        </p>
      {/if}
    </div>
    <div class="status">
      {#if sung.length}
        <span class="pill"><Icon name="music" size="1.5rem" /> {sung.length} sung tonight</span>
      {/if}
      <span class="pill"><Icon name="users" size="1.5rem" /> {s.participants.length} {s.participants.length === 1 ? 'singer' : 'singers'}</span>
      {#if tv.room.status !== 'online'}
        <span class="pill warn"><Icon name="wifiOff" size="1.5rem" /> Reconnecting…</span>
      {/if}
    </div>
  </header>

  <div class="grid">
    <div class="main">
      <p class="kicker">
        {#if item.partner}<span class="duet-tag"><Icon name="duet" size="1.4rem" stroke={2.4} /> Duet</span>{/if}
        Up next
      </p>
      <div class="who">
        {#if faces.length}
          <span class="faces">
            {#each faces as p (p.id)}<Avatar id={p.id} name={p.display_name} avatar={p.avatar} size="6.5rem" />{/each}
          </span>
        {/if}
        <h1 class="singer" style:font-size={nameSize}>{names}</h1>
      </div>

      <div class="track">
        <div class="art" style:background-image="url(&quot;{art}&quot;)"></div>
        <div class="track-text">
          <p class="song">{item.title}</p>
          <p class="channel">
            {#if item.channel}{item.channel}{/if}
            {#if item.duration_seconds}<span>· {duration(item.duration_seconds)}</span>{/if}
          </p>
        </div>
      </div>

      <div class="count" class:starting={tv.starting}>
        <svg viewBox="0 0 100 100" class="ring" aria-hidden="true">
          <circle cx="50" cy="50" r="45" class="track-ring" />
          <circle cx="50" cy="50" r="45" class="fill" style:stroke-dashoffset={283 * (1 - progress)} />
        </svg>
        <span class="num">
          {#if tv.introHeldLeft !== null}❚❚{:else if tv.starting}<Icon name="mic" size="2.6rem" />{:else}{secs}{/if}
        </span>
        <span class="count-text">
          <span class="label">
            {#if tv.introHeldLeft !== null}Paused by the host
            {:else if tv.starting}Here we go…
            {:else if item.partner}Grab both mics!
            {:else}Grab the mic!{/if}
          </span>
          {#if counting}<span class="hint">Ready already? Press <kbd>OK</kbd> to start</span>{/if}
        </span>
      </div>
    </div>

    <aside class="coming">
      <div class="panel">
        <div class="panel-head">
          <p class="tv-eyebrow">The queue</p>
          <p class="runs"><Icon name="clock" size="1.3rem" /> {songCount} {songCount === 1 ? 'song' : 'songs'} · {minutes(queueEnds)}</p>
        </div>
        <ol class="queue">
          {@render row(item, 0, tv.introHeldLeft !== null ? 'Paused' : tv.starting ? 'Starting' : 'Up next')}
          {#each upcoming as q, i (q.id)}
            {@render row(q, i + 1, `~${minutes(waits.get(q.id) ?? 0)}`)}
          {/each}
        </ol>
        {#if s.queue.length > upcoming.length}
          <p class="more">+ {s.queue.length - upcoming.length} more in line</p>
        {:else if !s.queue.length}
          <div class="empty">
            <Icon name="music" size="2.25rem" />
            <p>Nothing queued after this</p>
            <span>Grab your phone and pick the next song!</span>
          </div>
        {/if}
      </div>

      <div class="join" class:locked={!s.session.queue_open}>
        <div class="qr"><Qr value={tv.joinUrl} label="Scan to join the party" /></div>
        <div class="join-text">
          {#if s.session.queue_open}
            <p class="tv-eyebrow">Add a song</p>
            <p class="url">{host}</p>
            <p class="code tv-mono">{s.session.join_code}</p>
          {:else}
            <p class="tv-eyebrow">Requests paused</p>
            <p class="paused-note">The host has closed the queue for now.</p>
          {/if}
        </div>
      </div>
    </aside>
  </div>
</section>

<style>
  .intro {
    display: flex;
    flex-direction: column;
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
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(2rem);
    }
  }

  /* Top bar */
  .top {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    min-height: 3.25rem;
  }
  .top-left {
    display: flex;
    align-items: center;
    gap: 2rem;
    min-width: 0;
  }
  .applause {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-2);
    white-space: nowrap;
  }
  .applause :global(svg) {
    flex: none;
    color: var(--accent);
  }
  .applause strong {
    color: var(--text);
  }
  .applause .faint {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status {
    flex: none;
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
    font-size: 1.3rem;
    font-weight: 700;
  }
  .pill.warn {
    color: var(--warning);
  }

  .grid {
    position: relative;
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 40rem;
    gap: 4.5rem;
    margin-top: 2.5rem;
    min-height: 0;
  }

  /* Left: the singer who's up */
  .main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    animation: rise 700ms var(--ease) both;
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
  .who {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin: 0.75rem 0 2.25rem;
  }
  .faces {
    flex: none;
    display: flex;
    filter: drop-shadow(0 0.75rem 1.5rem rgba(0, 0, 0, 0.45));
  }
  .faces > :global(* + *) {
    margin-left: -2rem;
    box-shadow: 0 0 0 0.375rem var(--wash-2);
  }
  .singer {
    min-width: 0;
    margin: 0;
    font-weight: 900;
    letter-spacing: -0.045em;
    line-height: 1.05;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    display: flex;
    align-items: center;
    gap: 2rem;
  }
  .art {
    flex: none;
    width: 22rem;
    aspect-ratio: 16 / 9;
    border-radius: 0.5rem;
    background-size: cover;
    background-position: center;
    background-color: var(--surface-2);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.6);
  }
  .track-text {
    min-width: 0;
  }
  .song {
    margin: 0;
    font-size: 2.4rem;
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
    margin: 0.6rem 0 0;
    font-size: 1.45rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .channel span {
    color: var(--text-3);
  }

  .count {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-top: 3.5rem;
  }
  .ring {
    flex: none;
    width: 7.5rem;
    height: 7.5rem;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 6;
  }
  .track-ring {
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
  .num :global(svg) {
    vertical-align: middle;
  }
  .starting .ring {
    animation: pulse 1.2s var(--ease-in-out) infinite alternate;
  }
  @keyframes pulse {
    to {
      opacity: 0.45;
      transform: rotate(-90deg) scale(0.92);
    }
  }
  .count-text {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .label {
    font-size: 2.2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .hint {
    font-size: 1.3rem;
    color: var(--text-3);
  }
  kbd {
    display: inline-block;
    padding: 0 0.6rem;
    border-radius: 0.375rem;
    border: 0.1rem solid var(--text-3);
    font-family: inherit;
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--text-2);
  }

  /* Right: the rest of the queue and how to join it */
  .coming {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 0;
    animation: rise 700ms 120ms var(--ease) both;
  }
  .panel {
    flex: 1;
    min-height: 0;
    padding: 2rem;
    border-radius: 0.75rem;
    background: rgba(18, 18, 18, 0.78);
    overflow: hidden;
  }
  .panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .panel-head p {
    margin: 0;
  }
  .runs {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-3);
    white-space: nowrap;
  }
  .queue {
    list-style: none;
    margin: 1.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .queue li {
    display: flex;
    align-items: center;
    gap: 1.1rem;
    padding: 0.7rem 1rem 0.7rem 0.5rem;
    border-radius: 0.5rem;
    animation: fade-up var(--dur-slow) var(--ease) both;
  }
  .queue li.now {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 0.125rem var(--accent-glow);
  }
  .pos {
    flex: none;
    width: 1.75rem;
    text-align: center;
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .q-text {
    flex: 1;
    min-width: 0;
  }
  .q-text p {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .q-singer {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 1.5rem;
    font-weight: 800;
  }
  .q-singer :global(svg) {
    flex: none;
    color: var(--accent);
  }
  .q-title {
    margin-top: 0.2rem !important;
    font-size: 1.25rem;
    color: var(--text-2);
  }
  .eta {
    flex: none;
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-3);
    white-space: nowrap;
  }
  .now .pos {
    color: var(--accent);
  }
  .now .pos :global(svg) {
    vertical-align: middle;
  }
  .now .eta {
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .more {
    margin: 1rem 0 0 3.25rem;
    color: var(--text-3);
    font-size: 1.25rem;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-top: 6rem;
    color: var(--text-3);
    text-align: center;
  }
  .empty p {
    margin: 0.5rem 0 0;
    font-size: 1.7rem;
    font-weight: 800;
    color: var(--text);
  }
  .empty span {
    font-size: 1.4rem;
  }

  .join {
    flex: none;
    display: flex;
    align-items: center;
    gap: 1.75rem;
    padding: 1.5rem;
    border-radius: 0.75rem;
    background: rgba(18, 18, 18, 0.78);
  }
  .qr {
    flex: none;
    width: 8.5rem;
    height: 8.5rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: #fff;
  }
  .locked .qr {
    opacity: 0.4;
  }
  .join-text {
    min-width: 0;
  }
  .join-text p {
    margin: 0;
  }
  .url {
    margin-top: 0.4rem !important;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .code {
    margin-top: 0.3rem !important;
    font-size: 2.4rem;
    font-weight: 800;
    letter-spacing: 0.18em;
  }
  .paused-note {
    margin-top: 0.4rem !important;
    font-size: 1.4rem;
    color: var(--text-2);
  }
</style>
