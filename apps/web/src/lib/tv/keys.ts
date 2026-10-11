export type TvKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'menu'
  | 'playpause'
  | 'forward'
  | 'rewind';

const KEYBOARD: Record<string, TvKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  ' ': 'select',
  Escape: 'back',
  Backspace: 'back',
  GoBack: 'back',
  BrowserBack: 'back',
  ContextMenu: 'menu',
  m: 'menu',
  M: 'menu',
  MediaPlayPause: 'playpause',
  MediaPlay: 'playpause',
  MediaPause: 'playpause',
  p: 'playpause',
  MediaFastForward: 'forward',
  MediaTrackNext: 'forward',
  MediaRewind: 'rewind',
  MediaTrackPrevious: 'rewind'
};

/** Map a browser keyboard event (desktop testing, or a WebView without the native bridge). */
export function fromKeyboard(e: KeyboardEvent): TvKey | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return null;
  return KEYBOARD[e.key] ?? null;
}

const NATIVE_NAMES = new Set<TvKey>([
  'up',
  'down',
  'left',
  'right',
  'select',
  'back',
  'menu',
  'playpause',
  'forward',
  'rewind'
]);

export function fromNative(name: string): TvKey | null {
  return NATIVE_NAMES.has(name as TvKey) ? (name as TvKey) : null;
}
