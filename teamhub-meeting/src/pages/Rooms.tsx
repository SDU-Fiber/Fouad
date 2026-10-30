import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft, Briefcase, CalendarPlus, CheckSquare, FileText, Hash, Lock, Megaphone, MessageSquare, Plus, Settings2,
  Shield, Star, Sun, Target, Upload, Users, Video, Wallet, Wifi, type LucideIcon,
} from 'lucide-react';
import { useApp, useMessages } from '../data/AppContext';
import { can, colleagueIds } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { Message, TeamRoom } from '../lib/types';
import { cls, fmtBytes, sortBy, timeAgo, uid } from '../lib/utils';
import { Chat } from '../components/Chat';
import { MeetingCard } from '../components/cards';
import { MeetingFormModal, TaskFormModal } from '../components/forms';
import { Avatar, AvatarStack, Empty, Field, Modal, STATUS_LABEL, StatusDot, Tabs, TASK_STATUS_LABEL, Toggle, useAction } from '../components/ui';
import { useMeetingActions } from '../components/meetingActions';

export const ROOM_ICONS: Record<string, LucideIcon> = { hash: Hash, sun: Sun, target: Target, wallet: Wallet, wifi: Wifi, shield: Shield, briefcase: Briefcase, star: Star };
const COLORS = ['#E60000', '#B45309', '#7C3AED', '#0891B2', '#059669', '#2563EB', '#18181B', '#DB2777'];

export function RoomIcon({ room, size = 32 }: { room: Pick<TeamRoom, 'icon' | 'color'>; size?: number }) {
  const Icon = ROOM_ICONS[room.icon] ?? Hash;
  return <div className="room-icon" style={{ background: room.color, width: size, height: size }}><Icon size={size * 0.5} /></div>;
}

function RoomFormModal({ room, onClose }: { room?: TeamRoom; onClose: () => void }) {
  const { db, me, backend } = useApp();
  const run = useAction();
  const [name, setName] = useState(room?.name ?? '');
  const [description, setDescription] = useState(room?.description ?? '');
  const [icon, setIcon] = useState(room?.icon ?? 'hash');
  const [color, setColor] = useState(room?.color ?? COLORS[0]!);
  const [isPrivate, setPrivate] = useState(room?.is_private ?? false);
  const current = new Set(room ? db.room_members.filter((m) => m.room_id === room.id).map((m) => m.user_id) : [me.id]);
  const [members, setMembers] = useState<Set<string>>(current);
  const people = db.users.filter((u) => colleagueIds(me, db).has(u.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));

  const save = async () => {
    const ok = await run(async () => {
      let r = room;
      if (r) r = await backend.update('team_rooms', r.id, { name, description, icon, color, is_private: isPrivate });
      else [r] = await backend.insert('team_rooms', { name, description, icon, color, is_private: isPrivate, created_by: me.id });
      const existing = db.room_members.filter((m) => m.room_id === r!.id);
      const add = [...members].filter((id) => !existing.some((m) => m.user_id === id));
      if (add.length) await backend.insert('room_members', add.map((user_id) => ({ room_id: r!.id, user_id, member_role: user_id === me.id ? ('owner' as const) : ('member' as const) })));
      for (const m of existing) if (!members.has(m.user_id) && m.user_id !== me.id) await backend.remove('room_members', m.id);
      return r!;
    }, room ? 'Room updated' : 'Room created');
    if (ok) {
      onClose();
      navigate(`/rooms/${ok.id}`);
    }
  };

  return (
    <Modal title={room ? 'Room settings' : 'Create team room'} subtitle="Persistent space with chat, meetings, files and tasks." onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!name.trim()} onClick={save}>{room ? 'Save' : 'Create room'}</button></>}>
      <div className="col gap-12">
        <div className="row gap-12">
          <RoomIcon room={{ icon, color }} size={44} />
          <Field label="Room name" className="grow"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. iPay Room" autoFocus /></Field>
        </div>
        <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="field">
          <span className="label">Icon & colour</span>
          <div className="row wrap gap-4">
            {Object.entries(ROOM_ICONS).map(([k, I]) => <button key={k} type="button" className={cls('chip', icon === k && 'active')} onClick={() => setIcon(k)}><I size={14} /></button>)}
          </div>
          <div className="row wrap gap-4">
            {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: 8, background: c, border: color === c ? '3px solid var(--ink)' : '0' }} aria-label={c} />)}
          </div>
        </div>
        <div className="row between"><span className="small strong row"><Lock size={14} /> Private room (members only)</span><Toggle on={isPrivate} onChange={setPrivate} /></div>
        <div className="field">
          <span className="label">Members ({members.size})</span>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 4 }}>
            {people.map((u) => (
              <label key={u.id} className="check-row">
                <input type="checkbox" checked={members.has(u.id)} disabled={u.id === me.id} onChange={() => setMembers((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
                <Avatar user={u} size="xs" /> <span className="grow small">{u.full_name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RoomFiles({ room }: { room: TeamRoom }) {
  const { backend, me, userById } = useApp();
  const run = useAction();
  const { messages } = useMessages({ room_id: room.id });
  const files = messages.flatMap((m) => m.attachments.map((a) => ({ a, m }))).reverse();
  const upload = async (f: File) => {
    const url = await run(() => backend.uploadFile('attachments', `${room.id}/${uid()}-${f.name}`, f));
    if (url) await run(() => backend.insert('messages', { room_id: room.id, sender_id: me.id, body: '', attachments: [{ name: f.name, size: f.size, type: f.type, url }] }), 'File shared');
  };
  return (
    <div className="room-pane">
      <label className="btn btn-outline btn-sm" style={{ marginBottom: 12 }}>
        <Upload size={15} /> Upload file
        <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </label>
      {files.length === 0 ? <Empty icon={<FileText size={20} />} title="No files yet">Files shared in the room chat appear here.</Empty> : (
        <div className="list">
          {files.map(({ a, m }, i) => (
            <a key={i} href={a.url} download={a.name} target="_blank" rel="noreferrer" className="list-item">
              <div className="stat-icon"><FileText size={15} /></div>
              <div className="grow"><div className="small strong truncate">{a.name}</div><div className="xs muted">{fmtBytes(a.size)} · {userById(m.sender_id)?.full_name} · {timeAgo(m.created_at)}</div></div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

type RoomTab = 'chat' | 'meetings' | 'tasks' | 'files' | 'members' | 'announcements';

function RoomView({ room }: { room: TeamRoom }) {
  const { db, me, backend, statusOf, activityOf } = useApp();
  const run = useAction();
  const { startInstant } = useMeetingActions();
  const [tab, setTab] = useState<RoomTab>('chat');
  const [scheduling, setScheduling] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [editing, setEditing] = useState(false);
  const members = db.room_members.filter((m) => m.room_id === room.id);
  const memberIds = members.map((m) => m.user_id);
  const isOwner = room.created_by === me.id || members.some((m) => m.user_id === me.id && m.member_role === 'owner') || me.role === 'admin';
  const meetings = sortBy(db.meetings.filter((m) => m.room_id === room.id), (m) => (m.status === 'live' ? '0' : m.status === 'scheduled' ? '1' + m.scheduled_at : '2' + (9e15 - new Date(m.scheduled_at).getTime())));
  const roomMeetingIds = new Set(meetings.map((m) => m.id));
  const taskIds = new Set(db.meeting_tasks.filter((t) => roomMeetingIds.has(t.meeting_id)).map((t) => t.task_id));
  const tasks = db.tasks.filter((t) => t.room_id === room.id || taskIds.has(t.id));
  const announcements = sortBy(db.announcements.filter((a) => !a.team_id || a.team_id === room.team_id), (a) => a.created_at, -1).slice(0, 10);

  return (
    <div className="card room-view">
      <div className="room-head">
        <div className="row">
          <button className="icon-btn show-mobile" onClick={() => navigate('/rooms')} aria-label="Back"><ArrowLeft size={18} /></button>
          <RoomIcon room={room} size={40} />
          <div className="grow">
            <h2 className="row gap-4">{room.name} {room.is_private && <Lock size={14} className="faint" />}</h2>
            <div className="muted small truncate">{room.description}</div>
          </div>
          <span className="hide-mobile"><AvatarStack ids={memberIds} max={5} size="sm" /></span>
          {isOwner && <button className="icon-btn" title="Room settings" onClick={() => setEditing(true)}><Settings2 size={18} /></button>}
          {can(me, 'meeting.create') && (
            <button className="btn btn-primary btn-sm" onClick={() => startInstant({ title: `${room.name} meeting`, room_id: room.id, invitees: memberIds.filter((id) => id !== me.id) })}>
              <Video size={15} /> <span className="hide-mobile">Meet now</span>
            </button>
          )}
        </div>
        <Tabs value={tab} onChange={setTab} items={[
          { key: 'chat', label: 'Chat', icon: <MessageSquare size={14} /> },
          { key: 'meetings', label: 'Meetings', icon: <Video size={14} />, count: meetings.filter((m) => m.status !== 'ended').length },
          { key: 'tasks', label: 'Tasks', icon: <CheckSquare size={14} />, count: tasks.filter((t) => t.status !== 'completed').length },
          { key: 'files', label: 'Files', icon: <FileText size={14} /> },
          { key: 'members', label: 'Members', icon: <Users size={14} />, count: members.length },
          { key: 'announcements', label: 'Announcements', icon: <Megaphone size={14} /> },
        ]} />
      </div>
      <div className="room-body">
        {tab === 'chat' && <Chat key={room.id} scope={{ room_id: room.id }} target={{ room_id: room.id }} placeholder={`Message ${room.name}`} />}
        {tab === 'meetings' && (
          <div className="room-pane">
            {can(me, 'meeting.create') && <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={() => setScheduling(true)}><CalendarPlus size={15} /> Schedule meeting in this room</button>}
            {meetings.length === 0 ? <Empty icon={<Video size={20} />} title="No meetings yet" /> : <div className="grid g-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>{meetings.slice(0, 12).map((m) => <MeetingCard key={m.id} meeting={m} />)}</div>}
          </div>
        )}
        {tab === 'tasks' && (
          <div className="room-pane">
            {can(me, 'task.create') && <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={() => setNewTask(true)}><Plus size={15} /> New room task</button>}
            {tasks.length === 0 ? <Empty icon={<CheckSquare size={20} />} title="No tasks in this room" /> : (
              <div className="list">
                {sortBy(tasks, (t) => (t.status === 'completed' ? '1' : '0') + (t.due_date ?? '')).map((t) => (
                  <div key={t.id} className="list-item">
                    <span className={`prio prio-${t.priority}`} />
                    <span className={cls('grow small strong truncate', t.status === 'completed' && 'faint')}>{t.title}</span>
                    <Avatar user={db.users.find((u) => u.id === t.assignee_id)} size="xs" />
                    {t.assignee_id === me.id || can(me, 'task.viewAll') ? (
                      <select className={cls('status-btn', t.status)} value={t.status} onChange={(e) => run(() => backend.update('tasks', t.id, { status: e.target.value as typeof t.status }))}>
                        {(['todo', 'in_progress', 'completed'] as const).map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                      </select>
                    ) : <span className={cls('status-btn', t.status)}>{TASK_STATUS_LABEL[t.status]}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'files' && <RoomFiles room={room} />}
        {tab === 'members' && (
          <div className="room-pane">
            <div className="list">
              {members.map((m) => {
                const u = db.users.find((x) => x.id === m.user_id);
                if (!u) return null;
                return (
                  <div key={m.id} className="list-item">
                    <Avatar user={u} size="sm" status={statusOf(u.id)} />
                    <div className="grow"><div className="small strong">{u.full_name} {m.member_role === 'owner' && <span className="badge tone-red">Owner</span>}</div><div className="xs muted">{STATUS_LABEL[statusOf(u.id)]} · {activityOf(u.id) || u.title}</div></div>
                    {u.id !== me.id && <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/rooms/dm/${u.id}`)}><MessageSquare size={13} /></button>}
                    {isOwner && u.id !== me.id && <button className="btn btn-danger btn-xs" onClick={() => run(() => backend.remove('room_members', m.id), 'Removed from room')}>Remove</button>}
                  </div>
                );
              })}
            </div>
            {isOwner && <button className="btn btn-outline btn-sm mt-12" onClick={() => setEditing(true)}><Plus size={14} /> Add members</button>}
          </div>
        )}
        {tab === 'announcements' && (
          <div className="room-pane col gap-12">
            {announcements.map((a) => (
              <div key={a.id} className={cls('card announce', a.priority === 'important' && 'important')} style={{ padding: 14 }}>
                <div className="announce-icon"><Megaphone size={17} /></div>
                <div className="grow"><div className="strong">{a.title}</div><div className="small">{a.body}</div><div className="xs faint mt-4">{timeAgo(a.created_at)}</div></div>
              </div>
            ))}
            {can(me, 'announcement.create') && <a href="#/announcements" className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }}><Megaphone size={14} /> Publish announcement</a>}
          </div>
        )}
      </div>
      {scheduling && <MeetingFormModal onClose={() => setScheduling(false)} defaults={{ room_id: room.id, invitees: memberIds.filter((id) => id !== me.id), title: `${room.name.replace(/ Room$/, '')} meeting` }} />}
      {newTask && <TaskFormModal onClose={() => setNewTask(false)} defaults={{ room_id: room.id, team_id: room.team_id }} />}
      {editing && <RoomFormModal room={room} onClose={() => setEditing(false)} />}
    </div>
  );
}

function DmView({ peerId }: { peerId: string }) {
  const { me, userById, statusOf, activityOf } = useApp();
  const { startInstant } = useMeetingActions();
  const peer = userById(peerId);
  const filter = useCallback((m: Message) => (m.sender_id === me.id && m.recipient_id === peerId) || (m.sender_id === peerId && m.recipient_id === me.id), [me.id, peerId]);
  if (!peer) return <div className="card room-view"><Empty icon={<MessageSquare size={20} />} title="Person not found" /></div>;
  const status = statusOf(peer.id);
  return (
    <div className="card room-view">
      <div className="room-head" style={{ paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
        <div className="row">
          <button className="icon-btn show-mobile" onClick={() => navigate('/rooms')} aria-label="Back"><ArrowLeft size={18} /></button>
          <Avatar user={peer} status={status} />
          <div className="grow">
            <h2>{peer.full_name}</h2>
            <div className="muted small row gap-4"><StatusDot status={status} /> {STATUS_LABEL[status]}{status !== 'offline' && activityOf(peer.id) ? ` · ${activityOf(peer.id)}` : ''}</div>
          </div>
          {can(me, 'meeting.create') && <button className="btn btn-primary btn-sm" onClick={() => startInstant({ title: `Call with ${peer.full_name.split(' ')[0]}`, invitees: [peer.id] })}><Video size={15} /> <span className="hide-mobile">Meet now</span></button>}
        </div>
      </div>
      <div className="room-body">
        <Chat key={peerId} scope={{ dm: true }} filter={filter} target={{ recipient_id: peerId }} placeholder={`Message ${peer.full_name.split(' ')[0]}`} />
      </div>
    </div>
  );
}

export function RoomsPage({ parts }: { parts: string[] }) {
  const { db, me, statusOf, userById } = useApp();
  const [creating, setCreating] = useState(false);
  const [newDm, setNewDm] = useState(false);
  const { messages: dms } = useMessages({ dm: true });
  const rooms = sortBy(db.team_rooms, (r) => r.created_at);
  const isDm = parts[0] === 'dm';
  const activeId = isDm ? parts[1] : parts[0];
  const activeRoom = !isDm ? rooms.find((r) => r.id === activeId) : undefined;

  const threads = useMemo(() => {
    const map = new Map<string, Message>();
    dms.forEach((m) => {
      const peer = m.sender_id === me.id ? m.recipient_id! : m.sender_id;
      const prev = map.get(peer);
      if (!prev || prev.created_at < m.created_at) map.set(peer, m);
    });
    return sortBy([...map.entries()], ([, m]) => m.created_at, -1);
  }, [dms, me.id]);

  const hasActive = !!(activeRoom || (isDm && activeId));
  const colleagues = db.users.filter((u) => u.id !== me.id && colleagueIds(me, db).has(u.id));

  return (
    <>
      <div className={cls('rooms', hasActive && 'has-active')}>
        <div className="card rooms-list">
          <div className="row between" style={{ padding: '14px 14px 8px' }}>
            <h3>Team Rooms</h3>
            {can(me, 'room.create') && <button className="btn btn-soft btn-xs" onClick={() => setCreating(true)}><Plus size={13} /> New</button>}
          </div>
          <div className="rooms-scroll">
            {rooms.map((r) => (
              <button key={r.id} className={cls('room-link', activeRoom?.id === r.id && 'active')} onClick={() => navigate(`/rooms/${r.id}`)}>
                <RoomIcon room={r} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="small strong truncate row gap-4">{r.name} {r.is_private && <Lock size={11} className="faint" />}</span>
                  <span className="xs muted truncate" style={{ display: 'block' }}>{db.room_members.filter((m) => m.room_id === r.id).length} members{db.meetings.some((m) => m.room_id === r.id && m.status === 'live') ? ' · 🔴 live meeting' : ''}</span>
                </span>
              </button>
            ))}
            <div className="row between" style={{ padding: '16px 6px 6px' }}>
              <span className="menu-label" style={{ padding: 0 }}>Direct messages</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setNewDm(true)}><Plus size={13} /></button>
            </div>
            {threads.map(([peerId, last]) => {
              const u = userById(peerId);
              if (!u) return null;
              return (
                <button key={peerId} className={cls('room-link', isDm && activeId === peerId && 'active')} onClick={() => navigate(`/rooms/dm/${peerId}`)}>
                  <Avatar user={u} size="sm" status={statusOf(u.id)} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="small strong truncate" style={{ display: 'block' }}>{u.full_name}</span>
                    <span className="xs muted truncate" style={{ display: 'block' }}>{last.sender_id === me.id ? 'You: ' : ''}{last.body || 'Attachment'}</span>
                  </span>
                </button>
              );
            })}
            {threads.length === 0 && <p className="xs muted" style={{ padding: '0 8px' }}>No direct messages yet.</p>}
          </div>
        </div>
        {activeRoom ? <RoomView room={activeRoom} key={activeRoom.id} /> : isDm && activeId ? <DmView peerId={activeId} /> : (
          <div className="card room-view" style={{ display: 'grid', placeItems: 'center' }}>
            <Empty icon={<MessageSquare size={22} />} title="Pick a room or conversation">Rooms keep chat, meetings, files, tasks and announcements together.</Empty>
          </div>
        )}
      </div>
      {creating && <RoomFormModal onClose={() => setCreating(false)} />}
      {newDm && (
        <Modal title="New message" onClose={() => setNewDm(false)}>
          <div className="list">
            {colleagues.map((u) => (
              <button key={u.id} className="room-link" onClick={() => { setNewDm(false); navigate(`/rooms/dm/${u.id}`); }}>
                <Avatar user={u} size="sm" status={statusOf(u.id)} />
                <span className="grow small strong">{u.full_name} <span className="faint">· {u.title}</span></span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
