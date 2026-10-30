// Demo-mode mirror of the Row Level Security policies in supabase/migrations/0002_rls.sql.
// Keeps the demo honest: an employee in demo mode sees exactly what they would see in production.
import { managedTeamIds, managedUserIds, myTeamIds } from '../../lib/permissions';
import type { Meeting, Message, Row, TableName, User } from '../../lib/types';
import type { SeedData } from '../../lib/seed';
import { BackendError } from '../backend';

type Db = SeedData;

const isLeaderRole = (u: User) => u.role !== 'employee';

export function isRoomMember(db: Db, me: User, roomId: string) {
  return db.room_members.some((m) => m.room_id === roomId && m.user_id === me.id);
}

export function canViewRoom(db: Db, me: User, roomId: string) {
  if (me.role === 'admin') return true;
  const room = db.team_rooms.find((r) => r.id === roomId);
  if (!room) return false;
  if (isRoomMember(db, me, roomId) || room.created_by === me.id) return true;
  return !room.is_private && !!room.team_id && myTeamIds(me, db).includes(room.team_id);
}

export function canManageMeeting(db: Db, me: User, m: Meeting) {
  if (me.role === 'admin' || m.host_id === me.id) return true;
  return !!m.team_id && managedTeamIds(me, db).includes(m.team_id);
}

export function canViewMeeting(db: Db, me: User, meetingId: string) {
  const m = db.meetings.find((x) => x.id === meetingId);
  if (!m) return false;
  if (canManageMeeting(db, me, m)) return true;
  if (db.meeting_participants.some((p) => p.meeting_id === m.id && p.user_id === me.id && p.admission !== 'removed' && p.admission !== 'denied')) return true;
  if (me.role === 'manager' && db.meeting_participants.some((p) => p.meeting_id === m.id && managedUserIds(me, db).has(p.user_id))) return true;
  return !!m.team_id && myTeamIds(me, db).includes(m.team_id);
}

function canViewMessage(db: Db, me: User, msg: Message) {
  if (msg.room_id) return canViewRoom(db, me, msg.room_id);
  if (msg.meeting_id) return canViewMeeting(db, me, msg.meeting_id);
  return msg.sender_id === me.id || msg.recipient_id === me.id;
}

export function canSelect<T extends TableName>(db: Db, me: User, table: T, row: Row<T>): boolean {
  if (me.role === 'admin') return true;
  const r = row as never as Record<string, string | null | boolean>;
  switch (table) {
    case 'users':
    case 'teams':
    case 'team_members':
    case 'kpi_definitions':
      return true; // org directory is visible to every authenticated member
    case 'meetings':
      return canViewMeeting(db, me, r.id as string);
    case 'meeting_participants':
    case 'meeting_notes':
    case 'meeting_tasks':
    case 'meeting_insights':
      return r.user_id === me.id || canViewMeeting(db, me, r.meeting_id as string);
    case 'attendance':
      return r.user_id === me.id || (isLeaderRole(me) && canViewMeeting(db, me, r.meeting_id as string));
    case 'tasks':
      return r.assignee_id === me.id || r.created_by === me.id || (isLeaderRole(me) && managedUserIds(me, db).has(r.assignee_id as string));
    case 'team_rooms':
      return canViewRoom(db, me, r.id as string);
    case 'room_members':
      return canViewRoom(db, me, r.room_id as string);
    case 'messages':
      return canViewMessage(db, me, row as never as Message);
    case 'announcements':
      return r.team_id === null || myTeamIds(me, db).includes(r.team_id as string) || r.author_id === me.id;
    case 'performance':
      return r.user_id === me.id || (isLeaderRole(me) && managedUserIds(me, db).has(r.user_id as string));
    case 'notifications':
      return r.user_id === me.id;
  }
  return false;
}

const deny = (why: string): never => {
  throw new BackendError(`Permission denied: ${why}`, 'rls');
};

/** Write checks (INSERT / UPDATE / DELETE), mirroring the SQL policies. */
export function assertWrite<T extends TableName>(db: Db, me: User, table: T, op: 'insert' | 'update' | 'delete', row: Row<T>, patch?: Partial<Row<T>>) {
  if (me.role === 'admin') return;
  const r = row as never as Record<string, unknown>;
  const leader = isLeaderRole(me);
  switch (table) {
    case 'users':
      if (r.id !== me.id) deny('you can only edit your own profile');
      if (patch && 'role' in patch) deny('only admins can change roles');
      return;
    case 'teams':
    case 'team_members': {
      const teamId = (table === 'teams' ? r.id : r.team_id) as string;
      if (op === 'insert' && table === 'teams' && me.role === 'manager') return;
      if (!managedTeamIds(me, db).includes(teamId)) deny('team is not managed by you');
      return;
    }
    case 'kpi_definitions':
      return deny('only admins can manage KPIs');
    case 'meetings':
      if (op === 'insert') return leader ? undefined : deny('only leaders can create meetings');
      if (!canManageMeeting(db, me, row as never as Meeting)) deny('only the host can change this meeting');
      return;
    case 'meeting_participants': {
      const m = db.meetings.find((x) => x.id === r.meeting_id);
      if (m && canManageMeeting(db, me, m)) return;
      return deny('only the host can manage participants');
    }
    case 'meeting_notes':
      if (op === 'insert') return canViewMeeting(db, me, r.meeting_id as string) ? undefined : deny('not a participant');
      if (r.author_id === me.id) return;
      { const m = db.meetings.find((x) => x.id === r.meeting_id); if (m && canManageMeeting(db, me, m)) return; }
      return deny('you can only edit your own notes');
    case 'meeting_tasks':
    case 'meeting_insights':
      return canViewMeeting(db, me, r.meeting_id as string) && leader ? undefined : deny('only leaders can do this');
    case 'tasks':
      if (op === 'insert') return leader ? undefined : deny('only leaders can create tasks');
      if (r.created_by === me.id || (leader && managedUserIds(me, db).has(r.assignee_id as string))) return;
      if (op === 'update' && r.assignee_id === me.id && patch && Object.keys(patch).every((k) => k === 'status' || k === 'completed_at')) return;
      return deny('employees can only update the status of their own tasks');
    case 'team_rooms':
      if (op === 'insert') return leader ? undefined : deny('only leaders can create rooms');
      if (r.created_by === me.id || db.room_members.some((m) => m.room_id === r.id && m.user_id === me.id && m.member_role === 'owner')) return;
      return deny('only the room owner can change it');
    case 'room_members': {
      const owner = db.room_members.some((m) => m.room_id === r.room_id && m.user_id === me.id && m.member_role === 'owner');
      const room = db.team_rooms.find((x) => x.id === r.room_id);
      if (owner || room?.created_by === me.id) return;
      if (op === 'delete' && r.user_id === me.id) return; // leave room
      return deny('only the room owner can manage members');
    }
    case 'messages':
      if (op === 'insert') {
        if (r.sender_id !== me.id) deny('cannot send as another user');
        if (!canViewMessage(db, me, row as never as Message)) deny('no access to this conversation');
        return;
      }
      if (r.sender_id !== me.id) deny('you can only edit your own messages');
      return;
    case 'announcements':
      if (op === 'insert') return me.role === 'manager' ? undefined : deny('only managers can publish announcements');
      if (r.author_id !== me.id) deny('only the author can change it');
      return;
    case 'attendance':
      return deny('attendance is recorded by the server');
    case 'performance':
      return me.role === 'manager' && managedUserIds(me, db).has(r.user_id as string) ? undefined : deny('only managers can edit performance');
    case 'notifications':
      if (op === 'insert') return;
      if (r.user_id !== me.id) deny('not your notification');
      return;
  }
}
