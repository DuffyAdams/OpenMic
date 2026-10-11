<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { useTv } from '../context';

  /** Banners on full-screen pages (lobby, intro) where there is no video to keep clear. */
  const tv = useTv();
</script>

{#if tv.banner}
  {#key tv.banner.id}
    <div class="toast {tv.banner.kind}" role="status">
      <span class="ico">
        <Icon name={tv.banner.kind === 'gold' ? 'mic' : tv.banner.kind === 'error' ? 'alert' : 'plus'} size="1.75rem" />
      </span>
      <div class="text">
        <strong>{tv.banner.title}</strong>
        {#if tv.banner.body}<span>{tv.banner.body}</span>{/if}
      </div>
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: absolute;
    right: var(--safe-x);
    top: calc(var(--safe-y) + 5rem);
    z-index: 35;
    max-width: 44rem;
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1.25rem 2rem 1.25rem 1.25rem;
    border-radius: 0.75rem;
    background: var(--surface-3);
    box-shadow: var(--shadow-2);
    animation: toast-in 380ms var(--ease) both;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(1.5rem);
    }
  }
  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .gold {
    background: #5b2fa8;
  }
  .gold .ico {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .error .ico {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  strong {
    font-size: 1.6rem;
  }
  span {
    font-size: 1.3rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
