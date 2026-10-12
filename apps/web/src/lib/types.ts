import type { components } from './api/schema';

type S = components['schemas'];

export type RoomState = S['RoomState'];
export type QueueItem = S['QueueItemOut'];
export type Participant = S['ParticipantOut'];
export type Playback = S['PlaybackOut'];
export type SessionInfo = S['SessionOut'];
export type Video = S['VideoOut'];
export type SearchResponse = S['SearchResponse'];
export type ResolveResponse = S['ResolveResponse'];
export type Songbook = S['SongbookResponse'];
export type SongbookSong = S['SongbookSongOut'];
export type JoinResponse = S['JoinResponse'];
export type EnqueueResponse = S['EnqueueResponse'];
export type PublicConfig = S['PublicConfig'];
export type SessionLookup = S['SessionLookup'];
export type AdminOverview = S['AdminOverview'];
export type AdminLoginResponse = S['AdminLoginResponse'];
export type DeviceOut = S['DeviceOut'];
export type TvRegisterResponse = S['TvRegisterResponse'];
export type TvStatus = S['TvStatus'];
export type TvSessionResponse = S['TvSessionResponse'];
export type TvPlaybackResponse = S['TvPlaybackResponse'];
export type HostInviteResponse = S['HostInviteResponse'];
export type SettingsUpdate = S['SettingsUpdate'];
export type DuetPartner = S['DuetPartner'];
export type Command = S['CommandRequest']['command'];
export type Role = S['MeOut']['role'];

// --- WebSocket messages (not part of the REST schema) ---------------------------------------

export type EventName =
  | 'guest_joined'
  | 'song_added'
  | 'track_started'
  | 'track_failed'
  | 'track_skipped'
  | 'party_ended'
  | 'show_join'
  | 'host_changed';

export interface RoomEvent {
  type: 'event';
  event: EventName;
  data: Record<string, unknown> & {
    item_id?: string;
    participant_id?: string;
    display_name?: string;
    avatar?: string | null;
    singer?: string;
    partner_id?: string | null;
    partner?: string | null;
    title?: string;
    position?: number;
    reason?: string;
    auto_skipped?: boolean;
  };
}

export interface ProgressMessage {
  type: 'progress';
  item_id: string;
  generation: number;
  position: number;
  duration: number | null;
  state: 'playing' | 'paused' | 'buffering' | 'loading';
  server_time: string;
}

export interface HelloMessage {
  type: 'hello';
  kind: 'participant' | 'device';
  participant_id: string | null;
  server_time: string;
}

export type ServerMessage =
  | (RoomState & { type: 'room_state' })
  | RoomEvent
  | ProgressMessage
  | HelloMessage
  | { type: 'pong'; server_time: string }
  | { type: 'error'; code: number; message: string };

export interface Credentials {
  token: string;
  participantId: string;
  sessionId: string;
  joinCode: string;
  displayName: string;
  avatar?: string | null;
}
