<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    open: boolean;
    onclose: () => void;
    title?: string;
    children: Snippet;
  }
  let { open, onclose, title = '', children }: Props = $props();

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onclose();
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <div class="backdrop" transition:fade={{ duration: 180 }} onclick={onclose} role="presentation"></div>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={title || 'Dialog'}
    transition:fly={{ y: 420, duration: 300, opacity: 1 }}
  >
    <div class="grip" aria-hidden="true"></div>
    {#if title}<h2 class="title">{title}</h2>{/if}
    {@render children()}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(0, 0, 0, 0.7);
  }
  .sheet {
    position: fixed;
    left: 50%;
    bottom: 0;
    z-index: 61;
    width: min(560px, 100%);
    max-height: 88dvh;
    overflow-y: auto;
    transform: translateX(-50%);
    padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
    background: var(--bg-raised);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    box-shadow: var(--shadow-2);
  }
  .grip {
    width: 40px;
    height: 4px;
    margin: 0 auto 14px;
    border-radius: 2px;
    background: var(--surface-3);
  }
  .title {
    margin: 0 0 14px;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
</style>
