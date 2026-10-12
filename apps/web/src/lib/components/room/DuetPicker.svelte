<script lang="ts">
  import { useParty } from '$lib/party.svelte';
  import type { DuetPartner } from '$lib/types';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    /** The partner choice; `{}` means solo. */
    value: DuetPartner;
    /** Who requested the song (can't be their own partner). */
    ownerId: string;
  }
  let { value = $bindable(), ownerId }: Props = $props();
  const party = useParty();

  // Online guests first, so the people actually holding phones are easy to find.
  const guests = $derived(
    (party.state?.participants ?? [])
      .filter((p) => p.id !== ownerId)
      .sort((a, b) => Number(b.online) - Number(a.online))
  );
  let typing = $state(!!value.partner_name);
  let typed = $state(value.partner_name ?? '');

  const solo = $derived(!value.partner_id && !value.partner_name && !typing);

  function pick(id: string | null) {
    typing = false;
    value = id ? { partner_id: id } : {};
  }
  function typeName() {
    typing = true;
    value = typed.trim() ? { partner_name: typed.trim() } : {};
  }
  function ontyped() {
    value = typed.trim() ? { partner_name: typed.trim() } : {};
  }
</script>

<div class="picker">
  <p class="label">Sing with</p>
  <div class="row" role="radiogroup" aria-label="Duet partner">
    <button class="who" role="radio" aria-checked={solo} class:on={solo} onclick={() => pick(null)}>
      <span class="circle solo"><Icon name="mic" size={22} /></span>
      <span class="name">Solo</span>
    </button>
    {#each guests as g (g.id)}
      {@const on = value.partner_id === g.id}
      <button class="who" role="radio" aria-checked={on} class:on onclick={() => pick(g.id)}>
        <span class="circle">
          <Avatar id={g.id} name={g.display_name} avatar={g.avatar} size="52px" online={g.online} />
          {#if on}<span class="tick"><Icon name="check" size={13} stroke={3} /></span>{/if}
        </span>
        <span class="name">{g.display_name}</span>
      </button>
    {/each}
    <button class="who" role="radio" aria-checked={typing} class:on={typing} onclick={typeName}>
      <span class="circle other"><Icon name="plus" size={22} /></span>
      <span class="name">Type name</span>
    </button>
  </div>
  {#if typing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="input"
      placeholder="Their name"
      maxlength="24"
      autofocus
      bind:value={typed}
      oninput={ontyped}
      aria-label="Duet partner's name"
    />
  {/if}
</div>

<style>
  .picker {
    margin: 0 0 16px;
  }
  .label {
    margin: 0 0 10px;
    font-size: 0.95rem;
    font-weight: 800;
  }
  .row {
    display: flex;
    gap: 14px;
    margin: 0 -20px;
    padding: 2px 20px 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .row::-webkit-scrollbar {
    display: none;
  }
  .who {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 64px;
    color: var(--text-2);
  }
  .circle {
    position: relative;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px transparent;
    transition:
      box-shadow var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .solo,
  .other {
    background: var(--surface-2);
    color: var(--text);
  }
  .who:active .circle {
    transform: scale(0.94);
  }
  .on .circle {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .on .solo,
  .on .other {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .tick {
    position: absolute;
    right: -2px;
    bottom: -2px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: 0 0 0 2px var(--bg-raised);
  }
  .name {
    max-width: 100%;
    font-size: 0.76rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .on .name {
    color: var(--text);
  }
  .input {
    margin-top: 8px;
  }
</style>
