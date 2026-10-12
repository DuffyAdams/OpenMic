<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  import { api, ApiError } from '$lib/api';
  import Icon from '$lib/components/Icon.svelte';
  import RoomShell from '$lib/components/room/RoomShell.svelte';
  import { PartyClient } from '$lib/party.svelte';
  import { credentials } from '$lib/storage';
  import { singsOn } from '$lib/format';
  import { haptic, toasts } from '$lib/toast.svelte';
  import type { PublicConfig, RoomEvent, RoomState } from '$lib/types';

  const code = (page.params.code ?? '').toUpperCase();
  const creds = credentials.get(code);

  const fallbackConfig: PublicConfig = {
    app_name: 'OpenMic',
    version: '',
    search_enabled: true,
    search_provider: 'youtube',
    public_base_url: '',
    admin_configured: true
  };
  let party = $state<PartyClient | null>(null);
  let loadError = $state('');

  onMount(async () => {
    if (!creds) {
      goto(`${base}/join/${code}`, { replaceState: true });
      return;
    }
    const config = await api<PublicConfig>('/api/config').catch(() => fallbackConfig);
    const client = new PartyClient(creds, config);
    try {
      client.room.apply(await client.call<RoomState>(`/api/sessions/${creds.sessionId}/state`));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        credentials.clear(code);
        goto(`${base}/join/${code}`, { replaceState: true });
        return;
      }
      loadError = e instanceof ApiError ? e.message : 'Could not load the party.';
    }
    client.room.connect(
      () => ({ token: creds.token }),
      (closeCode) => {
        if (closeCode === 4403) client.fatal = 'removed';
        else if (closeCode === 4401) client.fatal = 'expired';
        // 4410 (party ended): the final room_state already arrived and shows the ended screen.
      }
    );
    client.room.onEvent((e) => notify(client, e));
    party = client;
  });

  onDestroy(() => party?.destroy());

  function notify(client: PartyClient, e: RoomEvent) {
    const me = client.creds.participantId;
    if (e.event === 'track_started' && (e.data.participant_id === me || e.data.partner_id === me)) {
      haptic([80, 60, 80]);
      const partner = e.data.participant_id === me ? e.data.partner : e.data.singer;
      toasts.show({
        kind: 'gold',
        title: partner ? `You're on with ${partner}!` : "You're on! Grab the mic",
        body: e.data.title,
        timeout: 7000
      });
    } else if (e.event === 'track_failed' && e.data.participant_id === me) {
      haptic([40, 40, 40]);
      toasts.show({
        kind: 'error',
        title: "Your song couldn't play",
        body: `${e.data.reason ?? 'Video unavailable'}. Try another version.`,
        timeout: 10000,
        action: { label: 'Find', run: () => client.findAnotherVersion(e.data.title ?? '') }
      });
    } else if (e.event === 'host_changed' && e.data.participant_id === me) {
      toasts.show({ kind: 'gold', title: "You're now a host", body: 'Find the controls in the Host tab.' });
    }
  }

  // "You're up next" — once, when one of my songs reaches the front while someone is singing.
  let lastNextId = '';
  $effect(() => {
    const s = party?.state;
    const first = s?.queue[0];
    if (!party || !s?.now_playing || !first) return;
    if (singsOn(first, party.creds.participantId) && first.id !== lastNextId) {
      lastNextId = first.id;
      haptic([30, 50, 30]);
      const duet = first.partner ? ' (duet)' : '';
      toasts.show({ kind: 'gold', title: "You're up next!", body: `Get ready for “${first.title}”${duet}.`, timeout: 6000 });
    }
  });

  function leave() {
    credentials.clear(code);
    goto(`${base}/`);
  }
</script>

<svelte:head><title>{party?.state?.session.title ?? 'Party'} · OpenMic</title></svelte:head>

<!-- The room has its own header wash that scrolls away; other screens use the fixed one. -->
{#if !party?.state || party.fatal || party.ended}<div class="lounge-bg"></div>{/if}

{#if party?.fatal}
  <main class="page center">
    <div class="ended card">
      <Icon name="logout" size={30} />
      <h1>{party.fatal === 'removed' ? 'You were removed from the party' : 'Your session expired'}</h1>
      <p class="muted">You can rejoin with the code on the TV.</p>
      <button class="btn btn-primary" onclick={() => { credentials.clear(code); goto(`${base}/join/${code}`); }}>Rejoin</button>
    </div>
  </main>
{:else if party?.ended && party.state}
  {@const s = party.state}
  {@const sung = s.history.filter((i) => i.status === 'completed')}
  {@const mine = sung.filter((i) => creds && singsOn(i, creds.participantId))}
  <main class="page center">
    <div class="ended card">
      <p class="eyebrow">That's a wrap</p>
      <h1 class="display">Thanks for singing!</h1>
      <p class="muted">
        {s.session.title} has ended. {sung.length} {sung.length === 1 ? 'song was' : 'songs were'} sung{#if mine.length}, {mine.length} by you{/if}.
      </p>
      <button class="btn btn-primary" onclick={leave}>Done</button>
    </div>
  </main>
{:else if party?.state}
  <RoomShell {party} />
{:else if loadError}
  <main class="page center">
    <div class="ended card">
      <Icon name="wifiOff" size={30} />
      <h1>Can't reach the party</h1>
      <p class="muted">{loadError}</p>
      <button class="btn btn-primary" onclick={() => location.reload()}>Try again</button>
    </div>
  </main>
{:else}
  <main class="page center"><span class="loader" aria-label="Loading"></span></main>
{/if}

<style>
  .center {
    display: grid;
    place-items: center;
  }
  .ended {
    padding: 30px 24px;
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 10px;
  }
  .ended h1 {
    margin: 4px 0 0;
    font-size: 1.9rem;
    line-height: 1.15;
  }
  .ended p {
    margin: 0 0 10px;
  }
  .loader {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid var(--surface-3);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
</style>
