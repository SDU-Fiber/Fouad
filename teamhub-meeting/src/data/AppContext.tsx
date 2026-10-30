import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Message, Row, Snapshot, SnapshotTable, TableName, User, UserStatus } from '../lib/types';
import { SNAPSHOT_TABLES, pkOf } from '../lib/types';
import { uid } from '../lib/utils';
import { type Backend, type ChangeEvent, type MessageScope, type RealtimeChannel } from './backend';

export interface LivePresence {
  status: UserStatus;
  activity: string;
}

interface AppState {
  backend: Backend;
  me: User;
  db: Snapshot;
  live: Map<string, LivePresence>;
  statusOf: (userId: string) => UserStatus;
  activityOf: (userId: string) => string;
  userById: (id: string | null | undefined) => User | undefined;
  /** Temporarily override my presence (e.g. "in_meeting"); pass null to restore. */
  setPresenceOverride: (p: LivePresence | null) => void;
  setMyStatus: (status: UserStatus, activity?: string) => Promise<void>;
  onMessageEvent: (cb: (e: ChangeEvent<'messages'>) => void) => () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
};

const STATUS_RANK: Record<UserStatus, number> = { in_meeting: 5, busy: 4, online: 3, away: 2, offline: 1 };

function applyChange(db: Snapshot, e: ChangeEvent): Snapshot {
  const table = e.table as SnapshotTable;
  if (!(SNAPSHOT_TABLES as readonly TableName[]).includes(table)) return db;
  const pk = pkOf(table);
  const rows = db[table] as unknown as Record<string, unknown>[];
  const row = e.row as unknown as Record<string, unknown>;
  const idx = rows.findIndex((r) => r[pk] === row[pk]);
  let next: Record<string, unknown>[];
  if (e.type === 'DELETE') {
    if (idx < 0) return db;
    next = rows.filter((_, i) => i !== idx);
  } else if (idx >= 0) {
    next = rows.slice();
    next[idx] = { ...rows[idx], ...row };
  } else next = [...rows, row];
  return { ...db, [table]: next };
}

export function AppProvider({ backend, me: initialMe, onSignedOut, children }: { backend: Backend; me: User; onSignedOut: () => void; children: ReactNode }) {
  const [db, setDb] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Map<string, LivePresence>>(new Map());
  const messageListeners = useRef(new Set<(e: ChangeEvent<'messages'>) => void>());
  const presenceChannel = useRef<RealtimeChannel | null>(null);
  const override = useRef<LivePresence | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const me = useMemo(() => db?.users.find((u) => u.id === initialMe.id) ?? initialMe, [db, initialMe]);
  const meRef = useRef(me);
  meRef.current = me;

  const refresh = useCallback(async () => {
    try {
      setDb(await backend.loadSnapshot());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [backend]);

  // initial load + realtime
  useEffect(() => {
    void refresh();
    const off = backend.subscribe((e) => {
      if (e.table === 'messages') return messageListeners.current.forEach((l) => l(e as ChangeEvent<'messages'>));
      // Access-changing rows (I was invited / added to a room or team) → reload what RLS now lets me see.
      const r = e.row as unknown as Record<string, unknown>;
      if ((['meeting_participants', 'room_members', 'team_members'] as TableName[]).includes(e.table) && r.user_id === initialMe.id) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => void refresh(), 350);
      }
      setDb((cur) => (cur ? applyChange(cur, e) : cur));
    });
    return () => {
      off();
      clearTimeout(reloadTimer.current);
    };
  }, [backend, refresh, initialMe.id]);

  // org-wide presence (online / away / in meeting) over realtime
  const trackPresence = useCallback(() => {
    const u = meRef.current;
    const hidden = document.visibilityState === 'hidden';
    const base: LivePresence = override.current ?? { status: u.status === 'offline' ? 'online' : u.status, activity: u.activity };
    const state = hidden && base.status === 'online' ? { ...base, status: 'away' as UserStatus } : base;
    presenceChannel.current?.track({ user_id: u.id, ...state });
  }, []);

  useEffect(() => {
    const ch = backend.channel('org-presence', { presenceKey: `${initialMe.id}:${uid().slice(0, 8)}`, private: false });
    presenceChannel.current = ch;
    ch.onPresence((members) => {
      const map = new Map<string, LivePresence>();
      members.forEach(({ state }) => {
        const s = state as { user_id?: string; status?: UserStatus; activity?: string };
        if (!s.user_id || !s.status) return;
        const prev = map.get(s.user_id);
        if (!prev || STATUS_RANK[s.status] > STATUS_RANK[prev.status]) map.set(s.user_id, { status: s.status, activity: s.activity ?? '' });
      });
      setLive(map);
    });
    let awayTimer: ReturnType<typeof setTimeout> | undefined;
    const onVis = () => {
      clearTimeout(awayTimer);
      if (document.visibilityState === 'hidden') awayTimer = setTimeout(trackPresence, 60_000);
      else trackPresence();
    };
    document.addEventListener('visibilitychange', onVis);
    ch.subscribe().then(trackPresence).catch(() => undefined);
    const beat = setInterval(() => {
      if (backend.mode === 'supabase') void backend.update('users', initialMe.id, { last_seen_at: new Date().toISOString() }).catch(() => undefined);
    }, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(awayTimer);
      clearInterval(beat);
      ch.unsubscribe();
      presenceChannel.current = null;
    };
  }, [backend, initialMe.id, trackPresence]);

  useEffect(trackPresence, [me.status, me.activity, trackPresence]);

  const value = useMemo<AppState | null>(() => {
    if (!db) return null;
    const usersById = new Map(db.users.map((u) => [u.id, u]));
    return {
      backend,
      me,
      db,
      live,
      userById: (id) => (id ? usersById.get(id) : undefined),
      statusOf: (id) => {
        const l = live.get(id);
        if (l) return l.status;
        if (id === me.id) return 'online';
        // Demo: seeded colleagues keep their scripted status. Production: not connected = offline.
        return backend.mode === 'demo' ? usersById.get(id)?.status ?? 'offline' : 'offline';
      },
      activityOf: (id) => live.get(id)?.activity || usersById.get(id)?.activity || '',
      setPresenceOverride: (p) => {
        override.current = p;
        trackPresence();
      },
      setMyStatus: async (status, activity) => {
        await backend.update('users', me.id, { status, ...(activity !== undefined ? { activity } : {}) });
      },
      onMessageEvent: (cb) => {
        messageListeners.current.add(cb);
        return () => void messageListeners.current.delete(cb);
      },
      refresh,
      signOut: async () => {
        await backend.signOut();
        onSignedOut();
      },
    };
  }, [db, me, live, backend, refresh, onSignedOut, trackPresence]);

  if (error)
    return (
      <div className="boot">
        <div className="boot-card">
          <h2>Couldn't load your workspace</h2>
          <p className="muted">{error}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>Retry</button>
        </div>
      </div>
    );
  if (!value) return <div className="boot"><div className="spinner" /></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Messages for one conversation, kept live through realtime. */
export function useMessages(scope: MessageScope | null) {
  const { backend, onMessageEvent, me } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const key = scope ? JSON.stringify(scope) : '';

  useEffect(() => {
    if (!scope) return;
    let alive = true;
    setLoading(true);
    backend.listMessages(scope).then((rows) => {
      if (!alive) return;
      setMessages(rows);
      setLoading(false);
    });
    const matches = (m: Message) =>
      'room_id' in scope ? m.room_id === scope.room_id : 'meeting_id' in scope ? m.meeting_id === scope.meeting_id : !!m.recipient_id && (m.sender_id === me.id || m.recipient_id === me.id);
    const off = onMessageEvent((e) => {
      if (e.type !== 'DELETE' && !matches(e.row)) return;
      setMessages((cur) => {
        if (e.type === 'DELETE') return cur.filter((m) => m.id !== e.row.id);
        const i = cur.findIndex((m) => m.id === e.row.id);
        if (i < 0) return [...cur, e.row];
        const next = cur.slice();
        next[i] = e.row;
        return next;
      });
    });
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, key, me.id]);

  return { messages, loading };
}

export type { Row };
