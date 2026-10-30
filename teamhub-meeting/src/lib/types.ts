// Domain types — one interface per database table (see supabase/migrations/0001_schema.sql).
// Keep these in sync with the SQL schema: the same shapes are used by the demo backend and Supabase.

export type Role = 'admin' | 'manager' | 'team_leader' | 'employee';
export type UserStatus = 'online' | 'away' | 'busy' | 'in_meeting' | 'offline';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  title: string;
  avatar_url: string | null;
  avatar_color: string;
  phone: string | null;
  status: UserStatus;
  activity: string;
  last_seen_at: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  manager_id: string | null;
  leader_id: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  member_role: 'leader' | 'member';
  joined_at: string;
}

export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type MeetingAccess = 'team' | 'link' | 'password' | 'approval';

export interface AgendaItem {
  id: string;
  title: string;
  minutes: number;
  done: boolean;
}

export interface RecordingInfo {
  id: string;
  name: string;
  size: number;
  duration_sec: number;
  url: string | null; // Supabase storage path or null (demo: stored in IndexedDB under id)
  created_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  description: string;
  agenda: AgendaItem[];
  team_id: string | null;
  room_id: string | null;
  host_id: string;
  scheduled_at: string;
  duration_min: number;
  status: MeetingStatus;
  access: MeetingAccess;
  /** Demo mode only — in Supabase the hash lives in meeting_secrets, unreadable by clients. */
  password_hash?: string | null;
  join_token: string;
  locked: boolean;
  recording_enabled: boolean;
  recording: RecordingInfo | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export type Admission = 'invited' | 'pending' | 'admitted' | 'denied' | 'removed';

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: 'host' | 'cohost' | 'attendee';
  admission: Admission;
  created_at: string;
}

export interface MeetingNote {
  id: string;
  meeting_id: string;
  author_id: string;
  kind: 'note' | 'decision';
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingTask {
  id: string;
  meeting_id: string;
  task_id: string;
  created_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  team_id: string | null;
  room_id: string | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null; // YYYY-MM-DD
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

export interface TeamRoom {
  id: string;
  name: string;
  description: string;
  team_id: string | null;
  icon: string;
  color: string;
  is_private: boolean;
  created_by: string;
  created_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  member_role: 'owner' | 'member';
  created_at: string;
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  url: string; // data: URL in demo mode, storage URL in Supabase mode
}

export interface Message {
  id: string;
  room_id: string | null;
  meeting_id: string | null;
  recipient_id: string | null; // direct message when set
  sender_id: string;
  body: string;
  reply_to_id: string | null;
  attachments: Attachment[];
  reactions: Record<string, string[]>; // emoji → user ids
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  author_id: string;
  team_id: string | null; // null = everyone
  priority: 'normal' | 'important';
  pinned: boolean;
  created_at: string;
}

export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface Attendance {
  id: string;
  meeting_id: string;
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
  session_started_at: string | null; // set while currently connected
  total_seconds: number;
  join_count: number;
  status: AttendanceStatus;
}

export interface KpiDefinition {
  key: string;
  label: string;
  short_label: string;
  unit: string;
  display: 'percent' | 'count';
  color: string;
  weight: number;
  daily_target: number;
  sort_order: number;
  active: boolean;
}

export interface Performance {
  id: string;
  user_id: string;
  kpi_key: string;
  period: string; // YYYY-MM-DD (daily grain)
  target: number;
  actual: number;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'task' | 'meeting' | 'announcement' | 'message' | 'system';
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface ActionSuggestion {
  title: string;
  assignee_id: string | null;
  priority: Priority;
  due_date: string | null;
  source: string;
}

export interface MeetingInsights {
  id: string;
  meeting_id: string;
  status: 'pending' | 'ready' | 'failed';
  provider: string;
  summary: string;
  decisions: string[];
  action_items: ActionSuggestion[];
  follow_ups: string[];
  created_at: string;
}

export interface Tables {
  users: User;
  teams: Team;
  team_members: TeamMember;
  meetings: Meeting;
  meeting_participants: MeetingParticipant;
  meeting_notes: MeetingNote;
  meeting_tasks: MeetingTask;
  meeting_insights: MeetingInsights;
  tasks: Task;
  team_rooms: TeamRoom;
  room_members: RoomMember;
  messages: Message;
  announcements: Announcement;
  attendance: Attendance;
  kpi_definitions: KpiDefinition;
  performance: Performance;
  notifications: Notification;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T];

/** Tables kept fully in memory after login (messages are loaded per conversation). */
export const SNAPSHOT_TABLES = [
  'users', 'teams', 'team_members', 'meetings', 'meeting_participants', 'meeting_notes',
  'meeting_tasks', 'meeting_insights', 'tasks', 'team_rooms', 'room_members', 'announcements',
  'attendance', 'kpi_definitions', 'performance', 'notifications',
] as const satisfies readonly TableName[];

export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];
export type Snapshot = { [K in SnapshotTable]: Tables[K][] };

/** Primary key column per table (kpi_definitions uses its key). */
export const pkOf = (table: TableName): string => (table === 'kpi_definitions' ? 'key' : 'id');
