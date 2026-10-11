import { getContext, setContext } from 'svelte';
import { api, ApiError, randomId } from './api';
import { RoomStore, Ticker } from './room.svelte';
import { toasts } from './toast.svelte';
import type {
  Command,
  Credentials,
  DuetPartner,
  EnqueueResponse,
  PublicConfig,
  RoomState,
  SettingsUpdate,
  Video
} from './types';

export type Tab = 'search' | 'queue' | 'mine' | 'host';
export type Fatal = 'expired' | 'removed' | null;

/** Everything the guest/host phone UI needs for one party. */
export class PartyClient {
  readonly room = new RoomStore();
  readonly ticker = new Ticker(1000);
  readonly creds: Credentials;
  readonly config: PublicConfig;

  tab = $state<Tab>('search');
  searchPrefill = $state<{ q: string; n: number } | null>(null);
  fatal = $state<Fatal>(null);

  state = $derived(this.room.state);
  me = $derived(this.room.state?.participants.find((p) => p.id === this.creds.participantId));
  isHost = $derived(this.me?.role === 'host');
  ended = $derived(this.room.state?.session.status === 'ended');
  /** Video IDs that are queued or on stage, for "already in queue" hints. */
  queuedVideos = $derived.by(() => {
    const s = this.room.state;
    const map = new Map<string, string>();
    if (!s) return map;
    if (s.now_playing) map.set(s.now_playing.video_id, s.now_playing.singer);
    for (const item of s.queue) if (!map.has(item.video_id)) map.set(item.video_id, item.singer);
    return map;
  });

  constructor(creds: Credentials, config: PublicConfig) {
    this.creds = creds;
    this.config = config;
  }

  get sid() {
    return this.creds.sessionId;
  }

  async call<T>(path: string, opts: Parameters<typeof api>[1] = {}): Promise<T> {
    try {
      return await api<T>(path, { ...opts, token: this.creds.token });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) this.fatal = 'expired';
      throw e;
    }
  }

  /** Run a mutation that returns RoomState; show errors as toasts. */
  async mutate(path: string, opts: Parameters<typeof api>[1] = {}): Promise<RoomState | null> {
    try {
      const state = await this.call<RoomState>(path, opts);
      if (state && 'version' in state) this.room.apply(state);
      return state;
    } catch (e) {
      toasts.error(e instanceof ApiError ? e.message : 'Something went wrong');
      return null;
    }
  }

  async enqueue(video: Video, duet: DuetPartner = {}): Promise<EnqueueResponse> {
    const key = randomId();
    const send = () =>
      this.call<EnqueueResponse>(`/api/sessions/${this.sid}/queue`, {
        method: 'POST',
        body: { video_id: video.video_id, idempotency_key: key, ...duet }
      });
    let res: EnqueueResponse;
    try {
      res = await send();
    } catch (e) {
      // A flaky connection may drop the response; retrying with the same key is safe.
      if (e instanceof ApiError && e.code === 'network') res = await send();
      else throw e;
    }
    this.room.apply(res.state);
    return res;
  }

  cancel(itemId: string) {
    return this.mutate(`/api/sessions/${this.sid}/queue/${itemId}`, { method: 'DELETE' });
  }
  /** Make a song a duet, change the partner, or (with `{}`) make it solo again. */
  setPartner(itemId: string, duet: DuetPartner) {
    return this.mutate(`/api/sessions/${this.sid}/queue/${itemId}/partner`, {
      method: 'PUT',
      body: duet
    });
  }
  move(itemId: string, toIndex: number) {
    return this.mutate(`/api/sessions/${this.sid}/queue/${itemId}/move`, {
      method: 'POST',
      body: { to_index: toIndex }
    });
  }
  requeue(itemId: string) {
    return this.mutate(`/api/sessions/${this.sid}/queue/${itemId}/requeue`, { method: 'POST' });
  }
  command(command: Command, expectedItemId?: string) {
    return this.mutate(`/api/sessions/${this.sid}/commands`, {
      method: 'POST',
      body: { command, expected_item_id: expectedItemId ?? null }
    });
  }
  settings(patch: SettingsUpdate) {
    return this.mutate(`/api/sessions/${this.sid}/settings`, { method: 'PATCH', body: patch });
  }
  end() {
    return this.mutate(`/api/sessions/${this.sid}/end`, { method: 'POST' });
  }
  removeGuest(participantId: string) {
    return this.mutate(`/api/sessions/${this.sid}/participants/${participantId}`, {
      method: 'DELETE'
    });
  }
  promote(participantId: string) {
    return this.mutate(`/api/sessions/${this.sid}/participants/${participantId}/host`, {
      method: 'POST'
    });
  }

  findAnotherVersion(title: string) {
    const q = title
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/\b(karaoke|lyrics?|instrumental|version|official|video|hd|4k)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    this.searchPrefill = { q: q || title, n: Date.now() };
    this.tab = 'search';
  }

  destroy() {
    this.room.disconnect();
    this.ticker.stop();
  }
}

const KEY = Symbol('party');
export const setParty = (p: PartyClient) => setContext(KEY, p);
export const useParty = () => getContext<PartyClient>(KEY);
