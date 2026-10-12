<script lang="ts">
  import { onMount } from 'svelte';
  import { ApiError } from '$lib/api';
  import { duration } from '$lib/format';
  import { useParty } from '$lib/party.svelte';
  import { cachedSongbook, loadSongbook, matchSongs, songbookView } from '$lib/songbook';
  import { prefs } from '$lib/storage';
  import type { ResolveResponse, SearchResponse, Songbook, SongbookSong, Video } from '$lib/types';
  import { looksLikeYouTubeLink, youtubeSearchUrl } from '$lib/youtube';
  import Icon from '../Icon.svelte';
  import Thumb from '../Thumb.svelte';
  import AddSheet from './AddSheet.svelte';

  const party = useParty();
  const searchEnabled = party.config.search_enabled;

  let query = $state('');
  let karaokeOnly = $state(true);
  let results = $state<Video[]>([]);
  let searched = $state('');
  let loading = $state(false);
  let error = $state<ApiError | null>(null);
  let selected = $state<Video | null>(null);
  let recent = $state(prefs.recentSearches);
  let input: HTMLInputElement | undefined = $state();
  let controller: AbortController | null = null;
  let resolveTimer: ReturnType<typeof setTimeout> | undefined;
  let book = $state<Songbook | null>(cachedSongbook());
  let category = $state(songbookView.category);

  const isLink = $derived(looksLikeYouTubeLink(query));
  const bookMatches = $derived(isLink ? [] : matchSongs(book, query));
  const songsById = $derived(new Map(book?.songs.map((s) => [s.id, s]) ?? []));
  const shelf = $derived(book?.categories.find((c) => c.id === category) ?? book?.categories[0]);
  const shelfSongs = $derived(shelf ? shelf.song_ids.flatMap((id) => songsById.get(id) ?? []) : []);
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText && window.isSecureContext;

  onMount(() => {
    loadSongbook(() => party.call<Songbook>('/api/songbook'))
      .then((b) => (book = b))
      .catch(() => {}); // the songbook is optional: search and pasted links work without it
  });

  function pickCategory(id: string) {
    category = songbookView.category = id;
  }

  // "Find another version" from elsewhere in the app pre-fills the search.
  $effect(() => {
    const prefill = party.searchPrefill;
    if (prefill) {
      query = prefill.q;
      party.searchPrefill = null;
      if (searchEnabled) run();
    }
  });

  async function run() {
    const q = query.trim();
    if (!q) return;
    controller?.abort();
    controller = new AbortController();
    loading = true;
    error = null;
    try {
      if (looksLikeYouTubeLink(q)) {
        const r = await party.call<ResolveResponse>('/api/videos/resolve', {
          query: { input: q },
          signal: controller.signal
        });
        results = [r.video];
        searched = 'link';
        selected = r.video; // a pasted link goes straight to the confirm sheet
      } else {
        if (!searchEnabled) {
          error = new ApiError(503, 'search_unavailable', '', { reason: 'not_configured' });
          results = [];
          searched = q;
          return;
        }
        const r = await party.call<SearchResponse>('/api/search', {
          query: { q, karaoke: karaokeOnly },
          signal: controller.signal
        });
        results = r.results;
        searched = q;
        prefs.addRecentSearch(q);
        recent = prefs.recentSearches;
        input?.blur();
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'aborted') return;
      error = e instanceof ApiError ? e : new ApiError(0, 'unknown', 'Search failed. Try again.');
      results = [];
    } finally {
      loading = false;
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    find();
  }

  /** Songbook first: a YouTube search spends quota, so only run one when asked to. */
  function find() {
    if (isLink || !bookMatches.length) return run();
    prefs.addRecentSearch(query.trim());
    recent = prefs.recentSearches;
    input?.blur();
  }

  function oninput() {
    clearTimeout(resolveTimer);
    if (isLink) resolveTimer = setTimeout(run, 350);
    else if (searched || error) {
      // Typing again leaves the last results behind for live songbook matches.
      results = [];
      searched = '';
      error = null;
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        query = text.trim();
        run();
      }
    } catch {
      input?.focus();
    }
  }

  function clear() {
    query = '';
    results = [];
    searched = '';
    error = null;
    input?.focus();
  }

  const fallbackReason = $derived(
    error?.code === 'search_unavailable' ? (error.reason ?? 'not_configured') : null
  );
</script>

<section class="search">
  <form class="bar" onsubmit={submit} role="search">
    <Icon name={isLink ? 'link' : 'search'} size={20} class="lead" />
    <input
      bind:this={input}
      bind:value={query}
      {oninput}
      class="input"
      type="search"
      enterkeyhint="search"
      placeholder={searchEnabled ? 'Song or artist — or paste a link' : 'Paste a YouTube link'}
      aria-label="Search for a song or paste a YouTube link"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
    />
    {#if query}
      <button type="button" class="icon-btn clear" aria-label="Clear" onclick={clear}>
        <Icon name="x" size={18} />
      </button>
    {/if}
  </form>

  <div class="tools">
    {#if searchEnabled}
      <button
        type="button"
        class="chip toggle"
        class:on={karaokeOnly}
        aria-pressed={karaokeOnly}
        onclick={() => {
          karaokeOnly = !karaokeOnly;
          if (searched && searched !== 'link') run();
        }}
      >
        {#if karaokeOnly}<Icon name="check" size={14} />{/if} Karaoke versions
      </button>
    {/if}
    {#if canPaste}
      <button type="button" class="chip toggle" onclick={paste}>
        <Icon name="paste" size={14} /> Paste link
      </button>
    {/if}
  </div>

  {#if loading}
    <ul class="results" aria-busy="true">
      {#each Array(4) as _, i (i)}
        <li class="result skeleton"><span class="sk-thumb"></span><span class="sk-lines"><i></i><i></i></span></li>
      {/each}
    </ul>
  {:else if fallbackReason}
    <div class="card helper">
      <p class="eyebrow">
        {fallbackReason === 'not_configured' ? 'Paste a link to add songs' : 'Search is resting'}
      </p>
      <p class="muted">
        {#if fallbackReason === 'not_configured'}
          This party adds songs from YouTube links.
        {:else}
          {error?.message}
        {/if}
      </p>
      <ol>
        <li>Find a karaoke version on YouTube.</li>
        <li>Tap <strong>Share → Copy link</strong>.</li>
        <li>Come back and paste it above.</li>
      </ol>
      <a class="btn btn-ghost btn-block" href={youtubeSearchUrl(searched || query || 'karaoke')} target="_blank" rel="noopener">
        Search on YouTube <Icon name="external" size={18} />
      </a>
    </div>
  {:else if error}
    <div class="card helper error">
      <Icon name="alert" size={22} />
      <p>{error.message}</p>
      {#if error.code === 'video_unavailable' && searchEnabled}
        <button class="btn btn-ghost btn-sm" onclick={() => { query = ''; error = null; input?.focus(); }}>Search instead</button>
      {/if}
    </div>
  {:else if results.length}
    {#if searched !== 'link'}<p class="count faint">Results for “{searched}”</p>{/if}
    <ul class="results">
      {#each results as video (video.video_id)}
        {@const queuedBy = party.queuedVideos.get(video.video_id)}
        <li>
          <button class="result" onclick={() => (selected = video)}>
            <Thumb videoId={video.video_id} src={video.thumbnail_url} width="104px" radius="var(--radius-xs)" />
            <span class="info">
              <span class="title">{video.title}</span>
              <span class="meta">
                {video.channel}{#if video.duration_seconds}&nbsp;· {duration(video.duration_seconds)}{/if}
              </span>
              <span class="badges">
                {#if queuedBy}<span class="chip chip-accent">In queue</span>{/if}
                {#if video.labels.includes('Karaoke channel')}<span class="chip chip-gold">Karaoke channel</span>
                {:else if video.is_karaoke}<span class="chip chip-gold">Karaoke</span>{/if}
                {#if video.labels.includes('Lyrics')}<span class="chip">Lyrics</span>{/if}
              </span>
            </span>
            <span class="add" aria-hidden="true"><Icon name="plus" size={18} stroke={2.4} /></span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if searched && searched !== 'link'}
    <div class="empty">
      <p>No results for “{searched}”.</p>
      <p class="faint">Try the artist name, or turn off “Karaoke versions”.</p>
    </div>
  {:else if bookMatches.length}
    <p class="count faint">In the songbook</p>
    <ul class="results">
      {#each bookMatches as song (song.id)}{@render songRow(song)}{/each}
    </ul>
    {#if searchEnabled}
      <button type="button" class="btn btn-ghost btn-block" onclick={run}>
        <Icon name="search" size={18} /> Search YouTube for “{query.trim()}”
      </button>
    {:else}
      <a class="btn btn-ghost btn-block" href={youtubeSearchUrl(query)} target="_blank" rel="noopener">
        Find other versions on YouTube <Icon name="external" size={18} />
      </a>
    {/if}
  {:else}
    <div class="start">
      {#if recent.length && (searchEnabled || book?.songs.length)}
        <p class="eyebrow">Recent</p>
        <div class="recent">
          {#each recent as r (r)}
            <button class="chip toggle" onclick={() => { query = r; find(); }}>{r}</button>
          {/each}
        </div>
      {/if}
      {#if book && shelf}
        <div class="book">
          <div class="book-head">
            <p class="eyebrow">Songbook</p>
            <p class="faint">Tap a song to add it. No searching needed.</p>
          </div>
          <div class="cats">
            {#each book.categories as c (c.id)}
              <button
                type="button"
                class="chip toggle"
                class:on={c.id === shelf.id}
                aria-pressed={c.id === shelf.id}
                onclick={() => pickCategory(c.id)}
              >
                {c.name}
              </button>
            {/each}
          </div>
          {#if shelf.description}<p class="shelf-desc faint">{shelf.description}</p>{/if}
          <ul class="results">
            {#each shelfSongs as song (song.id)}{@render songRow(song)}{/each}
          </ul>
        </div>
      {/if}
      <div class="tip card">
        <Icon name="sparkle" size={20} />
        <p>
          {#if book && shelf}Not in the songbook?{/if}
          {#if searchEnabled}
            Search like <em>“Dancing Queen”</em> or <em>“Mr. Brightside”</em>. We'll find karaoke
            versions. You can also paste any YouTube link.
          {:else}
            Find a karaoke video on YouTube, tap <strong>Share → Copy link</strong>, and paste it here.
          {/if}
        </p>
      </div>
      {#if !searchEnabled}
        <a class="btn btn-ghost btn-block" href={youtubeSearchUrl('karaoke')} target="_blank" rel="noopener">
          Open YouTube <Icon name="external" size={18} />
        </a>
      {/if}
    </div>
  {/if}
</section>

{#snippet songRow(song: SongbookSong)}
  <li>
    <button class="result" onclick={() => (selected = song.video)}>
      <Thumb videoId={song.video.video_id} src={song.video.thumbnail_url} width="104px" radius="var(--radius-xs)" />
      <span class="info">
        <span class="title">{song.title}</span>
        <span class="meta">
          {song.artist}{#if song.video.duration_seconds}&nbsp;· {duration(song.video.duration_seconds)}{/if}
        </span>
        {#if song.duet || party.queuedVideos.has(song.video.video_id)}
          <span class="badges">
            {#if party.queuedVideos.has(song.video.video_id)}<span class="chip chip-accent">In queue</span>{/if}
            {#if song.duet}<span class="chip">Duet</span>{/if}
          </span>
        {/if}
      </span>
      <span class="add" aria-hidden="true"><Icon name="plus" size={18} stroke={2.4} /></span>
    </button>
  </li>
{/snippet}

<AddSheet video={selected} onclose={() => (selected = null)} onadded={() => { if (searched === 'link') clear(); }} />

<style>
  .search {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
  }
  .bar :global(.lead) {
    position: absolute;
    left: 14px;
    z-index: 1;
    color: #121212;
    pointer-events: none;
  }
  .bar .input {
    height: 48px;
    padding-left: 46px;
    padding-right: 46px;
    border-radius: var(--radius-sm);
    background: #fff;
    color: #121212;
    font-weight: 600;
  }
  .bar .input::placeholder {
    color: #535353;
    font-weight: 500;
  }
  .bar .input:focus {
    border-color: transparent;
    box-shadow: 0 0 0 3px var(--accent);
  }
  .bar .input::-webkit-search-cancel-button {
    display: none;
  }
  .clear {
    position: absolute;
    right: 4px;
    color: #121212;
  }
  .clear:hover {
    background: rgba(0, 0, 0, 0.08);
    color: #000;
  }
  .tools {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .toggle {
    height: 32px;
    padding: 0 14px;
    font-size: 0.86rem;
    font-weight: 600;
    background: var(--surface-2);
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .toggle:hover {
    background: var(--surface-3);
  }
  .toggle.on {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .count {
    margin: 0;
    font-size: 0.85rem;
  }
  .results {
    list-style: none;
    margin: 0 -8px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .result {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: var(--radius-sm);
    text-align: left;
    transition: background var(--dur-fast) var(--ease);
  }
  .result:active,
  .result:hover {
    background: var(--surface-2);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .title {
    font-weight: 600;
    font-size: 0.98rem;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta {
    font-size: 0.84rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badges {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    margin-top: 2px;
  }
  .badges .chip {
    height: 20px;
    font-size: 0.68rem;
  }
  .add {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-right: 6px;
    border-radius: 50%;
    border: 1.5px solid var(--text-2);
    color: var(--text-2);
    transition:
      color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .result:hover .add {
    color: var(--accent);
    border-color: var(--accent);
    transform: scale(1.06);
  }
  .skeleton {
    display: flex;
    gap: 12px;
    padding: 8px;
  }
  .sk-thumb {
    width: 104px;
    aspect-ratio: 16/9;
    border-radius: var(--radius-sm);
    background: var(--surface);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .sk-lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 6px;
  }
  .sk-lines i {
    height: 12px;
    border-radius: 6px;
    background: var(--surface);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .sk-lines i:last-child {
    width: 60%;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
  .helper {
    padding: 18px;
  }
  .helper p {
    margin: 0 0 10px;
  }
  .helper ol {
    margin: 0 0 16px;
    padding-left: 1.2rem;
    color: var(--text-2);
    line-height: 1.8;
  }
  .helper.error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    color: var(--danger);
  }
  .helper.error p {
    color: var(--text);
    margin: 0;
  }
  .empty {
    text-align: center;
    padding: 30px 10px;
  }
  .empty p {
    margin: 0 0 6px;
  }
  .start {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .start .eyebrow {
    margin: 4px 0 0;
  }
  .recent {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .book {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  }
  .book-head p {
    margin: 0;
  }
  .book-head .faint {
    margin-top: 2px;
    font-size: 0.88rem;
  }
  .cats {
    display: flex;
    gap: 8px;
    /* Scroll edge to edge: the room content has a 16px side gutter. */
    margin: 0 -16px;
    padding: 2px 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .cats::-webkit-scrollbar {
    display: none;
  }
  .cats .toggle {
    flex: none;
  }
  .shelf-desc {
    margin: 0;
    font-size: 0.85rem;
  }
  .tip {
    display: flex;
    gap: 12px;
    padding: 16px;
    color: var(--text-2);
    font-size: 0.92rem;
  }
  .tip :global(svg) {
    flex: none;
    color: var(--premium);
    margin-top: 2px;
  }
  .tip p {
    margin: 0;
  }
  .tip em {
    color: var(--text);
    font-style: normal;
    font-weight: 700;
  }
</style>
