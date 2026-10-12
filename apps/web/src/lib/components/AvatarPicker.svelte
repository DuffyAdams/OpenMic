<script lang="ts">
  import { AVATARS, avatarInfo } from '$lib/avatars';
  import AvatarArt from './AvatarArt.svelte';

  let { value = $bindable() }: { value: string } = $props();
  const picked = $derived(avatarInfo(value));
</script>

<fieldset class="picker">
  <div class="head">
    <legend class="field-label">Pick your singer</legend>
    {#if picked}<span class="stage" aria-live="polite">{picked.name}</span>{/if}
  </div>
  <div class="grid">
    {#each AVATARS as a (a.id)}
      <label class="opt" class:on={value === a.id} title={a.name}>
        <input type="radio" name="avatar" value={a.id} bind:group={value} aria-label={a.name} />
        <AvatarArt avatar={a} />
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .picker {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  legend {
    float: left;
    padding: 0;
  }
  .stage {
    margin-bottom: 8px;
    font-size: 0.85rem;
    font-weight: 800;
    color: var(--accent-strong);
    white-space: nowrap;
  }
  .grid {
    clear: both;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
  }
  @media (max-width: 420px) {
    .grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
  }
  .opt {
    position: relative;
    aspect-ratio: 1;
    border-radius: 50%;
    overflow: hidden;
    cursor: pointer;
    opacity: 0.72;
    box-shadow: 0 0 0 3px transparent;
    transition:
      opacity var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
    -webkit-tap-highlight-color: transparent;
  }
  /* Invisible, but covers the whole tile so taps land on the radio itself. */
  input {
    position: absolute;
    inset: 0;
    z-index: 1;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .opt:hover {
    opacity: 0.85;
  }
  .opt:active {
    transform: scale(0.94);
  }
  .opt.on {
    opacity: 1;
    transform: scale(1.06);
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 5px var(--accent);
  }
  .opt:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
  }
  @media (prefers-reduced-motion: reduce) {
    .opt,
    .opt.on {
      transition: none;
      transform: none;
    }
  }
</style>
