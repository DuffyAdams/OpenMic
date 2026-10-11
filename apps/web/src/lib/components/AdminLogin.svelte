<script lang="ts">
  import { api, ApiError } from '$lib/api';
  import { prefs } from '$lib/storage';
  import type { AdminLoginResponse } from '$lib/types';

  interface Props {
    onlogin: (token: string) => void;
    subtitle?: string;
  }
  let { onlogin, subtitle = 'Pair TVs and manage parties.' }: Props = $props();

  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const r = await api<AdminLoginResponse>('/api/admin/login', { method: 'POST', body: { password } });
      prefs.adminToken = r.token;
      onlogin(r.token);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Login failed.';
    } finally {
      busy = false;
    }
  }
</script>

<form class="card login" onsubmit={submit}>
  <h1 class="display">Host login</h1>
  <p class="muted">{subtitle}</p>
  <label class="field-label" for="pw">Admin password</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="pw" class="input" type="password" bind:value={password} autocomplete="current-password" autofocus />
  <button class="btn btn-primary btn-lg btn-block" disabled={busy || !password}>
    {busy ? 'Signing in…' : 'Sign in'}
  </button>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  <p class="faint small">The password is the <code>ADMIN_PASSWORD</code> set on your server.</p>
</form>

<style>
  .login {
    padding: 24px 20px;
    display: grid;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
  }
  p {
    margin: 0;
  }
  .field-label {
    margin: 8px 0 0;
  }
  .small {
    font-size: 0.84rem;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.85em;
    color: var(--text-2);
  }
</style>
