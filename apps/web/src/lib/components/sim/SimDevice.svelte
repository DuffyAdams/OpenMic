<script lang="ts">
  import { base } from '$app/paths';
  import { onMount, type Snippet } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { SIM_PREFIX } from '$lib/storage';

  /**
   * One simulated device on the /sim page: the real app in a same-origin iframe rendered at the
   * device's native resolution and scaled to fit. The frame name gives it its own storage.
   */
  let {
    device,
    label,
    src,
    width,
    height,
    kind = 'phone',
    frame = $bindable(),
    onload,
    children
  }: {
    device: string;
    label: string;
    /** Changing `src` (or calling `reload()`) navigates the frame. */
    src: string;
    width: number;
    height: number;
    kind?: 'tv' | 'phone';
    frame?: HTMLIFrameElement;
    onload?: (win: Window) => void;
    children?: Snippet;
  } = $props();

  let slotW = $state(0);
  let slotH = $state(0);
  let path = $state('');
  let nonce = $state(0);

  const frameSrc = $derived(`${base}${src}`);
  const bezel = $derived(kind === 'phone' ? 10 : 8);
  const scale = $derived(
    slotW && slotH ? Math.min((slotW - bezel * 2) / width, (slotH - bezel * 2) / height) : 0
  );

  export function reload() {
    nonce++;
  }

  // The app navigates client-side, so poll the frame's location rather than waiting for loads.
  onMount(() => {
    const timer = setInterval(() => {
      try {
        const loc = frame?.contentWindow?.location;
        if (loc && loc.href !== 'about:blank') path = loc.pathname + loc.search;
      } catch {
        /* cross-origin (e.g. a YouTube link opened in the frame) */
      }
    }, 400);
    return () => clearInterval(timer);
  });

  function loaded() {
    if (frame?.contentWindow) onload?.(frame.contentWindow);
  }
</script>

<section class="device {kind}" aria-label={label}>
  <header>
    <span class="label">{label}</span>
    <code class="path" title={path}>{path || frameSrc}</code>
    <button class="icon-btn mini" title="Reload" aria-label="Reload {label}" onclick={reload}>
      <Icon name="restart" size={15} />
    </button>
    <a class="icon-btn mini" href={path || frameSrc} target="_blank" rel="noopener" title="Open in a new tab"
      aria-label="Open {label} in a new tab">
      <Icon name="external" size={15} />
    </a>
  </header>

  <div class="slot" bind:clientWidth={slotW} bind:clientHeight={slotH}>
    {#if scale > 0}
      <div
        class="bezel"
        style:width="{width * scale + bezel * 2}px"
        style:height="{height * scale + bezel * 2}px"
        style:padding="{bezel}px"
      >
        <div class="screen" style:width="{width * scale}px" style:height="{height * scale}px">
          {#key `${src}#${nonce}`}
            <iframe
              bind:this={frame}
              name={SIM_PREFIX + device}
              title={label}
              src={frameSrc}
              allow="autoplay; fullscreen; encrypted-media; clipboard-read; clipboard-write"
              style:width="{width}px"
              style:height="{height}px"
              style:transform="scale({scale})"
              onload={loaded}
            ></iframe>
          {/key}
        </div>
      </div>
    {/if}
  </div>

  {@render children?.()}
</section>

<style>
  .device {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    gap: 8px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .label {
    font-weight: 800;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-3);
  }
  .mini {
    width: 28px;
    height: 28px;
    flex: none;
  }
  .slot {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  /* Size the TV slot to the screen so whatever follows it (the remote) sits right underneath. */
  .tv .slot {
    flex: 0 1 auto;
    aspect-ratio: 16 / 9;
  }
  .bezel {
    flex: none;
    background: #050505;
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-2);
  }
  .phone .bezel {
    border-radius: 34px;
  }
  .tv .bezel {
    border-radius: var(--radius);
  }
  .screen {
    position: relative;
    overflow: hidden;
    background: var(--bg);
  }
  .phone .screen {
    border-radius: 25px;
  }
  iframe {
    position: absolute;
    top: 0;
    left: 0;
    border: 0;
    transform-origin: 0 0;
    background: var(--bg);
  }
</style>
