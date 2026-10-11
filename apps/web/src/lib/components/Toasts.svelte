<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { toasts } from '$lib/toast.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    bottom?: string;
  }
  let { bottom = '96px' }: Props = $props();
  const icons = { info: 'sparkle', success: 'check', error: 'alert', gold: 'mic' } as const;
</script>

<div class="toasts" style:bottom aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div
      class="toast {t.kind}"
      animate:flip={{ duration: 200 }}
      in:fly={{ y: 24, duration: 260 }}
      out:fly={{ y: 12, duration: 180 }}
    >
      <span class="ico"><Icon name={icons[t.kind]} size={18} /></span>
      <div class="text">
        <strong>{t.title}</strong>
        {#if t.body}<span>{t.body}</span>{/if}
      </div>
      {#if t.action}
        <button
          class="act"
          onclick={() => {
            t.action?.run();
            toasts.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {:else}
        <button class="close" aria-label="Dismiss" onclick={() => toasts.dismiss(t.id)}>
          <Icon name="x" size={16} />
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    z-index: 80;
    transform: translateX(-50%);
    width: min(520px, calc(100% - 24px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 12px 14px;
    border-radius: var(--radius);
    background: var(--surface-3);
    box-shadow: var(--shadow-2);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .success .ico {
    background: var(--success-soft);
    color: var(--success);
  }
  .error .ico {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .gold {
    background: #5b2fa8;
  }
  .gold .ico {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .gold .text span {
    color: rgba(255, 255, 255, 0.8);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 0.92rem;
  }
  .text span {
    color: var(--text-2);
    font-size: 0.86rem;
  }
  .act {
    flex: none;
    padding: 8px 14px;
    border-radius: var(--radius-pill);
    background: var(--text);
    color: #000;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .close {
    flex: none;
    color: var(--text-2);
    padding: 6px;
  }
</style>
