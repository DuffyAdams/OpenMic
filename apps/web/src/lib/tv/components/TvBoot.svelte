<script lang="ts">
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { useTv } from '../context';
  import { focusScope } from '../focus';
  import { native } from '../native';

  const tv = useTv();
</script>

<section class="tv-screen boot" use:focusScope>
  <div class="tv-glow"></div>
  <div class="box">
    <Brand size="6rem" label={false} />
    {#if tv.bootError}
      <h1>Can't reach the party server</h1>
      <p class="muted">{tv.bootError}</p>
      <p class="faint">Retrying automatically… ({location.host})</p>
      {#if native.available}
        <button class="tv-btn" data-focus data-autofocus onclick={() => native.openSettings()}>
          <Icon name="sliders" size="1.75rem" /> Change server
        </button>
      {/if}
    {:else}
      <span class="spinner" aria-label="Loading"></span>
      <p class="faint">Getting the stage ready…</p>
    {/if}
  </div>
</section>

<style>
  .boot {
    display: grid;
    place-items: center;
  }
  .box {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    text-align: center;
  }
  h1 {
    margin: 1rem 0 0;
    font-size: 3.2rem;
  }
  p {
    margin: 0;
    font-size: 1.7rem;
  }
  .spinner {
    width: 4rem;
    height: 4rem;
    margin-top: 2rem;
    border-radius: 50%;
    border: 0.35rem solid var(--surface-3);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
</style>
