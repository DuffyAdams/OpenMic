<script lang="ts">
  import { avatarInfo } from '$lib/avatars';
  import { hue, initials } from '$lib/format';
  import AvatarArt from './AvatarArt.svelte';

  interface Props {
    id: string;
    name: string;
    /** Picture key from $lib/avatars; initials when unset or unknown. */
    avatar?: string | null;
    size?: string;
    online?: boolean | null;
  }
  let { id, name, avatar = null, size = '36px', online = null }: Props = $props();
  const h = $derived(hue(id));
  const art = $derived(avatarInfo(avatar));
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
  {#if art}
    <span class="art"><AvatarArt avatar={art} /></span>
  {:else}
    {initials(name)}
  {/if}
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
  .art {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    overflow: hidden;
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
