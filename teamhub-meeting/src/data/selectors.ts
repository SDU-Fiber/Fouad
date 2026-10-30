import { aggregate, overallAchievement, type PeriodKey } from '../lib/kpi';
import type { AttendanceStatus, Meeting, Snapshot } from '../lib/types';
import { isSameDay } from '../lib/utils';

export const activeKpis = (db: Snapshot) => db.kpi_definitions.filter((k) => k.active).sort((a, b) => a.sort_order - b.sort_order);

export function kpisForUser(db: Snapshot, userId: string, period: PeriodKey) {
  const kpis = activeKpis(db);
  const totals = aggregate(db.performance, kpis, period, new Set([userId]));
  return { totals, overall: overallAchievement(totals, kpis) };
}

export function kpisForGroup(db: Snapshot, userIds: Set<string>, period: PeriodKey) {
  const kpis = activeKpis(db);
  const totals = aggregate(db.performance, kpis, period, userIds);
  return { totals, overall: overallAchievement(totals, kpis) };
}

/** Today's attendance across today's meetings for one person. */
export function attendanceToday(db: Snapshot, userId: string): { status: AttendanceStatus | 'none'; meetings: number } {
  const todays = new Set(db.meetings.filter((m) => isSameDay(m.scheduled_at) && m.status !== 'scheduled' && m.status !== 'cancelled').map((m) => m.id));
  const rows = db.attendance.filter((a) => a.user_id === userId && todays.has(a.meeting_id));
  if (!rows.length) return { status: 'none', meetings: 0 };
  const status: AttendanceStatus = rows.some((r) => r.status === 'absent') ? 'absent' : rows.some((r) => r.status === 'late') ? 'late' : 'present';
  return { status, meetings: rows.length };
}

export function meetingStats(db: Snapshot, m: Meeting) {
  const participants = db.meeting_participants.filter((p) => p.meeting_id === m.id && p.admission !== 'denied' && p.admission !== 'pending');
  const att = db.attendance.filter((a) => a.meeting_id === m.id);
  const present = att.filter((a) => a.status !== 'absent').length;
  const late = att.filter((a) => a.status === 'late').length;
  const taskIds = new Set(db.meeting_tasks.filter((t) => t.meeting_id === m.id).map((t) => t.task_id));
  const notes = db.meeting_notes.filter((n) => n.meeting_id === m.id);
  const durationSec = m.started_at && m.ended_at ? (new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()) / 1000 : m.duration_min * 60;
  return {
    invited: participants.length,
    present,
    late,
    absent: att.filter((a) => a.status === 'absent').length,
    tasks: db.tasks.filter((t) => taskIds.has(t.id)),
    decisions: notes.filter((n) => n.kind === 'decision'),
    notes: notes.filter((n) => n.kind === 'note'),
    durationSec,
    participants,
    attendance: att,
  };
}

export const myMeetings = (db: Snapshot, userId: string) => {
  const mine = new Set(db.meeting_participants.filter((p) => p.user_id === userId && p.admission !== 'removed' && p.admission !== 'denied').map((p) => p.meeting_id));
  return db.meetings.filter((m) => m.host_id === userId || mine.has(m.id));
};
