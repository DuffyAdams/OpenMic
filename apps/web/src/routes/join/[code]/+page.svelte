<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError } from '$lib/api';
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { credentials, prefs } from '$lib/storage';
  import type { JoinResponse, SessionLookup } from '$lib/types';

  const code = $derived((page.params.code ?? '').toUpperCase());

  let lookup = $state<SessionLookup | null>(null);
  let lookupError = $state('');
  let name = $state(prefs.name);
  let busy = $state(false);
  let error = $state('');

  $effect(() => {
    const c = code;
    // Already joined from this phone: go straight back in.
    if (credentials.get(c)) {
      goto(`/room/${c}`, { replaceState: true });
      return;
    }
    api<SessionLookup>(`/api/sessions/lookup/${encodeURIComponent(c)}`)
      .then((r) => (lookup = r))
      .catch((e: ApiError) => (lookupError = e.message));
  });

  async function join(e: Event) {
    e.preventDefault();
    const displayName = name.trim();
    if (!displayName) {
      error = 'Pick a name so everyone knows who’s singing.';
      return;
    }
    busy = true;
    error = '';
    try {
      const r = await api<JoinResponse>('/api/sessions/join', {
        method: 'POST',
        body: { join_code: code, display_name: displayName }
      });
      prefs.name = displayName;
      credentials.set({
        token: r.token,
        participantId: r.participant.id,
        sessionId: r.session_id,
        joinCode: r.join_code,
        displayName: r.participant.display_name
      });
      await goto(`/room/${r.join_code}`, { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Could not join. Try again.';
      busy = false;
    }
  }
</script>

<svelte:head><title>Join {lookup?.title ?? 'the party'} · OpenMic</title></svelte:head>

<div class="lounge-bg"></div>
<main class="page">
  <header><a href="/" aria-label="Home"><Brand /></a></header>

  {#if lookupError}
    <section class="state card">
      <Icon name="alert" size={28} />
      <h1>Party not found</h1>
      <p class="muted">{lookupError}</p>
      <a class="btn btn-ghost" href="/">Enter a different code</a>
    </section>
  {:else}
    <section class="intro">
      <p class="eyebrow">You're invited to</p>
      <h1 class="display">{lookup?.title ?? '…'}</h1>
      <p class="muted">
        Room <span class="chip">{code}</span>
        {#if lookup?.guest_count}· {lookup.guest_count} {lookup.guest_count === 1 ? 'singer' : 'singers'} here{/if}
      </p>
    </section>

    <form class="card form" onsubmit={join}>
      <label class="field-label" for="name">Your name</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="name"
        class="input"
        bind:value={name}
        maxlength="24"
        placeholder="e.g. Jessica"
        autocomplete="nickname"
        enterkeyhint="go"
        autofocus
      />
      <p class="hint faint">Shown on the TV when it's your turn. No account needed.</p>
      <button class="btn btn-primary btn-lg btn-block" disabled={busy || !lookup}>
        {#if busy}Joining…{:else}Join &amp; pick a song{/if}
      </button>
      {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    </form>
  {/if}
</main>

<style>
  header {
    margin-bottom: 8vh;
  }
  header a {
    color: var(--text);
  }
  .intro h1 {
    margin: 8px 0 10px;
    font-size: clamp(2.2rem, 10vw, 3rem);
    line-height: 1.05;
    color: var(--premium);
  }
  .form {
    margin-top: 28px;
    padding: 20px;
  }
  .hint {
    margin: 10px 2px 18px;
    font-size: 0.86rem;
  }
  .state {
    margin-top: 10vh;
    padding: 28px 22px;
    text-align: center;
    display: grid;
    gap: 10px;
    justify-items: center;
  }
  .state h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .state p {
    margin: 0 0 8px;
  }
</style>
