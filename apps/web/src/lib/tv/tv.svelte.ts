import { api, ApiError } from '../api';
import { singers } from '../format';
import { RoomStore, Ticker } from '../room.svelte';
import { store } from '../storage';
import type {
  Command,
  HostInviteResponse,
  PublicConfig,
  RoomEvent,
  RoomState,
  SettingsUpdate,
  TvPlaybackResponse,
  TvRegisterResponse,
  TvSessionResponse,
  TvStatus
} from '../types';
import { activateFocused, moveFocus } from './focus';
import type { TvKey } from './keys';
import { native } from './native';
import { FakePlayer, YouTubePlayer, type PlayerAdapter, type PlayerState } from './player';

export const SECRET_KEY = 'ok:tv:secret';
const PROGRESS_EVERY_MS = 5000;
const AUTOPLAY_GRACE_MS = 12000;
const START_TIMEOUT_MS = 90000;
const UP_NEXT_REMINDER_S = 35;
const BANNER_MAX_AGE_MS = 15000; // queued banners older than this are stale; drop them

export type TvScreen = 'boot' | 'pairing' | 'lobby' | 'intro' | 'stage' | 'error' | 'ended';
export type MenuView = 'main' | 'host' | 'queue' | 'diag';

export interface Banner {
  id: number;
  kind: 'info' | 'gold' | 'error';
  title: string;
  body?: string;
  ms: number;
  at: number;
}

export interface Confirm {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The TV's brain. The server owns the queue; this class owns the player and reconciles it with
 * every snapshot (load the assigned item, honour pause/restart), reporting started/ended/failed
 * with the item's playback generation so duplicates and stale reports are harmless.
 */
export class TvController {
  readonly room = new RoomStore();
  readonly ticker = new Ticker(250);

  config = $state<PublicConfig | null>(null);
  sessionId = $state<string | null>(null);
  pairing = $state<{ code: string; expiresAt: string } | null>(null);
  bootError = $state('');

  menu = $state<MenuView | null>(null);
  controls = $state(false);
  joinPanel = $state(false);
  hostInvite = $state<{ url: string; expiresAt: number } | null>(null);
  confirm = $state<Confirm | null>(null);
  banners = $state<Banner[]>([]);

  playerState = $state<PlayerState>('unstarted');
  introEndsAt = $state(0);
  introHeldLeft = $state<number | null>(null);
  /** The countdown is over but the video hasn't started yet: the intro card stays up meanwhile. */
  starting = $state(false);
  needsGesture = $state(false);
  playerError = $state('');
  logs = $state<string[]>([]);

  screen = $derived.by((): TvScreen => {
    if (!this.sessionId) return this.pairing ? 'pairing' : 'boot';
    const s = this.room.state;
    if (!s || s.session.id !== this.sessionId) return 'boot';
    if (s.session.status === 'ended') return 'ended';
    // If autoplay is blocked, the stage has to show so its "Press OK" prompt is visible.
    const holding = this.starting && !this.needsGesture;
    switch (s.playback.phase) {
      case 'error':
        return 'error';
      case 'intro':
        return this.introEndsAt > 0 || this.introHeldLeft !== null || holding ? 'intro' : 'stage';
      case 'playing':
        return holding ? 'intro' : 'stage';
      default:
        return 'lobby';
    }
  });
  banner = $derived(this.banners[0] ?? null);

  private secret: string | null = store.get<string>(SECRET_KEY);
  private player: PlayerAdapter | null = null;
  private loadedKey = '';
  private startedKey = '';
  private endedKey = '';
  private failedKey = '';
  private reminderKey = '';
  private appliedRestart = 0;
  private bannerSeq = 1;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private optimisticUntil = 0;
  private destroyed = false;

  // --- Lifecycle ----------------------------------------------------------------------------

  /** `fake: null` = automatic: use the demo player when the server runs mock (fake) search. */
  async boot(playerHost: HTMLElement, opts: { fake: boolean | null; fakeDuration: number }) {
    this.config = await api<PublicConfig>('/api/config').catch(() => null);
    const fake = opts.fake ?? this.config?.search_provider === 'mock';
    this.player = fake ? new FakePlayer(playerHost, opts.fakeDuration) : new YouTubePlayer(playerHost);
    this.player.onState((s) => this.onPlayerState(s));
    this.player.onError((code) => this.onPlayerError(code));
    this.player.ready
      .then(() => this.log(`player ready (${this.player?.kind})`))
      .catch((e: Error) => {
        this.playerError = e.message;
        this.log(`player failed to load: ${e.message}`);
      });
    this.room.onApply((s) => this.sync(s));
    this.room.onEvent((e) => this.onEvent(e));
    this.progressTimer = setInterval(() => this.sendProgress(), PROGRESS_EVERY_MS);
    document.addEventListener('visibilitychange', this.onVisible);
    this.log(`booting at ${location.origin}${native.available ? ` (Fire TV app ${native.version})` : ''}`);
    await this.authenticate();
  }

  /** Returning from the Fire TV home screen: the WebView paused media, so re-apply the state. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    this.optimisticUntil = 0;
    const s = this.room.state;
    if (s) this.sync(s);
  };

  destroy() {
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    this.room.disconnect();
    this.ticker.stop();
    if (this.progressTimer) clearInterval(this.progressTimer);
    for (const t of this.timers.values()) clearTimeout(t);
    this.player?.destroy();
  }

  get joinBase(): string {
    return (this.config?.public_base_url || location.origin).replace(/\/$/, '');
  }

  get joinUrl(): string {
    const code = this.room.state?.session.join_code ?? '';
    return `${this.joinBase}/join/${code}`;
  }

  get playerKind() {
    return this.player?.kind ?? 'youtube';
  }

  log(msg: string) {
    const t = new Date().toLocaleTimeString([], { hour12: false });
    this.logs = [...this.logs.slice(-79), `${t}  ${msg}`];
  }

  private later(name: string, ms: number, fn: () => void) {
    this.cancel(name);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        fn();
      }, ms)
    );
  }
  private cancel(name: string) {
    const t = this.timers.get(name);
    if (t) clearTimeout(t);
    this.timers.delete(name);
  }

  // --- Device identity & party ----------------------------------------------------------------

  private async authenticate(): Promise<void> {
    while (!this.destroyed) {
      try {
        if (!this.secret) {
          const r = await api<TvRegisterResponse>('/api/tv/register', {
            method: 'POST',
            body: { name: 'Living Room TV' }
          });
          this.secret = r.device_secret;
          store.set(SECRET_KEY, r.device_secret);
          this.log('registered new TV identity');
        }
        const me = await api<TvStatus>('/api/tv/me', { token: this.secret });
        this.bootError = '';
        if (!me.paired) {
          this.pairing = { code: me.pairing_code ?? '', expiresAt: me.pairing_expires_at ?? '' };
          await sleep(3000);
          continue;
        }
        this.pairing = null;
        await this.openSession(false);
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          this.log('TV credentials rejected; registering again');
          this.secret = null;
          store.remove(SECRET_KEY);
          continue;
        }
        this.bootError = e instanceof ApiError ? e.message : 'Cannot reach the party server.';
        this.log(`boot error: ${this.bootError}`);
        await sleep(5000);
      }
    }
  }

  async openSession(fresh: boolean) {
    if (!this.secret) return;
    const r = await api<TvSessionResponse>(fresh ? '/api/tv/session/new' : '/api/tv/session', {
      method: 'POST',
      token: this.secret
    });
    this.resetPlayback();
    this.menu = null;
    this.controls = false;
    this.sessionId = r.session_id;
    this.room.apply(r.state);
    this.log(`party ${r.join_code} (${r.state.session.status})`);
    this.room.connect(
      () => ({ token: this.secret ?? '', session_id: this.sessionId ?? undefined }),
      (code) => this.onSocketFatal(code)
    );
  }

  private async onSocketFatal(code: number) {
    this.log(`socket closed (${code})`);
    if (code === 4401) {
      this.secret = null;
      store.remove(SECRET_KEY);
      this.sessionId = null;
      await this.authenticate();
    } else {
      await sleep(1500);
      await this.openSession(false).catch(() => this.authenticate());
    }
  }

  // --- Reconciling the player with the authoritative state ------------------------------------

  private keyOf(s: RoomState): string {
    return s.now_playing ? `${s.now_playing.id}:${s.playback.generation}` : '';
  }

  private resetPlayback() {
    this.loadedKey = '';
    this.startedKey = '';
    this.endedKey = '';
    this.failedKey = '';
    this.introEndsAt = 0;
    this.introHeldLeft = null;
    this.starting = false;
    this.needsGesture = false;
    this.cancel('intro');
    this.cancel('watch1');
    this.cancel('watch2');
  }

  private sync(s: RoomState) {
    if (!this.player || s.session.id !== this.sessionId) return;
    const item = s.now_playing;
    const pb = s.playback;

    if (!item || pb.phase === 'idle' || s.session.status === 'ended') {
      if (this.loadedKey) {
        this.player.stop();
        this.resetPlayback();
      }
      return;
    }
    const key = this.keyOf(s);
    if (pb.phase === 'error') {
      if (this.loadedKey !== key) {
        this.player.stop();
        this.resetPlayback();
        this.loadedKey = key;
        this.failedKey = key;
      }
      return;
    }

    if (key !== this.loadedKey) {
      this.resetPlayback();
      this.loadedKey = key;
      this.appliedRestart = pb.restart_seq;
      if (pb.phase === 'intro') {
        const secs = s.session.intro_seconds ?? 0;
        this.log(`intro: ${item.singer} — ${item.title}`);
        this.player.cue(item.video_id, 0);
        if (secs > 0) {
          if (pb.paused) this.introHeldLeft = secs * 1000;
          else this.startIntroTimer(secs * 1000, key);
        } else {
          this.beginPlayback(key);
        }
      } else {
        // Resuming mid-song (TV restarted or reconnected): pick up where it was.
        let start = pb.position_seconds;
        if (!pb.paused && pb.position_updated_at) {
          start += Math.max(0, (Date.now() - Date.parse(pb.position_updated_at)) / 1000);
        }
        start = Math.max(0, Math.floor(start) - 2);
        this.log(`resuming ${item.title} at ${start}s`);
        this.startedKey = key; // already reported
        if (pb.paused) this.player.cue(item.video_id, start);
        else {
          this.player.load(item.video_id, start);
          this.armWatchdogs(key);
        }
      }
      return;
    }

    // Same item: honour restart and pause/resume.
    if (pb.restart_seq !== this.appliedRestart) {
      this.appliedRestart = pb.restart_seq;
      this.player.seek(0);
      if (this.introEndsAt === 0 && this.introHeldLeft === null) this.player.play();
      this.log('restarted');
    }
    if (pb.phase === 'intro' && (this.introEndsAt > 0 || this.introHeldLeft !== null)) {
      if (pb.paused && this.introEndsAt > 0) {
        this.introHeldLeft = Math.max(0, this.introEndsAt - Date.now());
        this.introEndsAt = 0;
        this.cancel('intro');
      } else if (!pb.paused && this.introHeldLeft !== null) {
        const left = this.introHeldLeft;
        this.introHeldLeft = null;
        this.startIntroTimer(left, key);
      }
      return;
    }
    if (Date.now() < this.optimisticUntil) return; // a remote toggle is still in flight
    const ps = this.player.state();
    if (pb.paused && (ps === 'playing' || ps === 'buffering')) this.player.pause();
    else if (!pb.paused && (ps === 'paused' || ps === 'cued')) this.player.play();
  }

  private startIntroTimer(ms: number, key: string) {
    this.introEndsAt = Date.now() + ms;
    this.later('intro', ms, () => {
      if (this.loadedKey === key) this.beginPlayback(key);
    });
  }

  /** OK on the remote during the up-next countdown: the singer is ready, start now. */
  skipCountdown() {
    if (this.introEndsAt === 0 || !this.loadedKey) return;
    this.cancel('intro');
    this.log('countdown skipped on remote');
    this.beginPlayback(this.loadedKey);
  }

  private beginPlayback(key: string) {
    this.introEndsAt = 0;
    this.introHeldLeft = null;
    if (this.startedKey !== key) this.starting = true;
    this.player?.play();
    this.armWatchdogs(key);
  }

  private armWatchdogs(key: string) {
    this.later('watch1', AUTOPLAY_GRACE_MS, () => {
      if (this.loadedKey === key && this.startedKey !== key && ['unstarted', 'cued'].includes(this.playerState)) {
        this.needsGesture = true;
        this.log('playback did not start on its own; waiting for OK press');
      }
    });
    this.later('watch2', START_TIMEOUT_MS, () => {
      if (this.loadedKey === key && this.startedKey !== key && !this.needsGesture) {
        // Missed the "playing" event but the video is clearly moving: it did start.
        if ((this.player?.time() ?? 0) > 1) return this.log('start watchdog: video is playing');
        this.onPlayerError('timeout');
      }
    });
  }

  private onPlayerState(ps: PlayerState) {
    this.playerState = ps;
    this.log(`player: ${ps}`);
    const s = this.room.state;
    const key = this.loadedKey;
    if (!s?.now_playing || !key || key !== this.keyOf(s)) return;
    const itemId = s.now_playing.id;
    const gen = s.playback.generation;
    if (ps === 'playing' || ps === 'paused' || ps === 'ended') this.starting = false;

    if (ps === 'playing') {
      this.cancel('watch1');
      this.cancel('watch2');
      this.needsGesture = false;
      this.introEndsAt = 0;
      // The host paused while the video was still loading.
      if (s.playback.paused && this.startedKey !== key) this.player?.pause();
      if (this.startedKey !== key) {
        this.startedKey = key;
        void this.report('started', itemId, gen, { duration: this.player?.duration() || null });
      }
    } else if (ps === 'ended' && this.endedKey !== key) {
      this.endedKey = key;
      void this.report('ended', itemId, gen);
    }
    if (ps === 'playing' || ps === 'paused') this.sendProgress();
  }

  private onPlayerError(code: string) {
    const s = this.room.state;
    const key = this.loadedKey;
    this.log(`player error ${code}`);
    this.starting = false;
    if (!s?.now_playing || !key || key !== this.keyOf(s) || this.failedKey === key) return;
    this.failedKey = key;
    this.cancel('watch1');
    this.cancel('watch2');
    this.needsGesture = false;
    void this.report('failed', s.now_playing.id, s.playback.generation, { error_code: code });
  }

  private async report(
    event: 'started' | 'ended' | 'failed',
    itemId: string,
    generation: number,
    extra: Record<string, unknown> = {}
  ) {
    for (let attempt = 0; attempt < 7 && !this.destroyed; attempt++) {
      try {
        const r = await api<TvPlaybackResponse>(`/api/tv/sessions/${this.sessionId}/playback`, {
          method: 'POST',
          token: this.secret,
          body: { event, item_id: itemId, generation, ...extra }
        });
        this.log(`${event} → ${r.accepted ? 'accepted' : 'ignored (stale)'}`);
        this.room.apply(r.state);
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          this.log(`${event} rejected: ${e.message}`);
          return;
        }
        this.log(`${event} failed to send; retrying`);
        await sleep(Math.min(15000, 1000 * 2 ** attempt));
      }
    }
  }

  private sendProgress() {
    const s = this.room.state;
    const key = this.loadedKey;
    if (!this.player || !s?.now_playing || !key || key !== this.keyOf(s)) return;
    const ps = this.playerState;
    if (ps !== 'playing' && ps !== 'paused' && ps !== 'buffering') return;
    const position = this.player.time();
    const duration = this.player.duration() || null;
    this.room.send({
      type: 'progress',
      item_id: s.now_playing.id,
      generation: s.playback.generation,
      position,
      duration,
      state: ps
    });
    // Remind the next singer near the end of the song.
    const next = s.queue[0];
    if (duration && next && duration - position < UP_NEXT_REMINDER_S && this.reminderKey !== key) {
      this.reminderKey = key;
      this.pushBanner({ kind: 'gold', title: `Up next: ${singers(next)}`, body: next.title, ms: 9000 });
    }
  }

  // --- Notifications ------------------------------------------------------------------------

  private onEvent(e: RoomEvent) {
    const notify = this.room.state?.session.show_notifications ?? true;
    const d = e.data;
    if (e.event === 'song_added' && notify) {
      this.pushBanner({
        kind: 'info',
        title: d.partner ? `${d.singer} added a duet with ${d.partner}` : `${d.singer} added a song`,
        body: `${d.title}${d.position ? ` · #${d.position} in line` : ''}`,
        ms: 5000
      });
    } else if (e.event === 'guest_joined' && notify && d.role !== 'host') {
      this.pushBanner({ kind: 'info', title: `${d.display_name} joined the party`, ms: 4000 });
    } else if (e.event === 'track_failed') {
      this.pushBanner({
        kind: 'error',
        title: `Couldn't play “${d.title}”`,
        body: d.auto_skipped ? `${d.reason}. Skipping to the next song.` : `${d.reason}.`,
        ms: 6500
      });
    } else if (e.event === 'show_join') {
      this.openJoinPanel();
    }
  }

  pushBanner(b: Omit<Banner, 'id' | 'at'>) {
    const banner = { ...b, id: this.bannerSeq++, at: Date.now() };
    const [head, ...rest] = this.banners;
    this.banners = head ? [head, ...[...rest, banner].slice(-3)] : [banner];
    if (!head) this.scheduleBanner();
  }

  private scheduleBanner() {
    const cur = this.banners[0];
    if (!cur) return;
    this.later('banner', cur.ms, () => {
      const now = Date.now();
      this.banners = this.banners.slice(1).filter((b) => now - b.at < BANNER_MAX_AGE_MS);
      this.scheduleBanner();
    });
  }

  openJoinPanel(ms = 20000) {
    this.joinPanel = true;
    this.later('join', ms, () => (this.joinPanel = false));
  }

  // --- Host actions from the remote ---------------------------------------------------------

  async command(command: Command, expectedItemId?: string) {
    if (!this.sessionId) return;
    try {
      const s = await api<RoomState>(`/api/sessions/${this.sessionId}/commands`, {
        method: 'POST',
        token: this.secret,
        body: { command, expected_item_id: expectedItemId ?? null }
      });
      this.room.apply(s);
    } catch (e) {
      this.pushBanner({ kind: 'error', title: e instanceof ApiError ? e.message : 'Command failed', ms: 4000 });
    }
  }

  async settings(patch: SettingsUpdate) {
    if (!this.sessionId) return;
    try {
      this.room.apply(
        await api<RoomState>(`/api/sessions/${this.sessionId}/settings`, {
          method: 'PATCH',
          token: this.secret,
          body: patch
        })
      );
    } catch (e) {
      this.pushBanner({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not save', ms: 4000 });
    }
  }

  togglePause() {
    const s = this.room.state;
    if (!s?.now_playing || (s.playback.phase !== 'playing' && s.playback.phase !== 'intro')) return;
    // Respond instantly on the TV; the server confirms with the next snapshot.
    if (s.playback.phase === 'playing') {
      if (s.playback.paused) this.player?.play();
      else this.player?.pause();
      this.optimisticUntil = Date.now() + 2000;
    }
    void this.command('toggle_pause').finally(() => {
      this.optimisticUntil = 0;
      const latest = this.room.state;
      if (latest) this.sync(latest);
    });
  }

  startPlaybackByHand() {
    this.needsGesture = false;
    this.player?.play();
    this.log('play pressed on remote');
  }

  async showHostInvite() {
    if (!this.sessionId) return;
    try {
      const r = await api<HostInviteResponse>(`/api/tv/sessions/${this.sessionId}/host-invite`, {
        method: 'POST',
        token: this.secret
      });
      this.hostInvite = { url: `${this.joinBase}${r.path}`, expiresAt: Date.parse(r.expires_at) };
      this.menu = 'host';
    } catch (e) {
      this.pushBanner({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not create host link', ms: 4000 });
    }
  }

  askSkip() {
    const item = this.room.state?.now_playing;
    if (!item) return;
    this.confirm = {
      title: 'Skip this song?',
      body: `“${item.title}” — ${singers(item)}`,
      confirmLabel: 'Skip song',
      action: () => this.command('skip', item.id)
    };
  }

  askNewParty() {
    this.confirm = {
      title: 'Start a new party?',
      body: 'This ends the current party and shows a new join code.',
      confirmLabel: 'Start new party',
      danger: true,
      action: () => void this.openSession(true)
    };
  }

  askExit() {
    this.confirm = {
      title: 'Exit OpenMic?',
      body: 'The party keeps its queue. Open the app again to continue.',
      confirmLabel: 'Exit',
      action: () => native.exit()
    };
  }

  openMenu(view: MenuView = 'main') {
    this.controls = false;
    this.menu = view;
  }

  closeMenu() {
    this.menu = null;
  }

  openControls() {
    this.controls = true;
    this.later('controls', 6000, () => (this.controls = false));
  }

  // --- Remote control -----------------------------------------------------------------------

  handleKey(key: TvKey): boolean {
    if (this.confirm) {
      if (key === 'back' || key === 'menu') {
        this.confirm = null;
        return true;
      }
      return this.nav(key);
    }
    if (this.menu) {
      if (key === 'menu') this.closeMenu();
      else if (key === 'back') {
        if (this.menu === 'main') this.closeMenu();
        else this.menu = 'main';
      } else if (key === 'playpause') this.togglePause();
      else return this.nav(key);
      return true;
    }
    if (this.controls) {
      this.openControls(); // keep visible while in use
      if (key === 'back') this.controls = false;
      else if (key === 'menu') this.openMenu();
      else if (key === 'playpause') this.togglePause();
      else return this.nav(key);
      return true;
    }

    const screen = this.screen;
    const hasItem = !!this.room.state?.now_playing;
    if (screen === 'boot' || screen === 'pairing') {
      if (key === 'back' && native.available) {
        this.askExit();
        return true;
      }
      return this.nav(key);
    }
    if (key === 'menu') {
      this.openMenu();
      return true;
    }
    if (key === 'playpause') {
      this.togglePause();
      return true;
    }
    if (key === 'forward') {
      if (hasItem) this.askSkip();
      return true;
    }
    if (key === 'rewind') {
      if (hasItem) void this.command('restart');
      return true;
    }
    if (screen === 'stage') {
      if (this.needsGesture && key === 'select') {
        this.startPlaybackByHand();
        return true;
      }
      if (key === 'back') {
        // Never quit mid-song by accident.
        this.pushBanner({ kind: 'info', title: 'Press Menu ☰ for options', ms: 2500 });
        return true;
      }
      this.openControls();
      return true;
    }
    if (screen === 'intro' && key === 'select') {
      this.skipCountdown();
      return true;
    }
    if (key === 'back') {
      if (native.available && (screen === 'lobby' || screen === 'ended')) this.askExit();
      return true;
    }
    return this.nav(key);
  }

  private nav(key: TvKey): boolean {
    switch (key) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        moveFocus(key);
        return true;
      case 'select':
        activateFocused();
        return true;
      default:
        return false;
    }
  }
}
