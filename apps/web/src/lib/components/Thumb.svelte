<script lang="ts">
  import { thumbnail } from '$lib/youtube';

  interface Props {
    videoId: string;
    src?: string;
    width?: string;
    radius?: string;
    alt?: string;
    /** Crop to a square, like album art. */
    square?: boolean;
  }
  let {
    videoId,
    src = '',
    width = '112px',
    radius = 'var(--radius-sm)',
    alt = '',
    square = false
  }: Props = $props();
  let failed = $state(false);
  const url = $derived(failed || !src ? thumbnail(videoId, 'mq') : src);
</script>

<div class="thumb" class:square style:width style:border-radius={radius}>
  <img src={url} {alt} loading="lazy" decoding="async" onerror={() => (failed = true)} />
</div>

<style>
  .thumb {
    position: relative;
    flex: none;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: var(--surface-2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  .square {
    aspect-ratio: 1;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
