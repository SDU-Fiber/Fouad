// Demo backend: zero-setup, fully functional. Data lives in localStorage; changes are pushed to other
// browser tabs through BroadcastChannel, so two tabs logged in as different users behave like two devices
// (chat, meeting signaling, waiting room, attendance…). Each tab keeps its own login (sessionStorage).
import { buildSeed, DEMO_PASSWORD, type SeedData } from '../../lib/seed';
import { myTeamIds } from '../../lib/permissions';
import type { Admission, Message, RecordingInfo, Row, Snapshot, TableName, User } from '../../lib/types';
import { SNAPSHOT_TABLES, pkOf } from '../../lib/types';
import { fmtDay, fmtTime, nowIso, randomToken, sha256, uid } from '../../lib/utils';
import {
  BackendError, type Backend, type ChangeEvent, type MessageScope, type PresenceMember, type RealtimeChannel,
  type RpcMap, type RpcName,
} from '../backend';
import { assertWrite, canManageMeeting, canSelect, isRoomMember } from './policies';
import { clearBlobs, getBlob, putBlob } from './idb';

const DB_KEY = 'teamhub.demo.db.v1';
const SESSION_KEY = 'teamhub.demo.session';
const LATE_GRACE_MS = 5 * 60_000;

type AnyRow = Record<string, unknown>;

function defaults(table: TableName, me: User | null): AnyRow {
  const now = nowIso();
  const base = { id: uid(), created_at: now };
  const meId = me?.id ?? null;
  switch (table) {
    case 'meetings':
      return { ...base, description: '', agenda: [], team_id: null, room_id: null, host_id: meId, scheduled_at: now, duration_min: 30, status: 'scheduled', access: 'team', password_hash: null, join_token: randomToken(), locked: false, recording_enabled: false, recording: null, started_at: null, ended_at: null };
    case 'meeting_participants':
      return { ...base, role: 'attendee', admission: 'invited' };
    case 'meeting_notes':
      return { ...base, author_id: meId, kind: 'note', updated_at: now };
    case 'meeting_insights':
      return { ...base, status: 'pending', provider: 'mock', summary: '', decisions: [], action_items: [], follow_ups: [] };
    case 'tasks':
      return { ...base, description: '', team_id: null, room_id: null, priority: 'medium', status: 'todo', due_date: null, created_by: meId, completed_at: null };
    case 'team_rooms':
      return { ...base, description: '', team_id: null, icon: 'hash', color: '#E60000', is_private: false, created_by: meId };
    case 'room_members':
      return { ...base, member_role: 'member' };
    case 'messages':
      return { ...base, room_id: null, meeting_id: null, recipient_id: null, sender_id: meId, reply_to_id: null, attachments: [], reactions: {} };
    case 'announcements':
      return { ...base, author_id: meId, team_id: null, priority: 'normal', pinned: false };
    case 'notifications':
      return { ...base, type: 'system', link: null, read: false };
    case 'team_members':
      return { id: base.id, member_role: 'member', joined_at: now };
    case 'teams':
      return { ...base, description: '', manager_id: null, leader_id: null };
    case 'performance':
      return { id: base.id, target: 0, actual: 0, updated_at: now };
    case 'users':
      return { ...base, role: 'employee', title: 'Sales Executive', avatar_url: null, avatar_color: '#E60000', phone: null, status: 'offline', activity: '', last_seen_at: null };
    case 'kpi_definitions':
      return { unit: '', display: 'count', color: '#E60000', weight: 1, daily_target: 1, sort_order: 99, active: true };
    default:
      return base;
  }
}

export class LocalBackend implements Backend {
  readonly mode = 'demo' as const;
  private meId: string | null = sessionStorage.getItem(SESSION_KEY);
  private cache: SeedData | null = null;
  private listeners = new Set<(e: ChangeEvent) => void>();
  private bc = new BroadcastChannel('teamhub:db');

  constructor() {
    this.bc.onmessage = (ev: MessageEvent) => {
      this.cache = null; // another tab wrote to storage
      if (ev.data?.reset) return location.reload();
      this.dispatch(ev.data as ChangeEvent);
    };
    window.addEventListener('storage', (e) => e.key === DB_KEY && (this.cache = null));
  }

  // ── storage ──────────────────────────────────────────────────────────────
  private read(): SeedData {
    if (this.cache) return this.cache;
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        this.cache = JSON.parse(raw) as SeedData;
        return this.cache;
      } catch {
        /* corrupted — reseed */
      }
    }
    const seed = buildSeed();
    this.persist(seed);
    return seed;
  }

  private persist(db: SeedData) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      this.cache = db;
    } catch {
      this.cache = null;
      throw new BackendError('Demo storage is full. Remove large attachments or reset the demo in Settings.', 'quota');
    }
  }

  /** Read-modify-write under a cross-tab lock, so two tabs writing at once never lose an update. */
  private async mutate<R>(fn: (db: SeedData, events: ChangeEvent[]) => R): Promise<R> {
    const run = () => {
      this.cache = null; // always start from the freshest copy
      const db = this.read();
      const events: ChangeEvent[] = [];
      const result = fn(db, events);
      this.persist(db);
      this.emit(events);
      return result;
    };
    return navigator.locks ? navigator.locks.request('teamhub-demo-db', run) : run();
  }

  private emit(events: ChangeEvent[]) {
    for (const e of events) {
      this.bc.postMessage(e);
      this.dispatch(e);
    }
  }

  private dispatch(e: ChangeEvent) {
    const me = this.currentUser();
    if (!me) return;
    if (e.type !== 'DELETE' && !canSelect(this.read(), me, e.table, e.row)) return;
    this.listeners.forEach((l) => l(e));
  }

  private currentUser(): User | null {
    if (!this.meId) return null;
    return this.read().users.find((u) => u.id === this.meId) ?? null;
  }

  private requireMe(): User {
    const me = this.currentUser();
    if (!me) throw new BackendError('Not signed in', 'auth');
    return me;
  }

  private tableRows<T extends TableName>(db: SeedData, table: T): Row<T>[] {
    return (db as unknown as Record<string, Row<T>[]>)[table]!;
  }

  // ── auth ─────────────────────────────────────────────────────────────────
  async signIn(email: string, password: string) {
    const user = this.read().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || password !== DEMO_PASSWORD) throw new BackendError('Invalid email or password', 'auth');
    this.meId = user.id;
    sessionStorage.setItem(SESSION_KEY, user.id);
    return user;
  }

  async signOut() {
    this.meId = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  async restoreSession() {
    return this.currentUser();
  }

  async resetDemo() {
    localStorage.removeItem(DB_KEY);
    this.cache = null;
    await clearBlobs().catch(() => undefined);
    this.bc.postMessage({ reset: true });
  }

  // ── data ─────────────────────────────────────────────────────────────────
  async loadSnapshot(): Promise<Snapshot> {
    const me = this.requireMe();
    const db = this.read();
    const snap = {} as Record<string, unknown[]>;
    for (const t of SNAPSHOT_TABLES) snap[t] = this.tableRows(db, t).filter((r) => canSelect(db, me, t, r));
    return snap as unknown as Snapshot;
  }

  async listMessages(scope: MessageScope): Promise<Message[]> {
    const me = this.requireMe();
    const db = this.read();
    const rows = db.messages.filter((m) => {
      if ('room_id' in scope) return m.room_id === scope.room_id;
      if ('meeting_id' in scope) return m.meeting_id === scope.meeting_id;
      return !!m.recipient_id && (m.sender_id === me.id || m.recipient_id === me.id);
    });
    return rows.filter((m) => canSelect(db, me, 'messages', m)).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-400);
  }

  async insert<T extends TableName>(table: T, input: Partial<Row<T>> | Partial<Row<T>>[]): Promise<Row<T>[]> {
    const me = this.requireMe();
    const items = Array.isArray(input) ? input : [input];
    return this.mutate((db, events) => {
      const rows = items.map((it) => ({ ...defaults(table, me), ...it }) as unknown as Row<T>);
      rows.forEach((r) => assertWrite(db, me, table, 'insert', r));
      this.tableRows(db, table).push(...rows);
      rows.forEach((row) => events.push({ table, type: 'INSERT', row }));
      rows.forEach((row) => this.afterInsert(db, events, me, table, row));
      return rows;
    });
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    const me = this.requireMe();
    return this.mutate((db, events) => {
      const pk = pkOf(table);
      const row = this.tableRows(db, table).find((r) => (r as unknown as AnyRow)[pk] === id);
      if (!row) throw new BackendError('Record not found', 'not_found');
      assertWrite(db, me, table, 'update', row, patch);
      const before = { ...row } as unknown as AnyRow;
      Object.assign(row as unknown as AnyRow, patch);
      this.beforeUpdate(table, row as unknown as AnyRow, before);
      events.push({ table, type: 'UPDATE', row });
      this.afterUpdate(db, events, me, table, row as unknown as AnyRow, before);
      return row;
    });
  }

  async remove(table: TableName, id: string) {
    const me = this.requireMe();
    await this.mutate((db, events) => {
      const rows = this.tableRows(db, table);
      const pk = pkOf(table);
      const idx = rows.findIndex((r) => (r as unknown as AnyRow)[pk] === id);
      if (idx < 0) return;
      assertWrite(db, me, table, 'delete', rows[idx]!);
      const [row] = rows.splice(idx, 1);
      events.push({ table, type: 'DELETE', row: row! });
      if (table === 'tasks') {
        db.meeting_tasks = db.meeting_tasks.filter((mt) => {
          if (mt.task_id !== id) return true;
          events.push({ table: 'meeting_tasks', type: 'DELETE', row: mt });
          return false;
        });
      }
    });
  }

  // ── "database triggers" ──────────────────────────────────────────────────
  private notify(db: SeedData, events: ChangeEvent[], userId: string, n: Pick<Row<'notifications'>, 'type' | 'title' | 'body' | 'link'>) {
    const row = { ...(defaults('notifications', null) as unknown as Row<'notifications'>), ...n, user_id: userId };
    db.notifications.push(row);
    events.push({ table: 'notifications', type: 'INSERT', row });
  }

  private beforeUpdate(table: TableName, row: AnyRow, before: AnyRow) {
    if (table === 'tasks' && row.status !== before.status) row.completed_at = row.status === 'completed' ? nowIso() : null;
    if (table === 'meeting_notes') row.updated_at = nowIso();
    if (table === 'performance') row.updated_at = nowIso();
  }

  private afterInsert(db: SeedData, events: ChangeEvent[], me: User, table: TableName, row: unknown) {
    if (table === 'tasks') {
      const t = row as Row<'tasks'>;
      if (t.assignee_id !== me.id) this.notify(db, events, t.assignee_id, { type: 'task', title: `New task from ${me.full_name}`, body: t.title, link: '/tasks' });
    }
    if (table === 'announcements') {
      const a = row as Row<'announcements'>;
      const audience = a.team_id ? new Set(db.team_members.filter((m) => m.team_id === a.team_id).map((m) => m.user_id)) : new Set(db.users.map((u) => u.id));
      audience.forEach((uid) => uid !== me.id && this.notify(db, events, uid, { type: 'announcement', title: a.title, body: a.body.slice(0, 140), link: '/announcements' }));
    }
    if (table === 'meeting_participants') {
      const p = row as Row<'meeting_participants'>;
      const m = db.meetings.find((x) => x.id === p.meeting_id);
      if (m && p.user_id !== me.id && p.admission === 'invited')
        this.notify(db, events, p.user_id, { type: 'meeting', title: `Invitation: ${m.title}`, body: `${fmtDay(m.scheduled_at)} · ${fmtTime(m.scheduled_at)} — from ${me.full_name}`, link: '/meetings' });
    }
    if (table === 'messages') {
      const msg = row as Message;
      if (msg.recipient_id && msg.recipient_id !== me.id)
        this.notify(db, events, msg.recipient_id, { type: 'message', title: `Message from ${me.full_name}`, body: msg.body.slice(0, 120) || 'Attachment', link: `/rooms/dm/${me.id}` });
    }
  }

  private afterUpdate(db: SeedData, events: ChangeEvent[], me: User, table: TableName, row: AnyRow, before: AnyRow) {
    if (table === 'tasks' && row.assignee_id !== before.assignee_id && row.assignee_id !== me.id)
      this.notify(db, events, row.assignee_id as string, { type: 'task', title: `Task reassigned to you`, body: row.title as string, link: '/tasks' });
  }

  // ── RPC (server functions) ───────────────────────────────────────────────
  async rpc<K extends RpcName>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']> {
    const me = this.requireMe();
    const a = args as Record<string, string | null | undefined>;
    const passwordHash = a.password ? await sha256(a.password) : null;
    const result = await this.mutate((db, events) => {
      const findMeeting = () => {
        const m = a.token ? db.meetings.find((x) => x.join_token === a.token) : db.meetings.find((x) => x.id === a.meeting_id);
        if (!m) throw new BackendError('Meeting not found or the link has expired', 'not_found');
        return m;
      };
      const upd = <T extends TableName>(table: T, row: Row<T>) => events.push({ table, type: 'UPDATE', row });

      switch (name) {
        case 'join_meeting': {
          const m = findMeeting();
          if (m.status === 'ended' || m.status === 'cancelled') throw new BackendError('This meeting has already ended', 'ended');
          let p = db.meeting_participants.find((x) => x.meeting_id === m.id && x.user_id === me.id);
          if (p?.admission === 'removed') throw new BackendError('You were removed from this meeting by the host', 'denied');
          if (p?.admission === 'denied') throw new BackendError('The host declined your request to join', 'denied');
          const manage = canManageMeeting(db, me, m);
          let admission: Admission = 'admitted';
          if (!manage) {
            const admitted = p?.admission === 'admitted';
            if (m.locked && !admitted) throw new BackendError('The host has locked this meeting', 'locked');
            const inTeam = !!p || (!!m.team_id && myTeamIds(me, db).includes(m.team_id)) || (!!m.room_id && isRoomMember(db, me, m.room_id));
            if (m.access === 'team' && !inTeam) throw new BackendError('This meeting is restricted to team members', 'forbidden');
            if (m.access === 'password' && !admitted) {
              if (!passwordHash) throw new BackendError('This meeting requires a password', 'password_required');
              if (passwordHash !== m.password_hash) throw new BackendError('Wrong meeting password', 'password_invalid');
            }
            if (m.access === 'approval' && !admitted && !p) admission = 'pending';
            if (p?.admission === 'pending') admission = 'pending';
          }
          if (p) {
            if (p.admission !== admission) {
              p.admission = admission;
              upd('meeting_participants', p);
            }
          } else {
            p = { id: uid(), meeting_id: m.id, user_id: me.id, role: manage ? 'cohost' : 'attendee', admission, created_at: nowIso() };
            db.meeting_participants.push(p);
            events.push({ table: 'meeting_participants', type: 'INSERT', row: p });
          }
          return { meeting_id: m.id, admission: p.admission };
        }
        case 'record_attendance': {
          const m = findMeeting();
          const now = new Date();
          let row = db.attendance.find((x) => x.meeting_id === m.id && x.user_id === me.id);
          if (a.event === 'join') {
            const ref = Math.max(new Date(m.scheduled_at).getTime(), m.started_at ? new Date(m.started_at).getTime() : 0);
            if (!row) {
              row = { id: uid(), meeting_id: m.id, user_id: me.id, joined_at: now.toISOString(), left_at: now.toISOString(), session_started_at: now.toISOString(), total_seconds: 0, join_count: 1, status: now.getTime() > ref + LATE_GRACE_MS ? 'late' : 'present' };
              db.attendance.push(row);
              events.push({ table: 'attendance', type: 'INSERT', row });
              return null;
            }
            if (row.status === 'absent') row.status = now.getTime() > ref + LATE_GRACE_MS ? 'late' : 'present';
            row.joined_at ??= now.toISOString();
            if (!row.session_started_at) {
              row.session_started_at = now.toISOString();
              row.join_count += 1;
            }
            row.left_at = now.toISOString();
          } else if (row?.session_started_at) {
            row.left_at = now.toISOString();
            if (a.event === 'leave') {
              row.total_seconds += Math.round((now.getTime() - new Date(row.session_started_at).getTime()) / 1000);
              row.session_started_at = null;
            }
          } else return null;
          upd('attendance', row);
          return null;
        }
        case 'start_meeting': {
          const m = findMeeting();
          if (!canManageMeeting(db, me, m)) throw new BackendError('Only the host can start this meeting', 'forbidden');
          if (m.status === 'live') return null;
          m.status = 'live';
          m.started_at = nowIso();
          upd('meetings', m);
          db.meeting_participants
            .filter((p) => p.meeting_id === m.id && p.user_id !== me.id)
            .forEach((p) => this.notify(db, events, p.user_id, { type: 'meeting', title: `${m.title} has started`, body: `${me.full_name} started the meeting — join now`, link: `/meet/${m.id}` }));
          return null;
        }
        case 'end_meeting': {
          const m = findMeeting();
          if (!canManageMeeting(db, me, m)) throw new BackendError('Only the host can end this meeting', 'forbidden');
          if (m.status === 'ended') return null;
          m.status = 'ended';
          m.ended_at = nowIso();
          m.started_at ??= m.ended_at;
          upd('meetings', m);
          db.attendance.filter((r) => r.meeting_id === m.id && r.session_started_at).forEach((r) => {
            const until = Math.max(new Date(r.left_at ?? m.ended_at!).getTime(), new Date(r.session_started_at!).getTime());
            r.total_seconds += Math.round((until - new Date(r.session_started_at!).getTime()) / 1000);
            r.session_started_at = null;
            upd('attendance', r);
          });
          db.meeting_participants
            .filter((p) => p.meeting_id === m.id && p.admission !== 'denied' && !db.attendance.some((r) => r.meeting_id === m.id && r.user_id === p.user_id))
            .forEach((p) => {
              const row: Row<'attendance'> = { id: uid(), meeting_id: m.id, user_id: p.user_id, joined_at: null, left_at: null, session_started_at: null, total_seconds: 0, join_count: 0, status: 'absent' };
              db.attendance.push(row);
              events.push({ table: 'attendance', type: 'INSERT', row });
            });
          return null;
        }
        case 'toggle_reaction': {
          const msg = db.messages.find((x) => x.id === a.message_id);
          if (!msg || !canSelect(db, me, 'messages', msg)) throw new BackendError('Message not found', 'not_found');
          const list = new Set(msg.reactions[a.emoji!] ?? []);
          if (list.has(me.id)) list.delete(me.id);
          else list.add(me.id);
          if (list.size) msg.reactions[a.emoji!] = [...list];
          else delete msg.reactions[a.emoji!];
          upd('messages', msg);
          return null;
        }
        case 'set_meeting_password': {
          const m = findMeeting();
          if (!canManageMeeting(db, me, m)) throw new BackendError('Only the host can change the password', 'forbidden');
          m.password_hash = passwordHash;
          upd('meetings', m);
          return null;
        }
      }
      return null;
    });
    return result as RpcMap[K]['result'];
  }

  subscribe(cb: (e: ChangeEvent) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  channel(topic: string, opts: { presenceKey: string }): RealtimeChannel {
    return new LocalChannel(topic, opts.presenceKey);
  }

  async uploadFile(bucket: 'attachments' | 'recordings', path: string, file: Blob) {
    if (bucket === 'recordings') {
      await putBlob(path, file);
      return `idb:${path}`;
    }
    if (file.size > 1.5 * 1024 * 1024) throw new BackendError('Demo mode limits attachments to 1.5 MB (no limit with Supabase Storage).', 'too_large');
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async recordingUrl(rec: RecordingInfo) {
    if (!rec.url?.startsWith('idb:')) return rec.url;
    const blob = await getBlob(rec.url.slice(4));
    return blob ? URL.createObjectURL(blob) : null;
  }
}

/** BroadcastChannel-based realtime channel with heartbeat presence (demo mode). */
class LocalChannel implements RealtimeChannel {
  private bc: BroadcastChannel;
  private peers = new Map<string, { state: Record<string, unknown>; at: number }>();
  private self: Record<string, unknown> | null = null;
  private presenceCb: ((m: PresenceMember[]) => void) | null = null;
  private messageCb: ((p: Record<string, unknown>) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private onUnload = () => this.bc.postMessage({ k: 'leave', key: this.key });

  constructor(topic: string, private key: string) {
    this.bc = new BroadcastChannel(`teamhub:rt:${topic}`);
  }

  async subscribe() {
    this.bc.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { k: string; key: string; state?: Record<string, unknown>; payload?: Record<string, unknown> };
      if (d.k === 'msg') return this.messageCb?.(d.payload!);
      if (d.k === 'presence') {
        const isNew = !this.peers.has(d.key);
        this.peers.set(d.key, { state: d.state!, at: Date.now() });
        if (isNew && this.self) this.beat(); // answer newcomers immediately
        this.emitPresence();
      }
      if (d.k === 'leave' && this.peers.delete(d.key)) this.emitPresence();
    };
    this.timer = setInterval(() => {
      this.beat();
      const cutoff = Date.now() - 7000;
      let changed = false;
      this.peers.forEach((v, k) => v.at < cutoff && this.peers.delete(k) && (changed = true));
      if (changed) this.emitPresence();
    }, 2000);
    window.addEventListener('pagehide', this.onUnload);
  }

  private beat() {
    if (this.self) this.bc.postMessage({ k: 'presence', key: this.key, state: this.self });
  }

  private emitPresence() {
    const list: PresenceMember[] = [...this.peers].map(([key, v]) => ({ key, state: v.state }));
    if (this.self) list.push({ key: this.key, state: this.self });
    this.presenceCb?.(list);
  }

  track(state: Record<string, unknown>) {
    this.self = state;
    this.beat();
    this.emitPresence();
  }

  onPresence(cb: (m: PresenceMember[]) => void) {
    this.presenceCb = cb;
  }

  onMessage(cb: (p: Record<string, unknown>) => void) {
    this.messageCb = cb;
  }

  send(payload: Record<string, unknown>) {
    this.bc.postMessage({ k: 'msg', payload });
  }

  unsubscribe() {
    clearInterval(this.timer);
    this.onUnload();
    window.removeEventListener('pagehide', this.onUnload);
    this.bc.close();
  }
}
