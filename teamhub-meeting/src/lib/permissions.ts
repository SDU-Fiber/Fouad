import type { Meeting, Role, Snapshot, User } from './types';

// Role → capability matrix. The UI uses it to show/hide actions; the database enforces the
// same rules with Row Level Security (supabase/migrations/0002_rls.sql). Never rely on UI checks alone.
export type Capability =
  | 'meeting.create'
  | 'meeting.invite'
  | 'team.manage'
  | 'task.create'
  | 'task.viewAll'
  | 'performance.viewTeam'
  | 'performance.edit'
  | 'attendance.view'
  | 'announcement.create'
  | 'room.create'
  | 'admin.users'
  | 'admin.kpis';

const MATRIX: Record<Role, Capability[]> = {
  admin: [
    'meeting.create', 'meeting.invite', 'team.manage', 'task.create', 'task.viewAll', 'performance.viewTeam',
    'performance.edit', 'attendance.view', 'announcement.create', 'room.create', 'admin.users', 'admin.kpis',
  ],
  manager: [
    'meeting.create', 'meeting.invite', 'team.manage', 'task.create', 'task.viewAll', 'performance.viewTeam',
    'performance.edit', 'attendance.view', 'announcement.create', 'room.create',
  ],
  team_leader: [
    'meeting.create', 'meeting.invite', 'team.manage', 'task.create', 'task.viewAll', 'performance.viewTeam',
    'attendance.view', 'room.create',
  ],
  employee: [],
};

export const can = (user: Pick<User, 'role'> | null | undefined, cap: Capability) =>
  !!user && MATRIX[user.role].includes(cap);

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  team_leader: 'Team Leader',
  employee: 'Sales Staff',
};

export const isLeader = (u: Pick<User, 'role'> | null | undefined) => !!u && u.role !== 'employee';

type Scope = Pick<Snapshot, 'teams' | 'team_members' | 'users'>;

/** Teams the user belongs to, leads or manages (admin: all). Mirrors SQL my_team_ids(). */
export function myTeamIds(user: User, db: Scope): string[] {
  if (user.role === 'admin') return db.teams.map((t) => t.id);
  const ids = new Set<string>();
  db.team_members.forEach((m) => m.user_id === user.id && ids.add(m.team_id));
  db.teams.forEach((t) => (t.manager_id === user.id || t.leader_id === user.id) && ids.add(t.id));
  return [...ids];
}

/** Teams the user can manage (manager_id / leader_id). Mirrors SQL can_manage_team(). */
export function managedTeamIds(user: User, db: Scope): string[] {
  if (user.role === 'admin') return db.teams.map((t) => t.id);
  if (user.role === 'employee') return [];
  return db.teams.filter((t) => t.manager_id === user.id || t.leader_id === user.id).map((t) => t.id);
}

/** Users whose tasks/performance/attendance the viewer may see. Mirrors SQL can_manage_user(). */
export function managedUserIds(user: User, db: Scope): Set<string> {
  if (user.role === 'admin') return new Set(db.users.map((u) => u.id));
  const ids = new Set<string>([user.id]);
  const teams = new Set(managedTeamIds(user, db));
  db.team_members.forEach((m) => teams.has(m.team_id) && ids.add(m.user_id));
  db.teams.forEach((t) => teams.has(t.id) && t.leader_id && ids.add(t.leader_id));
  return ids;
}

/** Everyone sharing at least one team with the user (directory / DM scope). */
export function colleagueIds(user: User, db: Scope): Set<string> {
  if (user.role === 'admin') return new Set(db.users.map((u) => u.id));
  const teams = new Set(myTeamIds(user, db));
  const ids = new Set<string>([user.id]);
  db.team_members.forEach((m) => teams.has(m.team_id) && ids.add(m.user_id));
  db.teams.forEach((t) => {
    if (!teams.has(t.id)) return;
    if (t.manager_id) ids.add(t.manager_id);
    if (t.leader_id) ids.add(t.leader_id);
  });
  return ids;
}

export const canHostControl = (user: User, meeting: Meeting, db: Scope) =>
  meeting.host_id === user.id || (meeting.team_id ? managedTeamIds(user, db).includes(meeting.team_id) : user.role === 'admin');
