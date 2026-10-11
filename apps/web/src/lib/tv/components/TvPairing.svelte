<script lang="ts">
  import Brand from '$lib/components/Brand.svelte';
  import Qr from '$lib/components/Qr.svelte';
  import { useTv } from '../context';
  import { focusScope } from '../focus';

  const tv = useTv();
  const code = $derived(tv.pairing?.code ?? '');
  const url = $derived(`${location.origin}/admin/pair?code=${code}`);
  const host = location.host;
</script>

<section class="tv-screen pairing" use:focusScope>
  <div class="tv-glow"></div>
  <header><Brand size="2.75rem" /></header>
  <div class="body">
    <div class="text">
      <p class="tv-eyebrow">One-time setup</p>
      <h1 class="tv-display">Pair this TV</h1>
      <ol>
        <li>On your phone, scan the code — or open <strong>{host}/admin</strong></li>
        <li>Sign in with your host password</li>
        <li>Confirm this pairing code:</li>
      </ol>
      <p class="code tv-mono">{#each code.split('') as ch, i (i)}<span>{ch}</span>{/each}</p>
      <p class="note">This screen updates by itself once the TV is paired.</p>
    </div>
    <div class="qr-card"><Qr value={url} label="Scan to pair this TV" /></div>
  </div>
</section>

<style>
  .pairing {
    display: flex;
    flex-direction: column;
  }
  header {
    position: relative;
    font-size: 1.6rem;
  }
  .body {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6rem;
  }
  h1 {
    margin: 1rem 0 2.5rem;
    font-size: 6.5rem;
  }
  ol {
    margin: 0 0 2rem;
    padding-left: 2.2rem;
    font-size: 2rem;
    line-height: 1.9;
    color: var(--text-2);
  }
  ol strong {
    color: var(--accent);
  }
  .code {
    display: flex;
    gap: 0.8rem;
    margin: 0;
  }
  .code span {
    display: inline-grid;
    place-items: center;
    width: 6rem;
    height: 7.5rem;
    border-radius: 1.25rem;
    background: var(--surface);
    border: 0.0625rem solid var(--border-strong);
    font-size: 4.6rem;
    font-weight: 800;
  }
  .note {
    margin: 2rem 0 0;
    font-size: 1.5rem;
    color: var(--text-3);
  }
  .qr-card {
    flex: none;
    width: 26rem;
    height: 26rem;
    padding: 2rem;
    border-radius: 1rem;
    background: #fff;
  }
</style>
