import type { Theme } from './types';

/**
 * Looks a host can give the party. The server stores only the key; a theme is a block of token
 * overrides in styles/themes/ (keyed on <html data-theme>) plus, optionally, animated effects
 * from lib/fx. The TV, the room and the join page wear the party's theme; other pages stay Classic.
 */
export interface ThemeInfo {
  id: Theme;
  name: string;
  hint: string;
  /** Browser chrome colour (meta theme-color); matches the theme's --bg. */
  chrome: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'classic', name: 'Classic', hint: 'Purple stage lights', chrome: '#121212' },
  { id: 'halloween', name: 'Halloween', hint: 'Bats, spiders and a haunted moon', chrome: '#0b0710' }
];

export function themeInfo(id: string | null | undefined): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** The next theme in the list, for a single remote button that cycles through them. */
export function nextTheme(id: Theme): Theme {
  const i = THEMES.findIndex((t) => t.id === id);
  return THEMES[(i + 1) % THEMES.length].id;
}

/** Dresses the page in a theme. Returns a cleanup that puts Classic back (use from an $effect). */
export function wearTheme(id: Theme): () => void {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const set = (t: ThemeInfo) => {
    if (t.id === 'classic') delete root.dataset.theme;
    else root.dataset.theme = t.id;
    meta?.setAttribute('content', t.chrome);
  };
  set(themeInfo(id));
  return () => set(THEMES[0]);
}
