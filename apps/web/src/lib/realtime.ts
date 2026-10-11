import type { ServerMessage } from './types';

export type SocketStatus = 'connecting' | 'online' | 'reconnecting' | 'closed';

/** Close codes after which reconnecting is pointless (bad/expired credentials, party over). */
const FATAL_CODES = new Set([4400, 4401, 4403, 4404, 4410]);
const PING_EVERY_MS = 20000;
const PONG_TIMEOUT_MS = 9000;

interface Handlers {
  onMessage(msg: ServerMessage): void;
  onStatus?(status: SocketStatus): void;
  onFatal?(code: number): void;
}

export interface SocketAuth {
  token: string;
  session_id?: string;
}

/**
 * WebSocket with first-message auth, heartbeat, and exponential-backoff reconnect.
 * The server sends a full snapshot after every (re)connect, so nothing needs replaying.
 */
export class RoomSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private stopped = true;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private auth: () => SocketAuth;
  private h: Handlers;

  constructor(auth: () => SocketAuth, handlers: Handlers) {
    this.auth = auth;
    this.h = handlers;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    document.addEventListener('visibilitychange', this.wake);
    window.addEventListener('online', this.wake);
    this.open();
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.wake);
    window.removeEventListener('online', this.wake);
    this.clearTimers();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
    this.h.onStatus?.('closed');
  }

  send(msg: object): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Reconnect immediately when the phone wakes up or the network returns. */
  private wake = () => {
    if (this.stopped || document.visibilityState === 'hidden') return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.attempts = 0;
      this.open();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.ping();
    }
  };

  private open(): void {
    this.h.onStatus?.(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${scheme}://${location.host}/api/ws`);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', ...this.auth() }));
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'hello') {
        this.attempts = 0;
        this.h.onStatus?.('online');
        this.startHeartbeat();
      } else if (msg.type === 'pong') {
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
      this.h.onMessage(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.clearTimers();
      this.ws = null;
      if (FATAL_CODES.has(e.code)) {
        this.stopped = true;
        this.h.onStatus?.('closed');
        this.h.onFatal?.(e.code);
        return;
      }
      this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    this.h.onStatus?.('reconnecting');
    const base = Math.min(10000, 600 * 2 ** this.attempts);
    const delay = base * (0.75 + Math.random() * 0.5);
    this.attempts++;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private startHeartbeat(): void {
    this.clearTimers();
    this.pingTimer = setInterval(() => this.ping(), PING_EVERY_MS);
  }

  private ping(): void {
    if (!this.send({ type: 'ping' })) return;
    if (this.pongTimer) clearTimeout(this.pongTimer);
    // A silent socket (e.g. Wi-Fi dropped without a FIN) gets recycled.
    this.pongTimer = setTimeout(() => this.ws?.close(4000), PONG_TIMEOUT_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }
}
