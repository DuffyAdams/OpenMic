<script lang="ts">
  import { goto } from '$app/navigation';
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { credentials } from '$lib/storage';

  let code = $state('');
  const last = credentials.last();
  const clean = $derived(code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));

  function submit(e: Event) {
    e.preventDefault();
    if (clean.length >= 4) goto(`/join/${clean}`);
  }
</script>

<svelte:head><title>OpenMic</title></svelte:head>

<div class="lounge-bg"></div>
<main class="page landing">
  <header><Brand /></header>

  <section class="hero">
    <p class="eyebrow">Karaoke night</p>
    <h1 class="display">Grab the mic.<br /><em>Pick your song.</em></h1>
    <p class="muted">Scan the QR code on the TV, or type the room code shown under it.</p>
  </section>

  <form class="join card" onsubmit={submit}>
    <label class="field-label" for="code">Room code</label>
    <input
      id="code"
      class="input code"
      bind:value={code}
      placeholder="ABCD12"
      autocomplete="off"
      autocapitalize="characters"
      spellcheck="false"
      inputmode="text"
      maxlength="8"
    />
    <button class="btn btn-primary btn-lg btn-block" disabled={clean.length < 4}>
      Join the party <Icon name="arrowRight" size={20} />
    </button>
  </form>

  {#if last}
    <a class="continue card" href="/room/{last.joinCode}">
      <span class="faint">Continue as</span>
      <strong>{last.displayName}</strong>
      <span class="chip">{last.joinCode}</span>
      <Icon name="right" size={18} />
    </a>
  {/if}

  <footer>
    <a href="/admin" class="faint">Host &amp; TV setup</a>
  </footer>
</main>

<style>
  .landing {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }
  .hero {
    margin-top: 6vh;
  }
  h1 {
    margin: 10px 0 14px;
    font-size: clamp(2.4rem, 11vw, 3.4rem);
    line-height: 1.02;
  }
  h1 em {
    color: var(--premium);
    font-style: italic;
  }
  .join {
    padding: 20px;
    display: grid;
    gap: 14px;
  }
  .join .field-label {
    margin: 0;
  }
  .code {
    height: 64px;
    text-align: center;
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    font-family: var(--font-mono);
    text-transform: uppercase;
  }
  .continue {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 18px;
    color: var(--text);
  }
  .continue strong {
    flex: 1;
  }
  footer {
    margin-top: auto;
    text-align: center;
    font-size: 0.9rem;
  }
</style>
