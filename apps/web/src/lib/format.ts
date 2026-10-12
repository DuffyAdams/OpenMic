import type { QueueItem, RoomState } from './types';

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function minutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = Array.from(parts[0])[0] ?? '';
  const second = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/** Stable pleasant hue per person, used for avatar tints. */
export function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** "Jessica", or "Jessica & Mike" for a duet. Pass `me` to say "You" for the viewer. */
export function singers(item: QueueItem, me?: string): string {
  const lead = me && item.participant_id === me ? 'You' : item.singer;
  if (!item.partner) return lead;
  const partner = me && item.partner_id === me ? 'You' : item.partner;
  return partner === 'You' ? `You & ${lead}` : `${lead} & ${partner}`;
}

/** True when this participant sings on the item, as requester or duet partner. */
export function singsOn(item: QueueItem, participantId: string): boolean {
  return item.participant_id === participantId || item.partner_id === participantId;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const AVG_SONG_SECONDS = 225;

/**
 * Approximate seconds until each pending item starts: remaining time of the current song plus
 * the durations (or a typical length) of everything ahead of it, plus intro cards.
 */
export function waitTimes(state: RoomState, currentPosition: number): Map<string, number> {
  const out = new Map<string, number>();
  const intro = state.session.intro_seconds ?? 15;
  let t = 0;
  if (state.now_playing) {
    const total = state.now_playing.duration_seconds ?? AVG_SONG_SECONDS;
    t = Math.max(0, total - (state.playback.phase === 'playing' ? currentPosition : 0));
    if (state.playback.phase === 'intro') t += intro;
  }
  for (const item of state.queue) {
    t += intro;
    out.set(item.id, t);
    t += item.duration_seconds ?? AVG_SONG_SECONDS;
  }
  return out;
}

export function statusLabel(item: QueueItem): string {
  switch (item.status) {
    case 'completed':
      return 'Sung';
    case 'skipped':
      return 'Skipped';
    case 'failed':
      return item.failure_reason ?? "Couldn't play";
    case 'cancelled':
      return 'Cancelled';
    case 'playing':
      return 'On stage';
    case 'preparing':
      return 'Up now';
    default:
      return 'Waiting';
  }
}
