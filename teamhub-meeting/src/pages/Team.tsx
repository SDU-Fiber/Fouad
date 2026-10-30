import { useMemo, useState } from 'react';
import { CheckSquare, Mail, MessageSquare, Phone, Search, UserPlus, Users, Video, X } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { activeKpis, attendanceToday, kpisForUser } from '../data/selectors';
import { achievementTone, formatKpi } from '../lib/kpi';
import { can, colleagueIds, managedTeamIds, managedUserIds, ROLE_LABEL } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { User, UserStatus } from '../lib/types';
import { cls, fmtDue, fmtTime, isOverdue } from '../lib/utils';
import { MemberCard } from '../components/cards';
import { TaskFormModal } from '../components/forms';
import { Avatar, Drawer, Empty, Modal, Progress, STATUS_LABEL, StatusDot, TASK_STATUS_LABEL, useAction } from '../components/ui';
import { useMeetingActions } from '../components/meetingActions';

type Filter = 'all' | 'online' | 'away' | 'offline';
const bucket = (s: UserStatus): Filter => (s === 'offline' ? 'offline' : s === 'away' ? 'away' : 'online');

function MemberDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const { db, me, statusOf, activityOf } = useApp();
  const { startInstant } = useMeetingActions();
  const [assigning, setAssigning] = useState(false);
  const status = statusOf(user.id);
  const kpis = activeKpis(db);
  const { totals, overall } = kpisForUser(db, user.id, 'month');
  const tasks = db.tasks.filter((t) => t.assignee_id === user.id).sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0));
  const att = attendanceToday(db, user.id);
  const recentAttendance = db.attendance.filter((a) => a.user_id === user.id).map((a) => ({ a, m: db.meetings.find((m) => m.id === a.meeting_id) })).filter((x) => x.m).sort((x, y) => y.m!.scheduled_at.localeCompare(x.m!.scheduled_at)).slice(0, 5);
  const teams = db.team_members.filter((m) => m.user_id === user.id).map((m) => db.teams.find((t) => t.id === m.team_id)?.name).filter(Boolean);
  const canManage = managedUserIds(me, db).has(user.id) && user.id !== me.id;

  return (
    <Drawer onClose={onClose}>
      <div className="row between" style={{ padding: '14px 16px' }}>
        <span className="muted small strong">TEAM MEMBER</span>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>
      <div style={{ overflowY: 'auto', padding: '0 20px 24px' }} className="col gap-16">
        <div className="row gap-16">
          <Avatar user={user} size="xl" status={status} />
          <div className="grow">
            <h2>{user.full_name}</h2>
            <div className="muted">{user.title} · {ROLE_LABEL[user.role]}</div>
            <div className="status-line mt-4"><StatusDot status={status} /> {STATUS_LABEL[status]}{teams.length ? ` · ${teams.join(', ')}` : ''}</div>
          </div>
        </div>
        <div className="member-activity">{status === 'offline' ? 'Offline' : activityOf(user.id) || 'No activity set'}</div>
        <div className="row wrap">
          {user.id !== me.id && <button className="btn btn-outline btn-sm" onClick={() => navigate(`/rooms/dm/${user.id}`)}><MessageSquare size={15} /> Message</button>}
          {user.id !== me.id && can(me, 'meeting.create') && <button className="btn btn-primary btn-sm" onClick={() => startInstant({ title: `Call with ${user.full_name.split(' ')[0]}`, invitees: [user.id] })}><Video size={15} /> Meet now</button>}
          {canManage && can(me, 'task.create') && <button className="btn btn-outline btn-sm" onClick={() => setAssigning(true)}><CheckSquare size={15} /> Assign task</button>}
        </div>
        <div className="col gap-4 small">
          <span className="row muted"><Mail size={14} /> {user.email}</span>
          {user.phone && <span className="row muted"><Phone size={14} /> {user.phone}</span>}
        </div>

        <div className="card card-pad">
          <div className="row between"><h3>Performance · MTD</h3><span className={cls('strong', achievementTone(overall) === 'good' ? 'green' : achievementTone(overall) === 'bad' ? 'red' : 'amber')}>{overall}%</span></div>
          <div className="col mt-12" style={{ gap: 10 }}>
            {kpis.map((k) => {
              const t = totals[k.key]!;
              return (
                <div key={k.key}>
                  <div className="row between small"><span className="strong">{k.label}</span><span className="num">{formatKpi(k, t)} <span className="faint">/ {k.display === 'percent' ? '100%' : t.target}</span></span></div>
                  <Progress value={t.achievement} tone={achievementTone(t.achievement)} />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3>Tasks <span className="faint">({tasks.filter((t) => t.status !== 'completed').length} open)</span></h3>
          <div className="list mt-8">
            {tasks.length === 0 && <p className="muted small">No tasks.</p>}
            {tasks.slice(0, 8).map((t) => (
              <div key={t.id} className="list-item">
                <span className={`prio prio-${t.priority}`} />
                <span className={cls('grow small truncate', t.status === 'completed' && 'faint')}>{t.title}</span>
                <span className={cls('xs', isOverdue(t.due_date) && t.status !== 'completed' ? 'red' : 'muted')}>{fmtDue(t.due_date)}</span>
                <span className={cls('status-btn', t.status)}>{TASK_STATUS_LABEL[t.status]}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Attendance <span className="faint small">({att.status === 'none' ? 'no meeting today' : `today: ${att.status}`})</span></h3>
          <div className="list mt-8">
            {recentAttendance.length === 0 && <p className="muted small">No meeting attendance yet.</p>}
            {recentAttendance.map(({ a, m }) => (
              <div key={a.id} className="list-item small">
                <span className="grow truncate">{m!.title}</span>
                <span className="muted xs">{new Date(m!.scheduled_at).toLocaleDateString([], { day: 'numeric', month: 'short' })} {fmtTime(a.joined_at)}</span>
                <span className={cls('badge', a.status === 'present' ? 'tone-green' : a.status === 'late' ? 'tone-amber' : 'tone-red')}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {assigning && <TaskFormModal onClose={() => setAssigning(false)} defaults={{ assignee_id: user.id }} />}
    </Drawer>
  );
}

function ManageTeamModal({ onClose }: { onClose: () => void }) {
  const { db, me, backend } = useApp();
  const run = useAction();
  const teams = db.teams.filter((t) => managedTeamIds(me, db).includes(t.id));
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const members = db.team_members.filter((m) => m.team_id === teamId);
  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = db.users.filter((u) => !memberIds.has(u.id) && u.role !== 'admin' && u.role !== 'manager');
  const [newTeam, setNewTeam] = useState('');

  return (
    <Modal title="Manage teams" subtitle="Add or remove people from the teams you manage." onClose={onClose}>
      <div className="col gap-12">
        <div className="row">
          <select className="select grow" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {can(me, 'announcement.create') && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (!newTeam.trim()) return; void run(async () => { const [t] = await backend.insert('teams', { name: newTeam.trim(), manager_id: me.id }); setTeamId(t!.id); setNewTeam(''); }, 'Team created'); }}>
            <input className="input input-sm grow" placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
            <button className="btn btn-outline btn-sm">Create team</button>
          </form>
        )}
        <div className="label">Members ({members.length})</div>
        <div className="list">
          {members.map((m) => {
            const u = db.users.find((x) => x.id === m.user_id);
            return (
              <div key={m.id} className="list-item">
                <Avatar user={u} size="sm" />
                <span className="grow small strong">{u?.full_name}</span>
                <span className="badge">{m.member_role === 'leader' ? 'Leader' : 'Member'}</span>
                <button className="btn btn-danger btn-xs" onClick={() => run(() => backend.remove('team_members', m.id), 'Removed from team')}>Remove</button>
              </div>
            );
          })}
        </div>
        {candidates.length > 0 && (
          <>
            <div className="label">Add people</div>
            <div className="list">
              {candidates.map((u) => (
                <div key={u.id} className="list-item">
                  <Avatar user={u} size="sm" />
                  <span className="grow small">{u.full_name} <span className="faint">· {u.title}</span></span>
                  <button className="btn btn-soft btn-xs" onClick={() => run(() => backend.insert('team_members', { team_id: teamId, user_id: u.id, member_role: u.role === 'team_leader' ? 'leader' : 'member' }), 'Added to team')}><UserPlus size={13} /> Add</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function TeamPage() {
  const { db, me, statusOf } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [teamId, setTeamId] = useState<string>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<User | null>(null);
  const [managing, setManaging] = useState(false);

  const scope = useMemo(() => (me.role === 'employee' ? colleagueIds(me, db) : managedUserIds(me, db)), [me, db]);
  const teams = db.teams.filter((t) => me.role === 'admin' || managedTeamIds(me, db).includes(t.id) || db.team_members.some((m) => m.team_id === t.id && m.user_id === me.id));
  const people = db.users
    .filter((u) => scope.has(u.id) && u.id !== me.id && u.role !== 'admin')
    .filter((u) => teamId === 'all' || db.team_members.some((m) => m.team_id === teamId && m.user_id === u.id))
    .filter((u) => !q || `${u.full_name} ${u.title}`.toLowerCase().includes(q.toLowerCase()));
  const counts = { all: people.length, online: 0, away: 0, offline: 0 };
  people.forEach((u) => counts[bucket(statusOf(u.id))]++);
  const shown = people.filter((u) => filter === 'all' || bucket(statusOf(u.id)) === filter).sort((a, b) => ['in_meeting', 'busy', 'online', 'away', 'offline'].indexOf(statusOf(a.id)) - ['in_meeting', 'busy', 'online', 'away', 'offline'].indexOf(statusOf(b.id)) || a.full_name.localeCompare(b.full_name));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Team</h1>
          <p>{counts.all} members · {counts.online} online · {counts.away} away · {counts.offline} offline</p>
        </div>
        {can(me, 'team.manage') && <button className="btn btn-outline" onClick={() => setManaging(true)}><Users size={16} /> Manage teams</button>}
      </div>
      <div className="row wrap gap-12" style={{ marginBottom: 16 }}>
        <div className="input-icon" style={{ width: 'min(280px, 100%)' }}>
          <Search size={16} />
          <input className="input" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row wrap gap-4">
          {(['all', 'online', 'away', 'offline'] as Filter[]).map((f) => (
            <button key={f} className={cls('chip', filter === f && 'active')} onClick={() => setFilter(f)}>
              {f !== 'all' && <span className={cls('sdot', `s-${f}`)} style={{ border: 0, width: 8, height: 8 }} />}
              {f === 'all' ? 'All' : f[0]!.toUpperCase() + f.slice(1)} <span className="faint">{counts[f]}</span>
            </button>
          ))}
        </div>
        {teams.length > 1 && (
          <select className="select" style={{ width: 'auto' }} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="card"><Empty icon={<Users size={22} />} title="No team members match" /></div>
      ) : (
        <div className="grid g-auto">{shown.map((u) => <MemberCard key={u.id} user={u} onOpen={() => setOpen(u)} />)}</div>
      )}
      {open && <MemberDrawer user={open} onClose={() => setOpen(null)} />}
      {managing && <ManageTeamModal onClose={() => setManaging(false)} />}
    </>
  );
}
