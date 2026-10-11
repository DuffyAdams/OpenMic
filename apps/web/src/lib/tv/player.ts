/**
 * Player adapters for the TV screen.
 *
 * YouTubePlayer wraps the official YouTube IFrame Player API — the only supported way to play
 * YouTube content here. Nothing is ever downloaded or proxied. FakePlayer simulates playback for
 * automated tests and offline demos (`/tv?player=fake`).
 */

export type PlayerState = 'unstarted' | 'cued' | 'buffering' | 'playing' | 'paused' | 'ended';

export interface PlayerAdapter {
  readonly kind: 'youtube' | 'fake';
  ready: Promise<void>;
  /** Load a video without playing (shows its thumbnail, starts buffering metadata). */
  cue(videoId: string, startSeconds?: number): void;
  /** Load and immediately play. */
  load(videoId: string, startSeconds?: number): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(seconds: number): void;
  time(): number;
  duration(): number;
  state(): PlayerState;
  onState(fn: (s: PlayerState) => void): void;
  onError(fn: (code: string) => void): void;
  destroy(): void;
}

// --- Minimal typings for the IFrame API --------------------------------------------------

interface YTPlayer {
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      width?: string | number;
      height?: string | number;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
}

const STATE_MAP: Record<number, PlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued'
};

let apiPromise: Promise<YTNamespace> | null = null;

function loadIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const existing = window.YT as YTNamespace | undefined;
    if (existing?.Player) return resolve(existing);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT as YTNamespace);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Could not load the YouTube player. Check the internet connection.'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export class YouTubePlayer implements PlayerAdapter {
  readonly kind = 'youtube' as const;
  ready: Promise<void>;
  private p: YTPlayer | null = null;
  private stateFns: ((s: PlayerState) => void)[] = [];
  private errorFns: ((c: string) => void)[] = [];
  private current: { id: string; start: number } | null = null;
  private lastState: PlayerState = 'unstarted';

  constructor(host: HTMLElement) {
    this.ready = loadIframeApi().then(
      (YT) =>
        new Promise<void>((resolve) => {
          const mount = document.createElement('div');
          host.appendChild(mount);
          this.p = new YT.Player(mount, {
            width: '100%',
            height: '100%',
            host: 'https://www.youtube.com',
            playerVars: {
              autoplay: 0,
              controls: 1, // keep YouTube's own controls and branding
              disablekb: 1, // the remote drives our UI, not the iframe
              fs: 0,
              iv_load_policy: 3,
              playsinline: 1,
              rel: 0,
              enablejsapi: 1,
              origin: location.origin
            },
            events: {
              onReady: () => {
                const iframe = this.p?.getIframe();
                if (iframe) {
                  iframe.setAttribute('tabindex', '-1');
                  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                  iframe.title = 'YouTube video player';
                }
                resolve();
              },
              onStateChange: (e) => {
                const s = STATE_MAP[e.data] ?? 'unstarted';
                this.lastState = s;
                for (const fn of this.stateFns) fn(s);
              },
              onError: (e) => {
                for (const fn of this.errorFns) fn(String(e.data));
              }
            }
          });
        })
    );
  }

  cue(videoId: string, startSeconds = 0) {
    this.current = { id: videoId, start: startSeconds };
    this.ready.then(() => this.p?.cueVideoById({ videoId, startSeconds }));
  }
  load(videoId: string, startSeconds = 0) {
    this.current = { id: videoId, start: startSeconds };
    this.ready.then(() => this.p?.loadVideoById({ videoId, startSeconds }));
  }
  play() {
    this.ready.then(() => this.p?.playVideo());
  }
  pause() {
    this.ready.then(() => this.p?.pauseVideo());
  }
  stop() {
    this.current = null;
    this.ready.then(() => this.p?.stopVideo());
  }
  seek(seconds: number) {
    this.ready.then(() => this.p?.seekTo(seconds, true));
  }
  time() {
    try {
      return this.p?.getCurrentTime() ?? 0;
    } catch {
      return 0;
    }
  }
  duration() {
    try {
      return this.p?.getDuration() ?? 0;
    } catch {
      return 0;
    }
  }
  state() {
    return this.lastState;
  }
  onState(fn: (s: PlayerState) => void) {
    this.stateFns.push(fn);
  }
  onError(fn: (c: string) => void) {
    this.errorFns.push(fn);
  }
  destroy() {
    this.p?.destroy();
    this.p = null;
  }
}

/**
 * Deterministic stand-in for tests/demos. Videos last `?fakeDuration=` seconds (default 20).
 * IDs starting with "blocked" or "err" fail with error 150, like an embed-disabled video.
 */
export class FakePlayer implements PlayerAdapter {
  readonly kind = 'fake' as const;
  ready = Promise.resolve();
  private stateFns: ((s: PlayerState) => void)[] = [];
  private errorFns: ((c: string) => void)[] = [];
  private s: PlayerState = 'unstarted';
  private videoId = '';
  private pos = 0;
  private dur: number;
  private tick: ReturnType<typeof setInterval> | null = null;
  private el: HTMLElement;

  constructor(host: HTMLElement, durationSeconds = 20) {
    this.dur = durationSeconds;
    this.el = document.createElement('div');
    this.el.className = 'fake-player';
    this.el.setAttribute('data-testid', 'fake-player');
    host.appendChild(this.el);
    this.render();
  }

  private set(state: PlayerState) {
    this.s = state;
    this.el.dataset.state = state;
    this.render();
    for (const fn of this.stateFns) fn(state);
  }
  private render() {
    this.el.innerHTML = `<div class="fp-inner"><div class="fp-label">Demo player</div><div class="fp-id">${this.videoId || '—'}</div><div class="fp-state">${this.s} · ${Math.floor(this.pos)}s / ${this.dur}s</div></div>`;
  }
  private fails() {
    return /^(blocked|err)/i.test(this.videoId);
  }

  cue(videoId: string, start = 0) {
    this.stopTick();
    this.videoId = videoId;
    this.pos = start;
    this.set('cued');
  }
  load(videoId: string, start = 0) {
    this.cue(videoId, start);
    this.play();
  }
  play() {
    if (!this.videoId) return;
    if (this.fails()) {
      setTimeout(() => this.errorFns.forEach((fn) => fn('150')), 200);
      return;
    }
    this.set('buffering');
    this.stopTick();
    setTimeout(() => {
      if (this.s !== 'buffering') return;
      this.set('playing');
      this.tick = setInterval(() => {
        this.pos += 0.25;
        if (this.pos >= this.dur) {
          this.pos = this.dur;
          this.stopTick();
          this.set('ended');
        } else if (Math.abs(this.pos - Math.round(this.pos)) < 0.01) {
          this.render();
        }
      }, 250);
    }, 300);
  }
  pause() {
    if (this.s === 'playing' || this.s === 'buffering') {
      this.stopTick();
      this.set('paused');
    }
  }
  stop() {
    this.stopTick();
    this.videoId = '';
    this.pos = 0;
    this.set('unstarted');
  }
  seek(seconds: number) {
    this.pos = Math.max(0, Math.min(seconds, this.dur));
    this.render();
  }
  time() {
    return this.pos;
  }
  duration() {
    return this.videoId ? this.dur : 0;
  }
  state() {
    return this.s;
  }
  onState(fn: (s: PlayerState) => void) {
    this.stateFns.push(fn);
  }
  onError(fn: (c: string) => void) {
    this.errorFns.push(fn);
  }
  private stopTick() {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }
  destroy() {
    this.stopTick();
    this.el.remove();
  }
}
