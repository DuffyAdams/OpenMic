<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api';
  import { avatarInfo, randomAvatar } from '$lib/avatars';
  import AvatarPicker from '$lib/components/AvatarPicker.svelte';
  import Brand from '$lib/components/Brand.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { credentials, prefs } from '$lib/storage';
  import type { JoinResponse } from '$lib/types';

  let invite = $state('');
  let name = $state(prefs.name || credentials.last()?.displayName || '');
  let avatar = $state(avatarInfo(prefs.avatar)?.id ?? randomAvatar());
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    invite = decodeURIComponent(location.hash.replace(/^#/, ''));
    // Keep the invite out of browser history once read.
    history.replaceState(null, '', location.pathname);
    if (!invite) error = 'This host link is incomplete. Open it again from the TV menu.';
  });

  async function claim(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      // If this phone already joined (any party), offer that identity; the server only upgrades
      // it when it belongs to the same party, otherwise it creates a new host.
      const last = credentials.last();
      const r = await api<JoinResponse>('/api/host/claim', {
        method: 'POST',
        token: last?.token,
        body: { invite, display_name: name.trim() || 'Host', avatar }
      });
      if (name.trim()) prefs.name = name.trim();
      prefs.avatar = avatar;
      credentials.set({
        token: r.token,
        participantId: r.participant.id,
        sessionId: r.session_id,
        joinCode: r.join_code,
        displayName: r.participant.display_name,
        avatar: r.participant.avatar
      });
      await goto(`/room/${r.join_code}`, { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Something went wrong.';
      busy = false;
    }
  }
</script>

<svelte:head><title>Become the host · OpenMic</title></svelte:head>

<div class="lounge-bg"></div>
<main class="page">
  <header><Brand /></header>
  <section class="intro">
    <span class="crown"><Icon name="crown" size={28} /></span>
    <p class="eyebrow">Host controls</p>
    <h1 class="display">Run the show from your phone</h1>
    <p class="muted">Pause, skip, reorder the queue and change party settings. You can still queue your own songs.</p>
  </section>
  <form class="card form" onsubmit={claim}>
    <label class="field-label" for="name">Your name</label>
    <input id="name" class="input" bind:value={name} maxlength="24" placeholder="Host" autocomplete="nickname" />
    <AvatarPicker bind:value={avatar} />
    <button class="btn btn-gold btn-lg btn-block" disabled={busy || !invite}>
      {busy ? 'Connecting…' : 'Become the host'}
    </button>
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  </form>
</main>

<style>
  header {
    margin-bottom: 7vh;
  }
  .crown {
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: var(--premium-soft);
    color: var(--premium);
    margin-bottom: 18px;
  }
  h1 {
    margin: 8px 0 10px;
    font-size: clamp(2rem, 9vw, 2.6rem);
    line-height: 1.08;
  }
  .form {
    margin-top: 26px;
    padding: 20px;
    display: grid;
    gap: 14px;
  }
  .form .field-label {
    margin: 0;
  }
</style>
