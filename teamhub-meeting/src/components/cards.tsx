import { CalendarClock, CheckSquare, Clock, Copy, Globe, KeyRound, Lock, MessageSquare, ShieldCheck, Users, Video } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { attendanceToday, kpisForUser, meetingStats } from '../data/selectors';
import { activeKpis } from '../data/selectors';
import { achievementTone } from '../lib/kpi';
import { canHostControl } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { Meeting, User } from '../lib/types';
import { cls, fmtDay, fmtDuration, fmtTime, isSameDay } from '../lib/utils';
import { Avatar, AvatarStack, STATUS_LABEL, StatusDot } from './ui';
import { useMeetingActions } from './meetingActions';

const ACCESS_ICON = { team: Users, link: Globe, password: KeyRound, approval: ShieldCheck } as const;
const ACCESS_LABEL = { team: 'Team only', link: 'Anyone with link', password: 'Password', approval: 'Approval' } as const;

export function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <div className={cls('date-block', isSameDay(d) && 'today')}>
      <span className="d">{d.getDate()}</span>
      <span className="m">{d.toLocaleDateString([], { month: 'short' })}</span>
    </div>
  );
}

export function MeetingCard({ meeting: m, compact }: { meeting: Meeting; compact?: boolean }) {
  const { db, me, userById } = useApp();
  const { copyLink } = useMeetingActions();
  const stats = meetingStats(db, m);
  const room = db.team_rooms.find((r) => r.id === m.room_id);
  const team = db.teams.find((t) => t.id === m.team_id);
  const host = userById(m.host_id);
  const AccessIcon = ACCESS_ICON[m.access];
  const isHost = canHostControl(me, m, db);
  const ended = m.status === 'ended';

  return (
    <div className={cls('card meeting-card', m.status === 'live' && 'card-accent')}>
      <div className="meeting-when">
        <DateBlock iso={m.scheduled_at} />
        <div className="grow">
          <div className="row">
            <h3 className="truncate">{m.title}</h3>
            {m.status === 'live' && <span className="live-pill">LIVE</span>}
          </div>
          <div className="muted small row gap-4 wrap" style={{ marginTop: 2 }}>
            <Clock size={13} /> {fmtDay(m.scheduled_at)} — {fmtTime(m.scheduled_at)}
            <span className="faint">·</span> {ended ? fmtDuration(stats.durationSec) : `${m.duration_min} min`}
          </div>
        </div>
      </div>
      {!compact && (
        <div className="row wrap gap-4">
          <span className="badge"><Users size={12} /> {stats.invited} participants</span>
          {(room || team) && <span className="badge tone-red">{room?.name ?? team?.name}</span>}
          <span className="badge tone-gray" title="Meeting security"><AccessIcon size={12} /> {ACCESS_LABEL[m.access]}</span>
          {m.locked && <span className="badge tone-dark"><Lock size={12} /> Locked</span>}
          {m.recording_enabled && <span className="badge tone-purple">● Rec</span>}
        </div>
      )}
      {ended && (
        <div className="row small muted gap-12 wrap">
          <span className="row gap-4"><Users size={13} /> {stats.present}/{stats.invited} attended</span>
          <span className="row gap-4"><CheckSquare size={13} /> {stats.tasks.length} actions</span>
          <span className="row gap-4"><MessageSquare size={13} /> {stats.decisions.length} decisions</span>
        </div>
      )}
      <div className="row between">
        <div className="row">
          <AvatarStack ids={stats.participants.map((p) => p.user_id)} max={4} size="xs" />
          {host && !compact && <span className="faint xs">Host: {host.full_name.split(' ')[0]}</span>}
        </div>
        <div className="row gap-4">
          {!ended && (
            <button className="btn btn-ghost btn-icon btn-sm" title="Copy secure link" onClick={() => copyLink(m)}><Copy size={15} /></button>
          )}
          {ended ? (
            <button className="btn btn-outline btn-sm" onClick={() => navigate(`/history/${m.id}`)}>View summary</button>
          ) : (
            <button className={cls('btn btn-sm', m.status === 'live' || isHost ? 'btn-primary' : 'btn-dark')} onClick={() => navigate(`/meet/${m.id}`)}>
              <Video size={15} /> {m.status === 'live' ? 'Join meeting' : isHost ? 'Start' : 'Join'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MeetingRow({ meeting: m }: { meeting: Meeting }) {
  const { db } = useApp();
  const stats = meetingStats(db, m);
  return (
    <button className="list-item" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'transparent', width: '100%', textAlign: 'left' }} onClick={() => navigate(m.status === 'ended' ? `/history/${m.id}` : `/meet/${m.id}`)}>
      <DateBlock iso={m.scheduled_at} />
      <div className="grow">
        <div className="row"><span className="strong truncate">{m.title}</span>{m.status === 'live' && <span className="live-pill">LIVE</span>}</div>
        <div className="muted small row gap-4"><CalendarClock size={13} /> {fmtTime(m.scheduled_at)} · {stats.invited} participants</div>
      </div>
      {m.status === 'ended' ? <span className="badge tone-green">{stats.present}/{stats.invited}</span> : <span className="badge">{m.duration_min}m</span>}
    </button>
  );
}

export function MemberCard({ user, onOpen }: { user: User; onOpen?: () => void }) {
  const { db, statusOf, activityOf } = useApp();
  const status = statusOf(user.id);
  const { totals, overall } = kpisForUser(db, user.id, 'month');
  const kpis = activeKpis(db).slice(0, 3);
  const att = attendanceToday(db, user.id);
  const openTasks = db.tasks.filter((t) => t.assignee_id === user.id && t.status !== 'completed').length;
  const attTone = att.status === 'present' ? 'tone-green' : att.status === 'late' ? 'tone-amber' : att.status === 'absent' ? 'tone-red' : 'tone-gray';

  return (
    <div className="card member-card card-link" onClick={onOpen} role="button" tabIndex={0}>
      <div className="member-top">
        <Avatar user={user} size="lg" status={status} />
        <div className="grow">
          <div className="strong truncate" style={{ fontSize: 15 }}>{user.full_name}</div>
          <div className="muted small truncate">{user.title}</div>
          <div className="status-line mt-4"><StatusDot status={status} /> {STATUS_LABEL[status]}</div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
          <span className={cls('strong num', achievementTone(overall) === 'good' ? 'green' : achievementTone(overall) === 'bad' ? 'red' : 'amber')} style={{ fontSize: 18 }}>{overall}%</span>
          <span className="faint xs">achievement</span>
        </div>
      </div>
      <div className="member-activity"><span className="faint">●</span> <span className="truncate">{status === 'offline' ? 'Offline' : activityOf(user.id) || 'No activity set'}</span></div>
      <div className="member-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="mini-kpi">
            <div className="v">{k.display === 'percent' ? `${totals[k.key]?.achievement ?? 0}%` : totals[k.key]?.actual ?? 0}</div>
            <div className="l">{k.short_label}</div>
          </div>
        ))}
      </div>
      <div className="row between small">
        <span className={cls('badge', attTone)}>{att.status === 'none' ? 'No meeting today' : `Today: ${att.status}`}</span>
        <span className="muted row gap-4"><CheckSquare size={13} /> {openTasks} open tasks</span>
      </div>
    </div>
  );
}
