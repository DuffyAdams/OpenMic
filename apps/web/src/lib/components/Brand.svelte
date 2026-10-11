<script lang="ts">
  interface Props {
    /** Pixels, or any CSS length (the TV uses rem so it scales with the screen). */
    size?: number | string;
    label?: boolean;
  }
  let { size = 30, label = true }: Props = $props();
  const css = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<span class="brand">
  <svg class="brand-mark" style:width={css} style:height={css} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill="var(--accent)" />
    <circle cx="32" cy="22" r="9" fill="none" stroke="#000" stroke-width="4.5" />
    <path
      d="M27 31l-7 20h6l6-12 6 12h6l-7-20"
      fill="none"
      stroke="#000"
      stroke-width="4.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
  {#if label}<span>OpenMic</span>{/if}
</span>
