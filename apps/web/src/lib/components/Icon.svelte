<script lang="ts" module>
  // 24×24 stroke icons drawn for OpenMic.
  const PATHS = {
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2',
    queue: 'M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
    duet: 'M7 3a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 7 3ZM17 3a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 17 3ZM3 9.5a4 4 0 0 0 8 0M13 9.5a4 4 0 0 0 8 0M7 13.5V21M17 13.5V21',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
    sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5',
    play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
    pause: 'M8 5v14M16 5v14',
    skip: 'M6 5.5v13l9-6.5-9-6.5ZM18 5v14',
    restart: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5',
    x: 'M6 6l12 12M18 6 6 18',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    right: 'M9 6l6 6-6 6',
    left: 'M15 6l-6 6 6 6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    tv: 'M3.5 6.5h17v11h-17zM8 21h8M12 17.5V21',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    alert: 'M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17.5h.01',
    crown: 'M4 18h16M5 15 3.5 7l5 3.5L12 5l3.5 5.5 5-3.5L19 15H5Z',
    trash: 'M4.5 7h15M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    plus: 'M12 5v14M5 12h14',
    music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
    wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 5-2.6M19 12.8a10 10 0 0 0-2.3-1.7M1.8 9a15 15 0 0 1 4.2-2.6M22.2 9a15 15 0 0 0-9.5-3.9M12 20h.01',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
    history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4.5V9H8M12 8v4.5l3 2',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
    paste: 'M9 4h6v3H9zM8 5.5H6v15h12v-15h-2',
    arrowRight: 'M5 12h14M13 6l6 6-6 6'
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    /** Pixels, or a CSS length such as "1.75rem" (the TV scales icons with the screen). */
    size?: number | string;
    stroke?: number;
    fill?: boolean;
    class?: string;
  }
  let { name, size = 22, stroke = 1.9, fill = false, class: klass = '' }: Props = $props();
  const css = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<svg
  class={klass}
  style:width={css}
  style:height={css}
  viewBox="0 0 24 24"
  fill={fill ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
