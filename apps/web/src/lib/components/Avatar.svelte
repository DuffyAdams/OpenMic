<script lang="ts">
  import { hue, initials } from '$lib/format';

  interface Props {
    id: string;
    name: string;
    size?: string;
    online?: boolean | null;
  }
  let { id, name, size = '36px', online = null }: Props = $props();
  const h = $derived(hue(id));
</script>

<span
  class="avatar"
  style:width={size}
  style:height={size}
  style:font-size="calc({size} * 0.4)"
  style:--h={h}
  title={name}
  aria-hidden="true"
>
  {initials(name)}
  {#if online !== null}
    <span class="dot" class:on={online}></span>
  {/if}
</span>

<style>
  .avatar {
    position: relative;
    flex: none;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #fff;
    background: linear-gradient(135deg, hsl(var(--h) 55% 48%), hsl(calc(var(--h) + 40) 50% 30%));
  }
  .dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 28%;
    height: 28%;
    min-width: 8px;
    min-height: 8px;
    border-radius: 50%;
    background: var(--text-4);
    box-shadow: 0 0 0 2px var(--surface);
  }
  .dot.on {
    background: var(--success);
  }
</style>
