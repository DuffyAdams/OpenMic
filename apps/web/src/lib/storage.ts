import type { Credentials } from './types';

/**
 * The /sim page runs the TV and phones as same-origin iframes named `sim:<device>`. Each one gets
 * its own key namespace so they behave like separate devices instead of sharing one identity.
 */
export const SIM_PREFIX = 'sim:';
const simNamespace = (device: string) => `${SIM_PREFIX}${device}|`;
const ownNamespace = (() => {
  try {
    return window !== window.top && window.name.startsWith(SIM_PREFIX) ? `${window.name}|` : '';
  } catch {
    return '';
  }
})();

export type Store = ReturnType<typeof scopedStore>;

/** localStorage that never throws (private mode, blocked storage, quota). */
function scopedStore(namespace: string) {
  return {
    get<T>(key: string): T | null {
      try {
        const raw = localStorage.getItem(namespace + key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    set(key: string, value: unknown): void {
      try {
        localStorage.setItem(namespace + key, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
    remove(key: string): void {
      try {
        localStorage.removeItem(namespace + key);
      } catch {
        /* ignore */
      }
    }
  };
}

const partyKey = (code: string) => `ok:party:${code.toUpperCase()}`;

function credentialsIn(store: Store) {
  return {
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
}

function prefsIn(store: Store) {
  return {
    get name(): string {
      return store.get<string>('ok:name') ?? '';
    },
    set name(v: string) {
      store.set('ok:name', v);
    },
    /** Picture key from $lib/avatars, remembered for the next party. */
    get avatar(): string {
      return store.get<string>('ok:avatar') ?? '';
    },
    set avatar(v: string) {
      store.set('ok:avatar', v);
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
}

export const store = scopedStore(ownNamespace);
export const credentials = credentialsIn(store);
export const prefs = prefsIn(store);

/** Storage of one simulated device on the /sim page, as that device's frame sees it. */
export function simDevice(device: string) {
  const s = scopedStore(simNamespace(device));
  return { store: s, credentials: credentialsIn(s), prefs: prefsIn(s) };
}

/** Forget a simulated device, or all of them (fresh TV identity, phones that never joined). */
export function clearSimDevices(device?: string): void {
  const prefix = device ? simNamespace(device) : SIM_PREFIX;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
