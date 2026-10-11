import { RoomSocket, type SocketAuth, type SocketStatus } from './realtime';
import type { ProgressMessage, RoomEvent, RoomState, ServerMessage } from './types';

/** Reactive holder for one party's live state (shared by guest, host and TV screens). */
export class RoomStore {
  state = $state<RoomState | null>(null);
  status = $state<SocketStatus>('connecting');
  progress = $state<ProgressMessage | null>(null);
  private progressAt = 0;
  private clockOffset = 0;
  private socket: RoomSocket | null = null;
  private listeners = new Set<(e: RoomEvent) => void>();
  private applyListeners = new Set<(s: RoomState) => void>();

  /** Keep the newest snapshot. Equal versions are accepted (presence refreshes). */
  apply(next: RoomState): void {
    const cur = this.state;
    if (cur && cur.session.id === next.session.id && next.version < cur.version) return;
    this.clockOffset = Date.parse(next.server_time) - Date.now();
    if (this.progress && this.progress.item_id !== next.playback.item_id) this.progress = null;
    this.state = next;
    for (const fn of this.applyListeners) fn(next);
  }

  /** Called after every accepted snapshot (the TV reconciles its player here). */
  onApply(fn: (s: RoomState) => void): () => void {
    this.applyListeners.add(fn);
    return () => this.applyListeners.delete(fn);
  }

  onEvent(fn: (e: RoomEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  connect(auth: () => SocketAuth, onFatal: (code: number) => void): void {
    this.socket?.stop();
    this.socket = new RoomSocket(auth, {
      onMessage: (msg) => this.handle(msg),
      onStatus: (s) => (this.status = s),
      onFatal
    });
    this.socket.start();
  }

  disconnect(): void {
    this.socket?.stop();
    this.socket = null;
  }

  send(msg: object): boolean {
    return this.socket?.send(msg) ?? false;
  }

  private handle(msg: ServerMessage): void {
    if (msg.type === 'room_state') this.apply(msg);
    else if (msg.type === 'event') for (const fn of this.listeners) fn(msg);
    else if (msg.type === 'progress') {
      if (msg.item_id === this.state?.playback.item_id) {
        this.progress = msg;
        this.progressAt = Date.now();
      }
    }
  }

  /** Best estimate of the current song's playback position, in seconds. */
  position(now = Date.now()): number {
    const s = this.state;
    if (!s?.now_playing || s.playback.phase !== 'playing') return 0;
    const total = s.now_playing.duration_seconds ?? this.progress?.duration ?? Infinity;
    let pos: number;
    if (this.progress) {
      const moving = this.progress.state === 'playing' && !s.playback.paused;
      pos = this.progress.position + (moving ? (now - this.progressAt) / 1000 : 0);
    } else if (s.playback.position_updated_at) {
      const at = Date.parse(s.playback.position_updated_at) - this.clockOffset;
      pos = s.playback.position_seconds + (s.playback.paused ? 0 : (now - at) / 1000);
    } else if (s.now_playing.started_at) {
      pos = (now + this.clockOffset - Date.parse(s.now_playing.started_at)) / 1000;
    } else {
      pos = 0;
    }
    return Math.max(0, Math.min(pos, total));
  }
}

/** A `now` value that ticks, for progress bars and countdowns. */
export class Ticker {
  now = $state(Date.now());
  private timer: ReturnType<typeof setInterval>;
  constructor(ms = 1000) {
    this.timer = setInterval(() => (this.now = Date.now()), ms);
  }
  stop() {
    clearInterval(this.timer);
  }
}
