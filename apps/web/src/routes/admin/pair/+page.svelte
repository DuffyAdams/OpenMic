<script lang="ts">
  import { page } from '$app/state';
  import { api, ApiError } from '$lib/api';
  import AdminLogin from '$lib/components/AdminLogin.svelte';
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { prefs } from '$lib/storage';
  import type { DeviceOut } from '$lib/types';

  let token = $state(prefs.adminToken);
  let code = $state((page.url.searchParams.get('code') ?? '').toUpperCase());
  let name = $state('');
  let busy = $state(false);
  let error = $state('');
  let paired = $state<DeviceOut | null>(null);

  async function pair(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      paired = await api<DeviceOut>('/api/admin/devices/pair', {
        method: 'POST',
        token,
        body: { code, name: name.trim() || null }
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        prefs.adminToken = null;
        token = null;
      }
      error = err instanceof ApiError ? err.message : 'Pairing failed.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Pair TV · OpenMic</title></svelte:head>

<div class="lounge-bg"></div>
<main class="page">
  <header><a href="/admin" class="home"><Brand /></a></header>

  {#if paired}
    <section class="card done">
      <span class="ok"><Icon name="check" size={30} /></span>
      <h1 class="display">{paired.name} is ready</h1>
      <p class="muted">The TV will switch to the party lobby in a few seconds.</p>
      <a class="btn btn-primary" href="/admin">Go to host setup</a>
    </section>
  {:else if !token}
    <AdminLogin onlogin={(t) => (token = t)} subtitle="Sign in to pair this TV." />
  {:else}
    <form class="card form" onsubmit={pair}>
      <span class="tv"><Icon name="tv" size={28} /></span>
      <h1 class="display">Pair this TV</h1>
      <p class="muted">Check that the code matches the one on the TV screen.</p>
      <label class="field-label" for="code">Pairing code</label>
      <input id="code" class="input code" bind:value={code} maxlength="8" autocapitalize="characters" />
      <label class="field-label" for="name">TV name</label>
      <input id="name" class="input" bind:value={name} maxlength="40" placeholder="Living Room TV" />
      <button class="btn btn-primary btn-lg btn-block" disabled={busy || code.length < 4}>
        {busy ? 'Pairing…' : 'Pair TV'}
      </button>
      {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    </form>
  {/if}
</main>

<style>
  header {
    margin-bottom: 6vh;
  }
  .home {
    color: var(--text);
  }
  .form,
  .done {
    padding: 24px 20px;
    display: grid;
    gap: 10px;
  }
  .done {
    justify-items: center;
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
  }
  p {
    margin: 0 0 8px;
  }
  .field-label {
    margin: 6px 0 0;
  }
  .code {
    height: 62px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 1.7rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    text-transform: uppercase;
  }
  .tv,
  .ok {
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .ok {
    background: var(--success-soft);
    color: var(--success);
  }
  .btn {
    margin-top: 8px;
  }
</style>
