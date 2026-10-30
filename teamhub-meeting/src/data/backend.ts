import type { Admission, Message, RecordingInfo, Row, Snapshot, TableName, User } from '../lib/types';

// One interface, two implementations:
//  • LocalBackend    — demo mode: localStorage + BroadcastChannel (multi-tab realtime), RLS mirrored in policies.ts
//  • SupabaseBackend — production: Supabase Auth + Postgres (RLS) + Realtime + Storage
// The UI only talks to this interface, so features work identically in both modes.

export type ChangeType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ChangeEvent<T extends TableName = TableName> {
  table: T;
  type: ChangeType;
  row: Row<T>;
}

export interface RpcMap {
  /** Validates meeting access (team / link / password / approval / lock) and registers the caller as participant. */
  join_meeting: { args: { token?: string; meeting_id?: string; password?: string }; result: { meeting_id: string; admission: Admission } };
  /** Server-timestamped attendance: join / heartbeat / leave. */
  record_attendance: { args: { meeting_id: string; event: 'join' | 'heartbeat' | 'leave' }; result: null };
  start_meeting: { args: { meeting_id: string }; result: null };
  /** Ends the meeting, closes open attendance sessions and marks invited no-shows absent. */
  end_meeting: { args: { meeting_id: string }; result: null };
  toggle_reaction: { args: { message_id: string; emoji: string }; result: null };
  set_meeting_password: { args: { meeting_id: string; password: string | null }; result: null };
}
export type RpcName = keyof RpcMap;

export type MessageScope = { room_id: string } | { meeting_id: string } | { dm: true };

export interface PresenceMember<S = Record<string, unknown>> {
  key: string;
  state: S;
}

/** Realtime channel used for meeting signaling, live meeting events and org presence. */
export interface RealtimeChannel {
  subscribe(): Promise<void>;
  track(state: Record<string, unknown>): void;
  onPresence(cb: (members: PresenceMember[]) => void): void;
  onMessage(cb: (payload: Record<string, unknown>) => void): void;
  send(payload: Record<string, unknown>): void;
  unsubscribe(): void;
}

export interface Backend {
  readonly mode: 'demo' | 'supabase';
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  restoreSession(): Promise<User | null>;
  loadSnapshot(): Promise<Snapshot>;
  listMessages(scope: MessageScope): Promise<Message[]>;
  insert<T extends TableName>(table: T, rows: Partial<Row<T>> | Partial<Row<T>>[]): Promise<Row<T>[]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>>;
  remove(table: TableName, id: string): Promise<void>;
  rpc<K extends RpcName>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']>;
  subscribe(cb: (e: ChangeEvent) => void): () => void;
  channel(topic: string, opts: { presenceKey: string; private?: boolean }): RealtimeChannel;
  uploadFile(bucket: 'attachments' | 'recordings', path: string, file: Blob): Promise<string>;
  recordingUrl(rec: RecordingInfo): Promise<string | null>;
  /** Supabase Edge Function call (AI assistant, future integrations). */
  invoke?(fn: string, body: Record<string, unknown>): Promise<unknown>;
  /** Demo only: wipe and re-seed local data. */
  resetDemo?(): Promise<void>;
}

export class BackendError extends Error {
  constructor(message: string, readonly code: string = 'error') {
    super(message);
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export const isSupabaseConfigured = !!SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

let instance: Promise<Backend> | null = null;

/** Lazily creates the backend (Supabase code is only loaded when configured). */
export function getBackend(): Promise<Backend> {
  instance ??= isSupabaseConfigured
    ? import('./supabase/supabaseBackend').then((m) => new m.SupabaseBackend())
    : import('./local/localBackend').then((m) => new m.LocalBackend());
  return instance;
}
