<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { useTv } from '../context';
  import { focusScope } from '../focus';

  const tv = useTv();
  const item = $derived(tv.room.state!.now_playing!);
</script>

<section class="tv-screen err" use:focusScope>
  <div class="tv-glow"></div>
  <div class="box">
    <span class="ico"><Icon name="alert" size="4rem" /></span>
    <p class="tv-eyebrow">This video can't play here</p>
    <h1 class="tv-display">{item.title}</h1>
    <p class="why">{item.failure_reason ?? 'Playback error'} · requested by {item.singer}</p>
    <p class="hint">{item.singer} can pick another version from their phone.</p>
    <div class="actions">
      <button class="tv-btn primary" data-focus data-autofocus onclick={() => tv.command('skip', item.id)}>
        <Icon name="skip" size="1.75rem" /> Skip to next song
      </button>
      <button class="tv-btn" data-focus onclick={() => tv.command('retry')}>
        <Icon name="restart" size="1.75rem" /> Try again
      </button>
    </div>
  </div>
</section>

<style>
  .err {
    display: grid;
    place-items: center;
  }
  .box {
    position: relative;
    max-width: 80rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .ico {
    display: grid;
    place-items: center;
    width: 8rem;
    height: 8rem;
    border-radius: 50%;
    background: var(--danger-soft);
    color: var(--danger);
    margin-bottom: 2rem;
  }
  h1 {
    margin: 1rem 0;
    font-size: 4.5rem;
  }
  .why {
    margin: 0;
    font-size: 1.9rem;
    color: var(--danger);
    font-weight: 700;
  }
  .hint {
    margin: 1rem 0 3rem;
    font-size: 1.7rem;
    color: var(--text-2);
  }
  .actions {
    display: flex;
    gap: 1.5rem;
  }
</style>
