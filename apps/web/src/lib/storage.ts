import { base } from '$app/paths';
import type { Credentials } from './types';

/** localStorage that never throws (private mode, blocked storage, quota). */
export const store = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(base ? `${base}:${key}` : key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(base ? `${base}:${key}` : key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(base ? `${base}:${key}` : key);
    } catch {
      /* ignore */
    }
  }
};

const partyKey = (code: string) => `ok:party:${code.toUpperCase()}`;

export const credentials = {
  get: (code: string) => store.get<Credentials>(partyKey(code)),
  set: (c: Credentials) => {
    store.set(partyKey(c.joinCode), c);
    store.set('ok:last', c.joinCode);
  },
  clear: (code: string) => {
    store.remove(partyKey(code));
    if (store.get<string>('ok:last') === code.toUpperCase()) store.remove('ok:last');
  },
  /** The most recent party this phone joined (for a "continue" shortcut). */
  last: (): Credentials | null => {
    const code = store.get<string>('ok:last');
    return code ? store.get<Credentials>(partyKey(code)) : null;
  }
};

export const prefs = {
  get name(): string {
    return store.get<string>('ok:name') ?? '';
  },
  set name(v: string) {
    store.set('ok:name', v);
  },
  get recentSearches(): string[] {
    return store.get<string[]>('ok:recent') ?? [];
  },
  addRecentSearch(q: string) {
    const list = [q, ...this.recentSearches.filter((x) => x.toLowerCase() !== q.toLowerCase())];
    store.set('ok:recent', list.slice(0, 6));
  },
  get adminToken(): string | null {
    return store.get<string>('ok:admin');
  },
  set adminToken(v: string | null) {
    if (v) store.set('ok:admin', v);
    else store.remove('ok:admin');
  }
};
