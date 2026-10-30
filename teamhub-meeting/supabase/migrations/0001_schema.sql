-- ═══════════════════════════════════════════════════════════════════════════
-- TeamHub Meeting — schema
-- Run in order: 0001_schema.sql → 0002_rls.sql → 0003_functions.sql
-- Text + CHECK constraints are used instead of enums so values can be extended
-- without migrations that lock tables.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto with schema extensions;

-- ── People & teams ─────────────────────────────────────────────────────────
create table public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  role          text not null default 'employee' check (role in ('admin', 'manager', 'team_leader', 'employee')),
  title         text not null default '',
  avatar_url    text,
  avatar_color  text not null default '#E60000',
  phone         text,
  status        text not null default 'offline' check (status in ('online', 'away', 'busy', 'in_meeting', 'offline')),
  activity      text not null default '' check (length(activity) <= 140),
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 80),
  description  text not null default '',
  manager_id   uuid references public.users (id) on delete set null,
  leader_id    uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.team_members (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  member_role  text not null default 'member' check (member_role in ('leader', 'member')),
  joined_at    timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ── Team rooms ─────────────────────────────────────────────────────────────
create table public.team_rooms (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 80),
  description  text not null default '',
  team_id      uuid references public.teams (id) on delete set null,
  icon         text not null default 'hash',
  color        text not null default '#E60000',
  is_private   boolean not null default false,
  created_by   uuid not null default auth.uid() references public.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table public.room_members (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.team_rooms (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  member_role  text not null default 'member' check (member_role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  unique (room_id, user_id)
);

-- ── Meetings ───────────────────────────────────────────────────────────────
create table public.meetings (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (length(title) between 1 and 140),
  description        text not null default '',
  agenda             jsonb not null default '[]'::jsonb,           -- [{id,title,minutes,done}]
  team_id            uuid references public.teams (id) on delete set null,
  room_id            uuid references public.team_rooms (id) on delete set null,
  host_id            uuid not null default auth.uid() references public.users (id) on delete cascade,
  scheduled_at       timestamptz not null default now(),
  duration_min       integer not null default 30 check (duration_min between 1 and 600),
  status             text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  access             text not null default 'team' check (access in ('team', 'link', 'password', 'approval')),
  -- 128-bit capability token for secure links (#/join/<token>); unrelated to the id
  join_token         text not null unique default translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'),
  locked             boolean not null default false,
  recording_enabled  boolean not null default false,
  recording          jsonb,                                         -- {id,name,size,duration_sec,url,created_at}
  started_at         timestamptz,
  ended_at           timestamptz,
  created_at         timestamptz not null default now()
);

-- Secrets live in their own table: no client policy exists, only SECURITY DEFINER functions read it.
create table public.meeting_secrets (
  meeting_id     uuid primary key references public.meetings (id) on delete cascade,
  password_hash  text not null
);

create table public.meeting_participants (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        text not null default 'attendee' check (role in ('host', 'cohost', 'attendee')),
  admission   text not null default 'invited' check (admission in ('invited', 'pending', 'admitted', 'denied', 'removed')),
  created_at  timestamptz not null default now(),
  unique (meeting_id, user_id)
);

create table public.meeting_notes (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind        text not null default 'note' check (kind in ('note', 'decision')),
  content     text not null check (length(content) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Tasks ──────────────────────────────────────────────────────────────────
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 1 and 200),
  description   text not null default '',
  assignee_id   uuid not null references public.users (id) on delete cascade,
  team_id       uuid references public.teams (id) on delete set null,
  room_id       uuid references public.team_rooms (id) on delete set null,
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status        text not null default 'todo' check (status in ('todo', 'in_progress', 'completed')),
  due_date      date,
  created_by    uuid not null default auth.uid() references public.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- Action items captured in a meeting (link table: a task can be traced back to its meeting)
create table public.meeting_tasks (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (meeting_id, task_id)
);

-- AI meeting intelligence (mock today, LLM via Edge Function later)
create table public.meeting_insights (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null unique references public.meetings (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  provider      text not null default 'mock',
  summary       text not null default '',
  decisions     jsonb not null default '[]'::jsonb,   -- string[]
  action_items  jsonb not null default '[]'::jsonb,   -- [{title,assignee_id,priority,due_date,source}]
  follow_ups    jsonb not null default '[]'::jsonb,   -- string[]
  created_at    timestamptz not null default now()
);

-- ── Communication ──────────────────────────────────────────────────────────
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid references public.team_rooms (id) on delete cascade,
  meeting_id    uuid references public.meetings (id) on delete cascade,     -- automatic meeting chat
  recipient_id  uuid references public.users (id) on delete cascade,        -- direct message
  sender_id     uuid not null default auth.uid() references public.users (id) on delete cascade,
  body          text not null default '' check (length(body) <= 8000),
  reply_to_id   uuid references public.messages (id) on delete set null,
  attachments   jsonb not null default '[]'::jsonb,   -- [{name,size,type,url}]
  reactions     jsonb not null default '{}'::jsonb,   -- {emoji: [user_id]}
  created_at    timestamptz not null default now(),
  constraint message_has_one_target check (num_nonnulls(room_id, meeting_id, recipient_id) = 1)
);

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 140),
  body        text not null check (length(body) between 1 and 4000),
  author_id   uuid not null default auth.uid() references public.users (id) on delete cascade,
  team_id     uuid references public.teams (id) on delete cascade,          -- null = everyone
  priority    text not null default 'normal' check (priority in ('normal', 'important')),
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  type        text not null default 'system' check (type in ('task', 'meeting', 'announcement', 'message', 'system')),
  title       text not null,
  body        text not null default '',
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Attendance (written only by record_attendance / end_meeting) ───────────
create table public.attendance (
  id                  uuid primary key default gen_random_uuid(),
  meeting_id          uuid not null references public.meetings (id) on delete cascade,
  user_id             uuid not null references public.users (id) on delete cascade,
  joined_at           timestamptz,
  left_at             timestamptz,
  session_started_at  timestamptz,      -- non-null while connected
  total_seconds       integer not null default 0,
  join_count          integer not null default 0,
  status              text not null default 'present' check (status in ('present', 'late', 'absent')),
  unique (meeting_id, user_id)
);

-- ── Performance (KPIs are rows, not columns → new KPIs need no migration) ──
create table public.kpi_definitions (
  key           text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  label         text not null,
  short_label   text not null,
  unit          text not null default '',
  display       text not null default 'count' check (display in ('percent', 'count')),
  color         text not null default '#E60000',
  weight        numeric not null default 1 check (weight >= 0),
  daily_target  numeric not null default 1 check (daily_target >= 0),
  sort_order    integer not null default 99,
  active        boolean not null default true
);

create table public.performance (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  kpi_key     text not null references public.kpi_definitions (key) on update cascade on delete cascade,
  period      date not null,                -- daily grain; weeks/months are aggregated
  target      numeric not null default 0,
  actual      numeric not null default 0,
  updated_at  timestamptz not null default now(),
  unique (user_id, kpi_key, period)
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index on public.team_members (user_id);
create index on public.room_members (user_id);
create index on public.meetings (scheduled_at);
create index on public.meetings (team_id);
create index on public.meetings (room_id);
create index on public.meeting_participants (user_id);
create index on public.meeting_notes (meeting_id);
create index on public.meeting_tasks (task_id);
create index on public.tasks (assignee_id, status);
create index on public.tasks (created_by);
create index on public.messages (room_id, created_at);
create index on public.messages (meeting_id, created_at);
create index on public.messages (recipient_id, created_at);
create index on public.messages (sender_id, created_at);
create index on public.announcements (team_id, created_at);
create index on public.notifications (user_id, read, created_at);
create index on public.attendance (user_id);
create index on public.performance (period);
