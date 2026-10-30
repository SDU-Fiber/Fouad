import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CheckCircle2, CheckSquare, ChevronRight, Clock, Megaphone, Target, UserCheck, Users, Video } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { activeKpis, kpisForGroup, kpisForUser, myMeetings } from '../data/selectors';
import { achievementTone } from '../lib/kpi';
import { can, colleagueIds, isLeader, managedUserIds } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { Meeting, Task, UserStatus } from '../lib/types';
import { cls, fmtDue, fmtTime, isOverdue, isSameDay, sortBy, timeAgo } from '../lib/utils';
import { MeetingFormModal } from '../components/forms';
import { MeetingRow } from '../components/cards';
import { Avatar, AvatarStack, Empty, PRIORITY_TONE, Progress, STATUS_LABEL, StatusDot, TASK_STATUS_LABEL, UserAvatar, useAction } from '../components/ui';
import { useMeetingActions } from '../components/meetingActions';

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Countdown({ iso }: { iso: string }) {
  const now = useNow(15_000);
  const diff = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (diff <= 0) return <span className="countdown"><Clock size={13} /> Starting now</span>;
  if (diff < 60) return <span className="countdown"><Clock size={13} /> Starts in {diff} min</span>;
  const h = Math.floor(diff / 60);
  return <span className="countdown"><Clock size={13} /> Starts in {h}h {diff % 60}m</span>;
}

function NextMeetingCard({ meeting }: { meeting: Meeting | undefined }) {
  const { db, userById } = useApp();
  if (!meeting)
    return (
      <div className="card card-pad">
        <Empty icon={<Video size={22} />} title="No upcoming meetings">Your schedule is clear.</Empty>
      </div>
    );
  const people = db.meeting_participants.filter((p) => p.meeting_id === meeting.id).map((p) => p.user_id);
  const room = db.team_rooms.find((r) => r.id === meeting.room_id);
  return (
    <div className={cls('card card-pad next-meeting', meeting.status === 'live' && 'card-accent')}>
      <div className="row between">
        <span className="muted small strong">{meeting.status === 'live' ? 'HAPPENING NOW' : 'UPCOMING MEETING'}</span>
        {meeting.status === 'live' ? <span className="live-pill">LIVE</span> : <Countdown iso={meeting.scheduled_at} />}
      </div>
      <div>
        <h2>{meeting.title}</h2>
        <p className="muted small mt-4">
          {isSameDay(meeting.scheduled_at) ? 'Today' : new Date(meeting.scheduled_at).toLocaleDateString([], { weekday: 'long' })} — {fmtTime(meeting.scheduled_at)} · {meeting.duration_min} min
          {room ? ` · ${room.name}` : ''} · host {userById(meeting.host_id)?.full_name.split(' ')[0]}
        </p>
      </div>
      {meeting.agenda.length > 0 && (
        <div className="agenda-list">
          {meeting.agenda.slice(0, 3).map((a, i) => (
            <div key={a.id} className="row small"><span className="faint num">{i + 1}.</span> <span className="grow truncate">{a.title}</span> <span className="faint">{a.minutes}m</span></div>
          ))}
        </div>
      )}
      <div className="row between">
        <div className="row"><AvatarStack ids={people} max={5} size="sm" /><span className="muted small">{people.length} participants</span></div>
        <button className="btn btn-primary" onClick={() => navigate(`/meet/${meeting.id}`)}><Video size={16} /> Join meeting</button>
      </div>
    </div>
  );
}

const statusBucket = (s: UserStatus): 'online' | 'away' | 'offline' => (s === 'offline' ? 'offline' : s === 'away' ? 'away' : 'online');

export function Dashboard() {
  const { me, db, statusOf, activityOf, userById, backend } = useApp();
  const { startInstant } = useMeetingActions();
  const run = useAction();
  const [creating, setCreating] = useState(false);
  const leader = isLeader(me);

  const teamIds = useMemo(() => {
    const ids = leader ? managedUserIds(me, db) : colleagueIds(me, db);
    ids.delete(me.id);
    return ids;
  }, [me, db, leader]);
  const team = db.users.filter((u) => teamIds.has(u.id));
  const buckets = { online: 0, away: 0, offline: 0 };
  team.forEach((u) => buckets[statusBucket(statusOf(u.id))]++);

  const kpis = activeKpis(db);
  const scopeIds = leader ? teamIds : new Set([me.id]);
  const today = kpisForGroup(db, scopeIds, 'today');
  const month = kpisForGroup(db, scopeIds, 'month');

  const meetings = leader ? db.meetings : myMeetings(db, me.id);
  const todays = sortBy(meetings.filter((m) => isSameDay(m.scheduled_at) && m.status !== 'cancelled'), (m) => m.scheduled_at);
  const upcoming = sortBy(meetings.filter((m) => m.status === 'live' || (m.status === 'scheduled' && new Date(m.scheduled_at).getTime() > Date.now() - 30 * 60_000)), (m) => (m.status === 'live' ? '0' : m.scheduled_at))[0];

  const todayMeetingIds = new Set(todays.filter((m) => m.status !== 'scheduled').map((m) => m.id));
  const attToday = db.attendance.filter((a) => todayMeetingIds.has(a.meeting_id) && (leader ? teamIds.has(a.user_id) : a.user_id === me.id));
  const present = attToday.filter((a) => a.status === 'present').length;
  const late = attToday.filter((a) => a.status === 'late').length;
  const absent = attToday.filter((a) => a.status === 'absent').length;
  const attPct = attToday.length ? Math.round(((present + late) / attToday.length) * 100) : 0;

  const scopedTasks = leader ? db.tasks.filter((t) => teamIds.has(t.assignee_id) || t.assignee_id === me.id) : db.tasks.filter((t) => t.assignee_id === me.id);
  const openTasks = scopedTasks.filter((t) => t.status !== 'completed');
  const doneTasks = scopedTasks.filter((t) => t.status === 'completed');
  const overdue = openTasks.filter((t) => isOverdue(t.due_date)).length;
  const myTasks = sortBy(db.tasks.filter((t) => t.assignee_id === me.id && t.status !== 'completed'), (t) => t.due_date ?? '9999').slice(0, 5);

  const announcements = sortBy(db.announcements, (a) => (a.pinned ? '1' : '0') + a.created_at, -1).slice(0, 3);
  const pinned = announcements.find((a) => a.pinned || a.priority === 'important');

  const ranking = sortBy(team.filter((u) => u.role === 'employee' || u.role === 'team_leader').map((u) => ({ u, ...kpisForUser(db, u.id, 'month') })), (r) => r.overall, -1);
  const lgc = kpis.find((k) => k.key === 'lgc');
  const headlineKpis = kpis.slice(0, 3);

  const cycleStatus = (t: Task) => run(() => backend.update('tasks', t.id, { status: t.status === 'todo' ? 'in_progress' : 'completed' }));

  return (
    <>
      {pinned && (
        <a href="#/announcements" className="announce-strip" style={{ marginBottom: 16 }}>
          <Megaphone size={18} /> <span className="grow truncate">{pinned.body}</span> <ChevronRight size={16} />
        </a>
      )}

      <div className="hero">
        <div className="card card-pad today-card col gap-16">
          <div className="row between" style={{ position: 'relative', zIndex: 1 }}>
            <div>
              <div className="muted small strong">TODAY · {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <h2 style={{ marginTop: 4 }}>{leader ? 'Team pulse' : 'My day'}</h2>
            </div>
            <div className="flow hide-mobile" style={{ color: 'rgba(255,255,255,.6)' }}>
              {['Meet', 'Decide', 'Assign', 'Track', 'Measure'].map((s, i) => <span key={s}>{i > 0 && <i>→ </i>}<b style={{ color: '#fff' }}>{s}</b></span>)}
            </div>
          </div>
          <div className="today-grid">
            {[
              ['Team Members', team.length, ''],
              ['Online', buckets.online, 's-online'],
              ['Away', buckets.away, 's-away'],
              ['Offline', buckets.offline, 's-offline'],
            ].map(([label, n, dot]) => (
              <button key={label as string} style={{ all: 'unset', cursor: 'pointer' }} onClick={() => navigate('/team')}>
                <div className="today-num">{n}</div>
                <div className="muted small row gap-4">{dot && <span className={cls('sdot', dot as string)} style={{ border: 0, width: 8, height: 8 }} />}{label}</div>
              </button>
            ))}
          </div>
          <div className="today-kpis">
            {headlineKpis.map((k) => {
              const t = today.totals[k.key];
              return (
                <div key={k.key} className="today-kpi">
                  <div className="muted xs strong">{k.short_label}</div>
                  <div className="today-num" style={{ fontSize: 24 }}>{k.display === 'percent' ? `${t?.achievement ?? 0}%` : t?.actual ?? 0}</div>
                  <div className="muted xs">{k.display === 'percent' ? 'of target' : `${k.unit} · target ${t?.target ?? 0}`}</div>
                </div>
              );
            })}
          </div>
          <div className="row wrap" style={{ position: 'relative', zIndex: 1 }}>
            {can(me, 'meeting.create') ? (
              <>
                <button className="btn btn-primary btn-lg" onClick={() => startInstant()}><Video size={18} /> START MEETING</button>
                <button className="btn btn-lg" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }} onClick={() => setCreating(true)}><CalendarPlus size={18} /> CREATE MEETING</button>
              </>
            ) : upcoming ? (
              <button className="btn btn-primary btn-lg" onClick={() => navigate(`/meet/${upcoming.id}`)}><Video size={18} /> JOIN NEXT MEETING</button>
            ) : null}
          </div>
        </div>
        <NextMeetingCard meeting={upcoming} />
      </div>

      <div className="grid g-4 mt-16">
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><Video size={15} /></span> Today's meetings</span>
          <span className="stat-value">{todays.length}</span>
          <span className="stat-sub">{todays.filter((m) => m.status === 'ended').length} done · {todays.filter((m) => m.status !== 'ended').length} to go</span>
        </div>
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><UserCheck size={15} /></span> Attendance today</span>
          <span className="stat-value">{attToday.length ? `${attPct}%` : '—'}</span>
          <span className="stat-sub"><span className="green">{present} present</span> · <span className="amber">{late} late</span> · <span className="red">{absent} absent</span></span>
        </div>
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><CheckSquare size={15} /></span> Open tasks</span>
          <span className="stat-value">{openTasks.length}</span>
          <span className="stat-sub">{overdue ? <span className="red">{overdue} overdue</span> : 'Nothing overdue'}</span>
        </div>
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><CheckCircle2 size={15} /></span> Completed tasks</span>
          <span className="stat-value">{doneTasks.length}</span>
          <span className="stat-sub">{scopedTasks.length ? Math.round((doneTasks.length / scopedTasks.length) * 100) : 0}% completion rate</span>
        </div>
      </div>

      <div className="grid g-3 mt-16">
        <div className="card span-2">
          <div className="card-head">
            <h3><Target size={17} className="red" /> {leader ? 'Team performance' : 'My performance'} · month to date</h3>
            <a href="#/performance" className="btn btn-ghost btn-sm">Details <ChevronRight size={14} /></a>
          </div>
          <div className="card-body">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              {kpis.map((k) => {
                const t = month.totals[k.key]!;
                return (
                  <div key={k.key} className="mini-kpi">
                    <div className="l">{k.short_label}</div>
                    <div className="v">{k.display === 'percent' ? `${t.achievement}%` : t.actual}</div>
                    <Progress value={t.achievement} tone={achievementTone(t.achievement)} />
                    <div className="faint xs mt-4">{t.achievement}% of {t.target}</div>
                  </div>
                );
              })}
            </div>
            {leader && ranking.length > 0 && (
              <div className="mt-16">
                <div className="muted xs strong" style={{ marginBottom: 4 }}>OVERALL ACHIEVEMENT{lgc ? ' (weighted)' : ''}</div>
                {ranking.slice(0, 6).map(({ u, overall }) => (
                  <div key={u.id} className="bar-row">
                    <span className="row truncate small"><Avatar user={u} size="xs" /> <span className="truncate">{u.full_name.split(' ')[0]}</span></span>
                    <Progress value={overall / 1.5} tone={achievementTone(overall)} marker={100 / 1.5} />
                    <span className={cls('strong num small', achievementTone(overall) === 'bad' ? 'red' : achievementTone(overall) === 'good' ? 'green' : 'amber')} style={{ textAlign: 'right' }}>{overall}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><Video size={17} className="red" /> Today's meetings</h3>
            <a href="#/meetings" className="btn btn-ghost btn-sm">All</a>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            {todays.length === 0 ? <Empty icon={<Video size={20} />} title="No meetings today" /> : <div className="list">{todays.map((m) => <MeetingRow key={m.id} meeting={m} />)}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><CheckSquare size={17} className="red" /> My tasks</h3>
            <a href="#/tasks" className="btn btn-ghost btn-sm">All</a>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            {myTasks.length === 0 ? (
              <Empty icon={<CheckCircle2 size={20} />} title="All done">No open tasks assigned to you.</Empty>
            ) : (
              <div className="list">
                {myTasks.map((t) => (
                  <div key={t.id} className="list-item">
                    <span className={`prio prio-${t.priority}`} />
                    <div className="grow">
                      <div className="small strong truncate">{t.title}</div>
                      <div className={cls('xs', isOverdue(t.due_date) ? 'red' : 'muted')}>{fmtDue(t.due_date)} · <span className={cls('badge', PRIORITY_TONE[t.priority])} style={{ height: 18 }}>{t.priority}</span></div>
                    </div>
                    <button className={cls('status-btn', t.status)} onClick={() => cycleStatus(t)} title="Advance status">{TASK_STATUS_LABEL[t.status]}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><Megaphone size={17} className="red" /> Announcements</h3>
            <a href="#/announcements" className="btn btn-ghost btn-sm">All</a>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            <div className="list">
              {announcements.map((a) => (
                <div key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <UserAvatar id={a.author_id} size="sm" showStatus={false} />
                  <div className="grow">
                    <div className="small strong">{a.title} {a.priority === 'important' && <span className="badge tone-red" style={{ height: 18 }}>Important</span>}</div>
                    <div className="small muted">{a.body}</div>
                    <div className="faint xs mt-4">{userById(a.author_id)?.full_name} · {timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><Users size={17} className="red" /> Team activity</h3>
            <a href="#/team" className="btn btn-ghost btn-sm">Team</a>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            <div className="list">
              {sortBy(team, (u) => ['in_meeting', 'busy', 'online', 'away', 'offline'].indexOf(statusOf(u.id))).slice(0, 7).map((u) => (
                <div key={u.id} className="list-item">
                  <Avatar user={u} size="sm" status={statusOf(u.id)} />
                  <div className="grow">
                    <div className="small strong truncate">{u.full_name}</div>
                    <div className="xs muted truncate">{statusOf(u.id) === 'offline' ? 'Offline' : activityOf(u.id) || STATUS_LABEL[statusOf(u.id)]}</div>
                  </div>
                  <StatusDot status={statusOf(u.id)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {creating && <MeetingFormModal onClose={() => setCreating(false)} />}
    </>
  );
}
