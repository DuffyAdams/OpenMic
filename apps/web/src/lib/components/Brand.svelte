<script lang="ts">
  import {
    MIC_ARCS,
    MIC_ARCS_WIDTH,
    MIC_BODY,
    MIC_HEAD,
    MIC_TRANSFORM,
    WORDMARK_MIC,
    WORDMARK_OPEN,
    WORDMARK_VIEWBOX
  } from '$lib/brand';

  interface Props {
    /** Height of the mark: pixels, or any CSS length (the TV uses rem so it scales with the screen). */
    size?: number | string;
    label?: boolean;
  }
  let { size = 30, label = true }: Props = $props();
  const css = $derived(typeof size === 'number' ? `${size}px` : size);
  const shine = $props.id();
</script>

<!-- Colours come from the theme tokens, so the logo wears the party's theme. -->
<span class="brand" style:--brand-size={css}>
  <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id={shine} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.38" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.22" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="32" fill="var(--accent)" />
    <circle cx="32" cy="32" r="32" fill="url(#{shine})" />
    <g fill="var(--accent-ink)" transform={MIC_TRANSFORM}>
      <path d={MIC_HEAD} fill-rule="evenodd" />
      <path d={MIC_BODY} />
    </g>
    <path d={MIC_ARCS} fill="none" stroke="var(--accent-ink)" stroke-width={MIC_ARCS_WIDTH} stroke-linecap="round" />
  </svg>
  {#if label}
    <svg class="brand-word" viewBox={WORDMARK_VIEWBOX} role="img" aria-label="OpenMic">
      <path d={WORDMARK_OPEN} fill="currentColor" />
      <path d={WORDMARK_MIC} fill="var(--accent)" />
    </svg>
  {/if}
</span>
