<script lang="ts">
  import '$styles/tv.css';
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { dither } from '$lib/fx/dither';
  import { creepyCrawlies, HALLOWEEN_PALETTE, hauntedNight, TV_NIGHT } from '$lib/fx/halloween';
  import { wearTheme } from '$lib/themes';
  import TvBand from '$lib/tv/components/TvBand.svelte';
  import TvBoot from '$lib/tv/components/TvBoot.svelte';
  import TvEnded from '$lib/tv/components/TvEnded.svelte';
  import TvError from '$lib/tv/components/TvError.svelte';
  import TvIntro from '$lib/tv/components/TvIntro.svelte';
  import TvLobby from '$lib/tv/components/TvLobby.svelte';
  import TvPairing from '$lib/tv/components/TvPairing.svelte';
  import TvSidePanel from '$lib/tv/components/TvSidePanel.svelte';
  import TvToasts from '$lib/tv/components/TvToasts.svelte';
  import { setTv } from '$lib/tv/context';
  import { ensureFocus } from '$lib/tv/focus';
  import { fromKeyboard, fromNative } from '$lib/tv/keys';
  import { TvController } from '$lib/tv/tv.svelte';

  const tv = new TvController();
  setTv(tv);
  let playerHost: HTMLDivElement;

  // Keep keyboard focus out of the YouTube iframe so the remote always drives our UI.
  function reclaimFocus() {
    setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === 'IFRAME') {
        el.blur();
        window.focus();
      }
      ensureFocus();
    }, 0);
  }

  onMount(() => {
    document.documentElement.classList.add('tv');
    window.__tvKey = (name: string) => {
      const key = fromNative(name);
      return key ? tv.handleKey(key) : false;
    };
    const params = page.url.searchParams;
    void tv.boot(playerHost, {
      fake: params.get('player') === 'fake' ? true : params.get('player') === 'youtube' ? false : null,
      fakeDuration: Number(params.get('fakeDuration')) || 20
    });
    window.addEventListener('blur', reclaimFocus);
    return () => window.removeEventListener('blur', reclaimFocus);
  });

  onDestroy(() => {
    tv.destroy();
    document.documentElement.classList.remove('tv');
    delete window.__tvKey;
  });

  function onkeydown(e: KeyboardEvent) {
    const key = fromKeyboard(e);
    if (key && tv.handleKey(key)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const theme = $derived(tv.room.state?.session.theme ?? 'classic');
  $effect(() => wearTheme(theme));
  // Dithered pixels across the screen: about 2 device pixels per dot on a 1080p TV.
  const FX_COLUMNS = 960;
  const night = hauntedNight(TV_NIGHT);
  const crawlies = creepyCrawlies();

  const stage = $derived(tv.screen === 'stage');
  const sideOpen = $derived(!!tv.menu || !!tv.confirm || tv.joinPanel);
  const bandOpen = $derived(
    stage &&
      (tv.controls ||
        tv.needsGesture ||
        tv.room.status === 'reconnecting' ||
        !!tv.banner ||
        !!tv.room.state?.playback.paused)
  );
</script>

<svelte:window {onkeydown} />
<svelte:head><title>OpenMic · TV</title></svelte:head>

<div class="tv-root" data-screen={tv.screen}>
  <!-- The player stays mounted; screens sit above it when nothing is playing. -->
  <div
    class="player-region"
    class:behind={!stage}
    style:right={stage && sideOpen ? 'var(--side-w)' : '0'}
    style:bottom={bandOpen ? 'var(--band-h)' : '0'}
  >
    <div class="player-host" bind:this={playerHost}></div>
  </div>

  <!-- Halloween: a dithered night behind the screens and creepy-crawlies in front, never over the video. -->
  {#if theme === 'halloween' && !stage}
    <div class="fx" transition:fade={{ duration: 900 }}>
      <canvas class="dither" aria-hidden="true" use:dither={{ scene: night, palette: HALLOWEEN_PALETTE, columns: FX_COLUMNS, fps: 20 }}></canvas>
    </div>
    <div class="fx front" transition:fade={{ duration: 900 }}>
      <canvas
        class="dither"
        aria-hidden="true"
        use:dither={{ scene: crawlies, palette: HALLOWEEN_PALETTE, columns: FX_COLUMNS, fps: 20, transparent: true }}
      ></canvas>
    </div>
  {/if}

  {#if tv.screen === 'boot'}
    <TvBoot />
  {:else if tv.screen === 'pairing'}
    <TvPairing />
  {:else if tv.screen === 'lobby'}
    <TvLobby />
  {:else if tv.screen === 'intro'}
    <TvIntro />
  {:else if tv.screen === 'error'}
    <TvError />
  {:else if tv.screen === 'ended'}
    <TvEnded />
  {/if}

  {#if bandOpen}<TvBand />{/if}
  {#if sideOpen}<TvSidePanel />{/if}
  {#if tv.screen === 'lobby' || tv.screen === 'intro'}<TvToasts />{/if}
</div>

<style>
  .player-region {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    background: #000;
    transition:
      right 320ms var(--ease),
      bottom 320ms var(--ease),
      opacity 400ms var(--ease);
  }
  .player-region.behind {
    opacity: 0;
    pointer-events: none;
  }
  .player-host {
    position: absolute;
    inset: 0;
  }
  /* Theme effects: behind the screens (z 10), and in front of them but under the band and menu. */
  .fx {
    position: absolute;
    inset: 0;
    z-index: 8;
    pointer-events: none;
  }
  .fx.front {
    z-index: 20;
  }
  .player-host :global(iframe) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
