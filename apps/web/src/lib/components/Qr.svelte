<script lang="ts">
  import QRCode from 'qrcode';

  interface Props {
    value: string;
    size?: string;
    label?: string;
  }
  let { value, size = '100%', label = 'QR code' }: Props = $props();

  let svg = $state('');
  $effect(() => {
    const v = value;
    QRCode.toString(v, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      color: { dark: '#000000', light: '#00000000' }
    }).then((out) => {
      if (v === value) svg = out;
    });
  });
</script>

<div class="qr" role="img" aria-label={label} style:width={size} style:height={size}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html svg}
</div>

<style>
  .qr {
    display: block;
    line-height: 0;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    shape-rendering: crispEdges;
  }
</style>
