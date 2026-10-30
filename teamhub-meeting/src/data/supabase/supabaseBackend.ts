// Production backend: Supabase Auth + Postgres (Row Level Security) + Realtime + Storage.
// All authorization is enforced in the database (supabase/migrations). This file is a thin adapter.
import { createClient, type RealtimeChannel as SbChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Message, RecordingInfo, Row, Snapshot, TableName, User } from '../../lib/types';
import { SNAPSHOT_TABLES, pkOf } from '../../lib/types';
import {
  BackendError, type Backend, type ChangeEvent, type MessageScope, type PresenceMember, type RealtimeChannel,
  type RpcMap, type RpcName,
} from '../backend';

const PRIVATE_CHANNELS = (import.meta.env.VITE_REALTIME_PRIVATE ?? 'true') !== 'false';

// SQL functions raise errors with HINT = machine code (e.g. 'password_required'), see 0003_functions.sql.
const wrap = (error: { message: string; code?: string; hint?: string | null } | null) => {
  if (error) throw new BackendError(error.message, error.hint || error.code || 'error');
};

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  private userId: string | null = null;
  private listeners = new Set<(e: ChangeEvent) => void>();
  private dbChannel: SbChannel | null = null;

  constructor() {
    this.sb = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 40 } },
    });
  }

  private async profile(id: string): Promise<User> {
    const { data, error } = await this.sb.from('users').select('*').eq('id', id).single();
    wrap(error);
    return data as User;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    wrap(error);
    this.userId = data.user!.id;
    await this.sb.realtime.setAuth(data.session!.access_token);
    return this.profile(this.userId);
  }

  async signOut() {
    this.dbChannel?.unsubscribe();
    this.dbChannel = null;
    await this.sb.auth.signOut();
    this.userId = null;
  }

  async restoreSession() {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    this.userId = data.session.user.id;
    await this.sb.realtime.setAuth(data.session.access_token);
    return this.profile(this.userId).catch(() => null);
  }

  async loadSnapshot(): Promise<Snapshot> {
    const entries = await Promise.all(
      SNAPSHOT_TABLES.map(async (t) => {
        // performance can be large: only load the last 40 days
        let q = this.sb.from(t).select('*');
        if (t === 'performance') q = q.gte('period', new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10));
        const { data, error } = await q.limit(10_000);
        wrap(error);
        return [t, data ?? []] as const;
      }),
    );
    return Object.fromEntries(entries) as unknown as Snapshot;
  }

  async listMessages(scope: MessageScope): Promise<Message[]> {
    let q = this.sb.from('messages').select('*').order('created_at', { ascending: false }).limit(400);
    if ('room_id' in scope) q = q.eq('room_id', scope.room_id);
    else if ('meeting_id' in scope) q = q.eq('meeting_id', scope.meeting_id);
    else q = q.not('recipient_id', 'is', null); // RLS limits to my own conversations
    const { data, error } = await q;
    wrap(error);
    return ((data ?? []) as Message[]).reverse();
  }

  async insert<T extends TableName>(table: T, rows: Partial<Row<T>> | Partial<Row<T>>[]) {
    const { data, error } = await this.sb.from(table).insert(rows as never).select('*');
    wrap(error);
    return (data ?? []) as Row<T>[];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>) {
    const { data, error } = await this.sb.from(table).update(patch as never).eq(pkOf(table), id).select('*').single();
    wrap(error);
    return data as Row<T>;
  }

  async remove(table: TableName, id: string) {
    const { error } = await this.sb.from(table).delete().eq(pkOf(table), id);
    wrap(error);
  }

  async rpc<K extends RpcName>(name: K, args: RpcMap[K]['args']) {
    const params = Object.fromEntries(Object.entries(args as object).map(([k, v]) => [`p_${k}`, v ?? null]));
    const { data, error } = await this.sb.rpc(name, params);
    wrap(error);
    return (Array.isArray(data) ? data[0] : data) as RpcMap[K]['result'];
  }

  subscribe(cb: (e: ChangeEvent) => void) {
    this.listeners.add(cb);
    if (!this.dbChannel) {
      // Postgres Changes respect RLS: each client only receives rows it is allowed to read.
      this.dbChannel = this.sb
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, (p) => {
          const type = p.eventType as ChangeEvent['type'];
          const row = (type === 'DELETE' ? p.old : p.new) as never;
          const e = { table: p.table as TableName, type, row } as ChangeEvent;
          this.listeners.forEach((l) => l(e));
        })
        .subscribe();
    }
    return () => void this.listeners.delete(cb);
  }

  channel(topic: string, opts: { presenceKey: string; private?: boolean }): RealtimeChannel {
    return new SupabaseChannel(this.sb, topic, opts.presenceKey, opts.private ?? PRIVATE_CHANNELS);
  }

  async uploadFile(bucket: 'attachments' | 'recordings', path: string, file: Blob) {
    const { error } = await this.sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined });
    wrap(error);
    if (bucket === 'recordings') return path;
    const { data, error: e2 } = await this.sb.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
    wrap(e2);
    return data!.signedUrl;
  }

  async invoke(fn: string, body: Record<string, unknown>) {
    const { data, error } = await this.sb.functions.invoke(fn, { body });
    wrap(error);
    return data;
  }

  async recordingUrl(rec: RecordingInfo) {
    if (!rec.url) return null;
    const { data } = await this.sb.storage.from('recordings').createSignedUrl(rec.url, 60 * 60);
    return data?.signedUrl ?? null;
  }
}

class SupabaseChannel implements RealtimeChannel {
  private ch: SbChannel;
  private presenceCb: ((m: PresenceMember[]) => void) | null = null;
  private messageCb: ((p: Record<string, unknown>) => void) | null = null;

  constructor(sb: SupabaseClient, topic: string, key: string, isPrivate: boolean) {
    this.ch = sb.channel(topic, { config: { broadcast: { self: false }, presence: { key }, private: isPrivate } });
    this.ch.on('broadcast', { event: 'msg' }, ({ payload }) => this.messageCb?.(payload as Record<string, unknown>));
    this.ch.on('presence', { event: 'sync' }, () => {
      const state = this.ch.presenceState() as Record<string, Record<string, unknown>[]>;
      this.presenceCb?.(Object.entries(state).map(([k, metas]) => ({ key: k, state: metas[metas.length - 1] ?? {} })));
    });
  }

  subscribe() {
    return new Promise<void>((resolve, reject) => {
      this.ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new BackendError(err?.message ?? 'Realtime connection failed', 'realtime'));
      });
    });
  }

  track(state: Record<string, unknown>) {
    void this.ch.track(state);
  }

  onPresence(cb: (m: PresenceMember[]) => void) {
    this.presenceCb = cb;
  }

  onMessage(cb: (p: Record<string, unknown>) => void) {
    this.messageCb = cb;
  }

  send(payload: Record<string, unknown>) {
    void this.ch.send({ type: 'broadcast', event: 'msg', payload });
  }

  unsubscribe() {
    void this.ch.untrack();
    void this.ch.unsubscribe();
  }
}
