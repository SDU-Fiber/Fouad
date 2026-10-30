import { useEffect, useMemo, useState } from 'react';
import {
  Check, CheckCircle2, Circle, Copy, Gavel, Hand, ListChecks, Lock, MessageSquare, Mic, MicOff, MoreVertical, NotebookPen,
  Plus, Star, Trash2, Unlock, UserCheck, UserMinus, Users, VideoOff, X,
} from 'lucide-react';
import { useApp } from '../data/AppContext';
import { canHostControl } from '../lib/permissions';
import type { Meeting, MeetingNote } from '../lib/types';
import { cls, fmtDue, fmtDuration, fmtTime, uid } from '../lib/utils';
import { Chat } from '../components/Chat';
import { emptyTask, TaskFields, type TaskDraft } from '../components/forms';
import { Avatar, Menu, PRIORITY_LABEL, PRIORITY_TONE, Tabs, TASK_STATUS_LABEL, useAction } from '../components/ui';
import { useMeetingActions } from '../components/meetingActions';
import type { MeshEngine, PeerState, RemotePeer } from '../rtc/MeshEngine';

export type PanelTab = 'people' | 'chat' | 'agenda' | 'notes' | 'actions' | 'attendance';

interface Props {
  meeting: Meeting;
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  onClose: () => void;
  peers: RemotePeer[];
  local: PeerState;
  engine: MeshEngine | null;
  leader: boolean;
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function People({ meeting, peers, local, engine }: Pick<Props, 'meeting' | 'peers' | 'local' | 'engine'>) {
  const { db, me, backend, userById } = useApp();
  const { copyLink } = useMeetingActions();
  const run = useAction();
  const host = canHostControl(me, meeting, db);
  const parts = db.meeting_participants.filter((p) => p.meeting_id === meeting.id);
  const waiting = parts.filter((p) => p.admission === 'pending');
  const inRoom = new Set([local.userId, ...peers.map((p) => p.userId)]);
  const notJoined = parts.filter((p) => !inRoom.has(p.user_id) && (p.admission === 'invited' || p.admission === 'admitted'));
  const everyone: PeerState[] = [local, ...peers];
  const cmd = (to: string, action: string) => engine?.broadcast({ type: 'cmd', to, action });
  const remove = (userId: string) =>
    run(async () => {
      // Persist first (blocks rejoining via join_meeting), then tell the client to leave now.
      const p = parts.find((x) => x.user_id === userId);
      if (p) await backend.update('meeting_participants', p.id, { admission: 'removed' });
      cmd(userId, 'remove');
    }, 'Participant removed');

  return (
    <div className="col gap-12">
      {host && (
        <div className="row wrap gap-4">
          <button className="btn btn-outline btn-xs" onClick={() => { engine?.broadcast({ type: 'cmd', action: 'muteAll' }); }}><MicOff size={13} /> Mute all</button>
          <button className={cls('btn btn-xs', meeting.locked ? 'btn-dark' : 'btn-outline')} onClick={() => run(() => backend.update('meetings', meeting.id, { locked: !meeting.locked }), meeting.locked ? 'Meeting unlocked' : 'Meeting locked — nobody new can join')}>
            {meeting.locked ? <Lock size={13} /> : <Unlock size={13} />} {meeting.locked ? 'Locked' : 'Lock meeting'}
          </button>
          <button className="btn btn-outline btn-xs" onClick={() => copyLink(meeting)}><Copy size={13} /> Invite link</button>
        </div>
      )}
      {host && waiting.length > 0 && (
        <div className="card" style={{ padding: 10, borderColor: 'var(--amber)' }}>
          <div className="label row"><Hand size={14} className="amber" /> Waiting for approval ({waiting.length})</div>
          {waiting.map((p) => (
            <div key={p.id} className="person">
              <Avatar user={userById(p.user_id)} size="sm" />
              <span className="grow small strong truncate">{userById(p.user_id)?.full_name}</span>
              <button className="btn btn-primary btn-xs" onClick={() => run(() => backend.update('meeting_participants', p.id, { admission: 'admitted' }))}><Check size={12} /> Admit</button>
              <button className="btn btn-ghost btn-xs" onClick={() => run(() => backend.update('meeting_participants', p.id, { admission: 'denied' }))}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="label">In the meeting ({everyone.length})</div>
        {everyone.map((p) => {
          const u = userById(p.userId);
          const isMe = p.peerId === local.peerId;
          return (
            <div key={p.peerId} className="person">
              <Avatar user={u} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small strong truncate">{u?.full_name ?? p.name}{isMe && <span className="faint"> (you)</span>}</div>
                <div className="xs muted">{u?.id === meeting.host_id ? 'Host' : canHostControl(u ?? me, meeting, db) && u ? 'Co-host' : u?.title}{p.screen ? ' · presenting' : ''}</div>
              </div>
              {p.hand && <Hand size={15} className="amber" />}
              {p.mic ? <Mic size={15} className="muted" /> : <MicOff size={15} className="red" />}
              {!p.cam && <VideoOff size={15} className="faint" />}
              {host && !isMe && (
                <Menu trigger={(_, t) => <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={t}><MoreVertical size={15} /></button>}>
                  {(close) => (
                    <>
                      <button className="menu-item" onClick={() => { cmd(p.userId, 'mute'); close(); }}><MicOff size={14} /> Mute</button>
                      <button className="menu-item" onClick={() => { cmd(p.userId, 'camOff'); close(); }}><VideoOff size={14} /> Turn off camera</button>
                      {p.hand && <button className="menu-item" onClick={() => { cmd(p.userId, 'lowerHand'); close(); }}><Hand size={14} /> Lower hand</button>}
                      <button className="menu-item danger" onClick={() => { close(); if (confirm(`Remove ${u?.full_name ?? 'this person'} from the meeting?`)) void remove(p.userId); }}><UserMinus size={14} /> Remove from meeting</button>
                    </>
                  )}
                </Menu>
              )}
            </div>
          );
        })}
      </div>
      {notJoined.length > 0 && (
        <div>
          <div className="label">Invited, not joined ({notJoined.length})</div>
          {notJoined.map((p) => (
            <div key={p.id} className="person" style={{ opacity: 0.7 }}>
              <Avatar user={userById(p.user_id)} size="sm" />
              <span className="grow small truncate">{userById(p.user_id)?.full_name}</span>
              <span className="badge tone-gray">Not joined</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Agenda({ meeting, leader }: { meeting: Meeting; leader: boolean }) {
  const { backend, db, me } = useApp();
  const run = useAction();
  const [text, setText] = useState('');
  const canEdit = canHostControl(me, meeting, db) || leader;
  const current = meeting.agenda.find((a) => !a.done);
  const total = meeting.agenda.reduce((s, a) => s + a.minutes, 0);
  const save = (agenda: Meeting['agenda']) => run(() => backend.update('meetings', meeting.id, { agenda }));
  return (
    <div className="col gap-12">
      {meeting.description && <p className="small muted">{meeting.description}</p>}
      <div className="row between"><span className="label">Agenda · {total} min</span><span className="xs muted">{meeting.agenda.filter((a) => a.done).length}/{meeting.agenda.length} done</span></div>
      <div className="agenda-list">
        {meeting.agenda.length === 0 && <p className="muted small">No agenda yet{canEdit ? ' — add the first topic below.' : '.'}</p>}
        {meeting.agenda.map((a, i) => (
          <div key={a.id} className={cls('agenda-item', a.done && 'done', current?.id === a.id && 'current')}>
            <button className="icon-btn" style={{ width: 26, height: 26 }} disabled={!canEdit} onClick={() => save(meeting.agenda.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))} aria-label="Toggle done">
              {a.done ? <CheckCircle2 size={17} className="green" /> : <Circle size={17} className={current?.id === a.id ? 'red' : 'faint'} />}
            </button>
            <span className="grow small t"><span className="faint num">{i + 1}.</span> {a.title}</span>
            <span className="faint xs">{a.minutes}m</span>
            {canEdit && <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => save(meeting.agenda.filter((x) => x.id !== a.id))}><X size={13} /></button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void save([...meeting.agenda, { id: uid().slice(0, 8), title: text.trim(), minutes: 5, done: false }]); setText(''); }}>
          <input className="input input-sm grow" placeholder="Add agenda item" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-outline btn-sm"><Plus size={14} /></button>
        </form>
      )}
    </div>
  );
}

function Notes({ meeting, onMakeAction, leader }: { meeting: Meeting; onMakeAction: (text: string) => void; leader: boolean }) {
  const { db, me, backend, userById } = useApp();
  const run = useAction();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<MeetingNote['kind']>('note');
  const host = canHostControl(me, meeting, db);
  const notes = db.meeting_notes.filter((n) => n.meeting_id === meeting.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText('');
    await run(() => backend.insert('meeting_notes', { meeting_id: meeting.id, author_id: me.id, kind, content }));
  };
  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="panel-body col gap-8">
        <p className="xs muted">Shared live with everyone. Mark key points as <b>decisions</b> and turn them into action items.</p>
        {notes.length === 0 && <p className="muted small">No notes yet.</p>}
        {notes.map((n) => {
          const mine = n.author_id === me.id || host;
          return (
            <div key={n.id} className={cls('note', n.kind === 'decision' && 'decision')}>
              <div className="row between">
                <span className="row xs muted"><Avatar user={userById(n.author_id)} size="xs" /> {userById(n.author_id)?.full_name.split(' ')[0]} · {fmtTime(n.created_at)}</span>
                {n.kind === 'decision' && <span className="badge tone-amber"><Gavel size={11} /> Decision</span>}
              </div>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
              <div className="note-actions">
                {mine && <button className="btn btn-ghost btn-xs" onClick={() => run(() => backend.update('meeting_notes', n.id, { kind: n.kind === 'decision' ? 'note' : 'decision' }))}><Star size={12} /> {n.kind === 'decision' ? 'Unmark' : 'Decision'}</button>}
                {leader && <button className="btn btn-ghost btn-xs" onClick={() => onMakeAction(n.content)}><ListChecks size={12} /> Action item</button>}
                {mine && <button className="btn btn-ghost btn-xs" onClick={() => run(() => backend.remove('meeting_notes', n.id))}><Trash2 size={12} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      <form className="panel-foot col gap-8" onSubmit={add}>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button type="button" className={cls(kind === 'note' && 'active')} onClick={() => setKind('note')}><NotebookPen size={13} /> Note</button>
          <button type="button" className={cls(kind === 'decision' && 'active')} onClick={() => setKind('decision')}><Gavel size={13} /> Decision</button>
        </div>
        <div className="row">
          <input className="input grow" placeholder={kind === 'decision' ? 'Record a decision…' : 'Add a note…'} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary btn-icon" disabled={!text.trim()}><Plus size={17} /></button>
        </div>
      </form>
    </div>
  );
}

function Actions({ meeting, leader, prefill, clearPrefill }: { meeting: Meeting; leader: boolean; prefill: string | null; clearPrefill: () => void }) {
  const { db, me, backend, userById } = useApp();
  const { createTask } = useMeetingActions();
  const run = useAction();
  const participantIds = new Set(db.meeting_participants.filter((p) => p.meeting_id === meeting.id).map((p) => p.user_id));
  const assignees = useMemo(() => db.users.filter((u) => participantIds.has(u.id)).sort((a, b) => a.full_name.localeCompare(b.full_name)), [db.users, participantIds.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<TaskDraft>(emptyTask());
  useEffect(() => {
    if (prefill) {
      setDraft((d) => ({ ...d, title: prefill }));
      clearPrefill();
    }
  }, [prefill, clearPrefill]);
  const taskIds = new Set(db.meeting_tasks.filter((t) => t.meeting_id === meeting.id).map((t) => t.task_id));
  const tasks = db.tasks.filter((t) => taskIds.has(t.id)).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => createTask({ ...draft, due_date: draft.due_date || null, team_id: meeting.team_id, room_id: meeting.room_id, description: draft.description || `Action item from "${meeting.title}"` }, meeting.id), 'Action item assigned');
    if (ok) setDraft({ ...emptyTask(), assignee_id: draft.assignee_id });
  };

  return (
    <div className="col gap-16">
      {leader ? (
        <form className="card col gap-12" style={{ padding: 12 }} onSubmit={save}>
          <TaskFields draft={draft} set={setDraft} assignees={assignees} compact />
          <button className="btn btn-primary" disabled={!draft.title.trim() || !draft.assignee_id}><Plus size={16} /> Assign action item</button>
        </form>
      ) : <p className="xs muted">Action items assigned in this meeting. Yours will also appear in Tasks.</p>}
      <div>
        <div className="label">Assigned in this meeting ({tasks.length})</div>
        {tasks.length === 0 && <p className="muted small mt-4">No action items yet.</p>}
        <div className="col mt-8" style={{ gap: 8 }}>
          {tasks.map((t) => (
            <div key={t.id} className="note">
              <div className="small strong">{t.title}</div>
              <div className="row wrap gap-4 xs">
                <span className="row gap-4"><Avatar user={userById(t.assignee_id)} size="xs" /> {userById(t.assignee_id)?.full_name}</span>
                <span className={cls('badge', PRIORITY_TONE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span>
                <span className="badge tone-gray">{fmtDue(t.due_date)}</span>
                <span className={cls('status-btn', t.status)} style={{ height: 22 }}>{TASK_STATUS_LABEL[t.status]}</span>
              </div>
              {(leader || t.created_by === me.id) && (
                <button className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={() => run(() => backend.remove('tasks', t.id))}><Trash2 size={12} /> Remove</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Attendance({ meeting }: { meeting: Meeting }) {
  const { db, userById } = useApp();
  useTick(5000);
  const parts = db.meeting_participants.filter((p) => p.meeting_id === meeting.id && p.admission !== 'denied' && p.admission !== 'pending');
  const rows = parts.map((p) => ({ p, a: db.attendance.find((x) => x.meeting_id === meeting.id && x.user_id === p.user_id) }));
  const present = rows.filter((r) => r.a?.status === 'present').length;
  const late = rows.filter((r) => r.a?.status === 'late').length;
  const missing = rows.filter((r) => !r.a || r.a.status === 'absent').length;
  const live = (a: NonNullable<(typeof rows)[number]['a']>) => a.total_seconds + (a.session_started_at ? (Date.now() - new Date(a.session_started_at).getTime()) / 1000 : 0);
  return (
    <div className="col gap-12">
      <div className="grid g-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        <div className="mini-kpi"><div className="v green">{present}</div><div className="l">Present</div></div>
        <div className="mini-kpi"><div className="v amber">{late}</div><div className="l">Late</div></div>
        <div className="mini-kpi"><div className="v red">{missing}</div><div className="l">Absent / not yet</div></div>
      </div>
      <p className="xs muted">Join/leave times are recorded by the server. “Late” = joined more than 5 min after the start.</p>
      <div className="list">
        {rows.map(({ p, a }) => (
          <div key={p.id} className="list-item">
            <Avatar user={userById(p.user_id)} size="sm" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small strong truncate">{userById(p.user_id)?.full_name}</div>
              <div className="xs muted num">{a?.joined_at ? `Joined ${fmtTime(a.joined_at)}${a.session_started_at ? ' · connected' : a.left_at ? ` · left ${fmtTime(a.left_at)}` : ''}` : 'Not joined'}</div>
            </div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
              <span className={cls('badge', !a ? 'tone-gray' : a.status === 'present' ? 'tone-green' : a.status === 'late' ? 'tone-amber' : 'tone-red')}>{a ? a.status : 'pending'}</span>
              {a && <span className="xs faint num">{fmtDuration(live(a))}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SidePanel(props: Props) {
  const { meeting, tab, setTab, onClose, leader } = props;
  const { db } = useApp();
  const [prefill, setPrefill] = useState<string | null>(null);
  const notes = db.meeting_notes.filter((n) => n.meeting_id === meeting.id).length;
  const actions = db.meeting_tasks.filter((t) => t.meeting_id === meeting.id).length;
  const waiting = db.meeting_participants.filter((p) => p.meeting_id === meeting.id && p.admission === 'pending').length;
  const items: { key: PanelTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'people', label: 'People', icon: <Users size={14} />, count: waiting || undefined },
    { key: 'chat', label: 'Chat', icon: <MessageSquare size={14} /> },
    { key: 'agenda', label: 'Agenda', icon: <ListChecks size={14} /> },
    { key: 'notes', label: 'Notes', icon: <NotebookPen size={14} />, count: notes },
    { key: 'actions', label: 'Actions', icon: <CheckCircle2 size={14} />, count: actions },
    ...(leader ? [{ key: 'attendance' as PanelTab, label: 'Attendance', icon: <UserCheck size={14} /> }] : []),
  ];
  return (
    <aside className="panel">
      <div className="panel-head">
        <h3>Meeting workspace</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
      </div>
      <Tabs value={tab} onChange={setTab} items={items} />
      {tab === 'chat' ? (
        <div className="panel-body flush"><Chat scope={{ meeting_id: meeting.id }} target={{ meeting_id: meeting.id }} placeholder="Message everyone" compact /></div>
      ) : tab === 'notes' ? (
        <div className="panel-body flush"><Notes meeting={meeting} leader={leader} onMakeAction={(t) => { setPrefill(t); setTab('actions'); }} /></div>
      ) : (
        <div className="panel-body">
          {tab === 'people' && <People {...props} />}
          {tab === 'agenda' && <Agenda meeting={meeting} leader={leader} />}
          {tab === 'actions' && <Actions meeting={meeting} leader={leader} prefill={prefill} clearPrefill={() => setPrefill(null)} />}
          {tab === 'attendance' && <Attendance meeting={meeting} />}
        </div>
      )}
    </aside>
  );
}
