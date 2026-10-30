import { useMemo, useState } from 'react';
import { Globe, KeyRound, Lock, Plus, ShieldCheck, Trash2, Users, Video } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { managedTeamIds, managedUserIds } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { AgendaItem, MeetingAccess, Priority, Task } from '../lib/types';
import { addDays, cls, uid, ymd } from '../lib/utils';
import { Avatar, Field, Modal, PRIORITY_LABEL, Seg, Toggle, useAction } from './ui';
import { useMeetingActions, type MeetingDraft } from './meetingActions';

const ACCESS: { key: MeetingAccess; title: string; desc: string; icon: typeof Lock }[] = [
  { key: 'team', title: 'Team members only', desc: 'Invited people and team members', icon: Users },
  { key: 'link', title: 'Anyone with link', desc: 'Any signed-in colleague with the link', icon: Globe },
  { key: 'password', title: 'Password required', desc: 'Link + meeting password', icon: KeyRound },
  { key: 'approval', title: 'Manager approval', desc: 'Uninvited people wait for approval', icon: ShieldCheck },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function MeetingFormModal({ onClose, defaults }: { onClose: () => void; defaults?: Partial<MeetingDraft> & { startNow?: boolean } }) {
  const { me, db } = useApp();
  const { createMeeting } = useMeetingActions();
  const run = useAction();
  const next = new Date();
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);

  const [mode, setMode] = useState<'now' | 'later'>(defaults?.startNow ? 'now' : 'later');
  const [title, setTitle] = useState(defaults?.title ?? '');
  const [description, setDescription] = useState(defaults?.description ?? '');
  const [date, setDate] = useState(ymd(next));
  const [time, setTime] = useState(`${pad(next.getHours())}:${pad(next.getMinutes())}`);
  const [duration, setDuration] = useState(defaults?.duration_min ?? 30);
  const [teamId, setTeamId] = useState<string | null>(defaults?.team_id ?? null);
  const [roomId, setRoomId] = useState<string | null>(defaults?.room_id ?? null);
  const [invitees, setInvitees] = useState<Set<string>>(new Set(defaults?.invitees ?? []));
  const [agenda, setAgenda] = useState<AgendaItem[]>(defaults?.agenda ?? []);
  const [agendaInput, setAgendaInput] = useState('');
  const [access, setAccess] = useState<MeetingAccess>(defaults?.access ?? 'team');
  const [password, setPassword] = useState('');
  const [recording, setRecording] = useState(defaults?.recording_enabled ?? false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const teams = db.teams.filter((t) => managedTeamIds(me, db).includes(t.id));
  const rooms = db.team_rooms;
  const people = useMemo(() => {
    const allowed = managedUserIds(me, db);
    return db.users.filter((u) => u.id !== me.id && (allowed.has(u.id) || me.role !== 'employee')).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [db, me]);
  const visible = people.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()));

  const pickTeam = (id: string | null) => {
    setTeamId(id);
    if (id) setInvitees(new Set(db.team_members.filter((m) => m.team_id === id && m.user_id !== me.id).map((m) => m.user_id)));
  };
  const pickRoom = (id: string | null) => {
    setRoomId(id);
    if (id) setInvitees(new Set(db.room_members.filter((m) => m.room_id === id && m.user_id !== me.id).map((m) => m.user_id)));
    if (id && !title) setTitle(`${db.team_rooms.find((r) => r.id === id)?.name.replace(/ Room$/, '')} meeting`);
  };
  const toggle = (id: string) => setInvitees((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const addAgenda = () => {
    if (!agendaInput.trim()) return;
    setAgenda((a) => [...a, { id: uid().slice(0, 8), title: agendaInput.trim(), minutes: 10, done: false }]);
    setAgendaInput('');
  };

  const valid = title.trim().length > 1 && (access !== 'password' || password.length >= 4);

  const submit = async () => {
    setBusy(true);
    const scheduled = mode === 'now' ? new Date() : new Date(`${date}T${time}`);
    const m = await run(() =>
      createMeeting({
        title, description, scheduled_at: scheduled.toISOString(), duration_min: duration, team_id: teamId, room_id: roomId,
        invitees: [...invitees], agenda, access, password, recording_enabled: recording,
      }),
      mode === 'now' ? undefined : 'Meeting scheduled — invitations sent',
    );
    setBusy(false);
    if (!m) return;
    onClose();
    if (mode === 'now') navigate(`/meet/${m.id}`);
  };

  return (
    <Modal
      wide
      title={mode === 'now' ? 'Start a meeting' : 'Schedule a meeting'}
      subtitle="Every meeting ends with notes, decisions and assigned actions."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>
            <Video size={16} /> {mode === 'now' ? 'Start now' : 'Schedule & invite'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="full row between wrap">
          <Seg value={mode} onChange={setMode} items={[{ key: 'later', label: 'Schedule' }, { key: 'now', label: 'Start now' }]} />
          <label className="row small strong">Record meeting <Toggle on={recording} onChange={setRecording} label="Record" /></label>
        </div>
        <Field label="Title" className="full">
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Daily Sales Meeting" />
        </Field>
        {mode === 'later' && (
          <>
            <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <div className="row gap-12">
              <Field label="Time" className="grow"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
              <Field label="Duration" className="grow">
                <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
              </Field>
            </div>
          </>
        )}
        <Field label="Team room">
          <select className="select" value={roomId ?? ''} onChange={(e) => pickRoom(e.target.value || null)}>
            <option value="">No room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Team">
          <select className="select" value={teamId ?? ''} onChange={(e) => pickTeam(e.target.value || null)}>
            <option value="">Cross-team / custom</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Description" className="full">
          <textarea className="textarea" rows={2} style={{ minHeight: 60 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should this meeting achieve?" />
        </Field>

        <div className="field full">
          <div className="row between">
            <span className="label">Invite team members <span className="faint">({invitees.size})</span></span>
            <div className="row">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setInvitees(new Set(people.map((p) => p.id)))}>All</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setInvitees(new Set())}>None</button>
            </div>
          </div>
          <input className="input input-sm" placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 4 }}>
            {visible.map((u) => (
              <label key={u.id} className="check-row">
                <input type="checkbox" checked={invitees.has(u.id)} onChange={() => toggle(u.id)} />
                <Avatar user={u} size="xs" />
                <span className="grow truncate">{u.full_name}</span>
                <span className="faint xs">{u.title}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="field full">
          <span className="label">Agenda</span>
          <div className="agenda-list">
            {agenda.map((a, i) => (
              <div key={a.id} className="agenda-item">
                <span className="faint small num">{i + 1}.</span>
                <span className="grow t">{a.title}</span>
                <input className="input input-sm num" style={{ width: 64 }} type="number" min={1} value={a.minutes} onChange={(e) => setAgenda((cur) => cur.map((x) => (x.id === a.id ? { ...x, minutes: Number(e.target.value) } : x)))} />
                <span className="faint xs">min</span>
                <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setAgenda((cur) => cur.filter((x) => x.id !== a.id))}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="row">
              <input className="input input-sm grow" placeholder="Add agenda item and press Enter" value={agendaInput} onChange={(e) => setAgendaInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAgenda())} />
              <button type="button" className="btn btn-outline btn-sm" onClick={addAgenda}><Plus size={14} /> Add</button>
            </div>
          </div>
        </div>

        <div className="field full">
          <span className="label">Meeting security</span>
          <div className="option-grid">
            {ACCESS.map(({ key, title: t, desc, icon: Icon }) => (
              <button type="button" key={key} className={cls('option', access === key && 'active')} onClick={() => setAccess(key)}>
                <Icon size={18} className={access === key ? 'red' : 'muted'} />
                <span><span className="t" style={{ display: 'block' }}>{t}</span><span className="d">{desc}</span></span>
              </button>
            ))}
          </div>
          {access === 'password' && (
            <input className="input mt-8" type="text" placeholder="Meeting password (min. 4 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </div>
      </div>
    </Modal>
  );
}

export const DUE_PRESETS = () => {
  const today = new Date();
  const friday = addDays(today, (5 - today.getDay() + 7) % 7 || 7);
  return [
    { label: 'Today', value: ymd(today) },
    { label: 'Tomorrow', value: ymd(addDays(today, 1)) },
    { label: 'This week', value: ymd(addDays(friday, -1)) },
    { label: 'Next week', value: ymd(addDays(today, 7)) },
  ];
};

export interface TaskDraft {
  title: string;
  description: string;
  assignee_id: string;
  priority: Priority;
  due_date: string;
}

/** Shared task fields (used by the task modal and the in-meeting action item form). */
export function TaskFields({ draft, set, assignees, compact }: { draft: TaskDraft; set: (d: TaskDraft) => void; assignees: { id: string; full_name: string }[]; compact?: boolean }) {
  return (
    <div className="col gap-12">
      <Field label={compact ? 'Action item' : 'Title'}>
        <input className="input" value={draft.title} onChange={(e) => set({ ...draft, title: e.target.value })} placeholder="e.g. Follow up 5 iPay customers" autoFocus={!compact} />
      </Field>
      {!compact && (
        <Field label="Description">
          <textarea className="textarea" rows={3} value={draft.description} onChange={(e) => set({ ...draft, description: e.target.value })} />
        </Field>
      )}
      <Field label="Assigned to">
        <select className="select" value={draft.assignee_id} onChange={(e) => set({ ...draft, assignee_id: e.target.value })}>
          <option value="" disabled>Select a person</option>
          {assignees.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </Field>
      <div className="field">
        <span className="label">Priority</span>
        <div className="row wrap gap-4">
          {(['low', 'medium', 'high', 'urgent'] as Priority[]).map((p) => (
            <button type="button" key={p} className={cls('chip', draft.priority === p && 'active')} onClick={() => set({ ...draft, priority: p })}>
              <span className={`prio prio-${p}`} /> {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Deadline</span>
        <div className="row wrap gap-4">
          {DUE_PRESETS().map((d) => (
            <button type="button" key={d.label} className={cls('chip', draft.due_date === d.value && 'active')} onClick={() => set({ ...draft, due_date: d.value })}>{d.label}</button>
          ))}
          <input className="input input-sm" type="date" style={{ width: 150 }} value={draft.due_date} onChange={(e) => set({ ...draft, due_date: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

export const emptyTask = (assignee = ''): TaskDraft => ({ title: '', description: '', assignee_id: assignee, priority: 'medium', due_date: ymd(addDays(new Date(), 1)) });

export function TaskFormModal({ onClose, task, defaults }: { onClose: () => void; task?: Task; defaults?: Partial<TaskDraft> & { room_id?: string | null; team_id?: string | null } }) {
  const { me, db, backend } = useApp();
  const { createTask } = useMeetingActions();
  const run = useAction();
  const [draft, setDraft] = useState<TaskDraft>(task ? { title: task.title, description: task.description, assignee_id: task.assignee_id, priority: task.priority, due_date: task.due_date ?? '' } : { ...emptyTask(), ...defaults });
  const allowed = managedUserIds(me, db);
  const assignees = db.users.filter((u) => allowed.has(u.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));

  const save = async () => {
    const ok = await run(async () => {
      if (task) return backend.update('tasks', task.id, { ...draft, due_date: draft.due_date || null });
      const teamId = defaults?.team_id ?? db.team_members.find((m) => m.user_id === draft.assignee_id)?.team_id ?? null;
      return createTask({ ...draft, due_date: draft.due_date || null, team_id: teamId, room_id: defaults?.room_id ?? null });
    }, task ? 'Task updated' : 'Task created and assigned');
    if (ok) onClose();
  };

  return (
    <Modal
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!draft.title.trim() || !draft.assignee_id} onClick={save}>{task ? 'Save' : 'Create task'}</button>
        </>
      }
    >
      <TaskFields draft={draft} set={setDraft} assignees={assignees} />
    </Modal>
  );
}
