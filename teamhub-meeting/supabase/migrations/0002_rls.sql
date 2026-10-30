-- ═══════════════════════════════════════════════════════════════════════════
-- TeamHub Meeting — Row Level Security
-- Every table has RLS enabled. Access is decided by role + team membership +
-- meeting/room participation. Helper functions are SECURITY DEFINER so policies
-- can look up memberships without recursive RLS evaluation.
-- The demo backend mirrors these rules in src/data/local/policies.ts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

create or replace function public.is_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('admin', 'manager', 'team_leader'), false)
$$;

-- Teams I belong to, lead or manage (admin: all)
create or replace function public.my_team_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.teams where public.is_admin()
  union
  select team_id from public.team_members where user_id = auth.uid()
  union
  select id from public.teams where manager_id = auth.uid() or leader_id = auth.uid()
$$;

create or replace function public.manages_team(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.teams t where t.id = p_team and (t.manager_id = auth.uid() or t.leader_id = auth.uid()))
$$;

-- Self, members of teams I manage/lead, and leaders of teams I manage
create or replace function public.manages_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or p_user = auth.uid()
      or exists (
        select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
        where tm.user_id = p_user and (t.manager_id = auth.uid() or t.leader_id = auth.uid()))
      or exists (select 1 from public.teams t where t.leader_id = p_user and t.manager_id = auth.uid())
$$;

create or replace function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = p_room and user_id = auth.uid())
$$;

create or replace function public.is_room_owner(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.team_rooms where id = p_room and created_by = auth.uid())
      or exists (select 1 from public.room_members where room_id = p_room and user_id = auth.uid() and member_role = 'owner')
$$;

-- Private rooms: members only. Public rooms: also visible to members of the room's team.
create or replace function public.can_view_room(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_room_member(p_room)
      or exists (
        select 1 from public.team_rooms r
        where r.id = p_room
          and (r.created_by = auth.uid() or (not r.is_private and r.team_id in (select public.my_team_ids()))))
$$;

create or replace function public.can_manage_meeting(p_meeting uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting
      and (m.host_id = auth.uid() or public.is_admin() or (m.team_id is not null and public.manages_team(m.team_id))))
$$;

create or replace function public.can_view_meeting(p_meeting uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_manage_meeting(p_meeting)
      or exists (
        select 1 from public.meeting_participants p
        where p.meeting_id = p_meeting and p.user_id = auth.uid() and p.admission not in ('removed', 'denied'))
      or (public.auth_role() = 'manager' and exists (
        select 1 from public.meeting_participants p where p.meeting_id = p_meeting and public.manages_user(p.user_id)))
      or exists (select 1 from public.meetings m where m.id = p_meeting and m.team_id in (select public.my_team_ids()))
$$;

-- ── Enable RLS everywhere ──────────────────────────────────────────────────
alter table public.users                enable row level security;
alter table public.teams                enable row level security;
alter table public.team_members         enable row level security;
alter table public.team_rooms           enable row level security;
alter table public.room_members         enable row level security;
alter table public.meetings             enable row level security;
alter table public.meeting_secrets      enable row level security;  -- no policies: server functions only
alter table public.meeting_participants enable row level security;
alter table public.meeting_notes        enable row level security;
alter table public.meeting_tasks        enable row level security;
alter table public.meeting_insights     enable row level security;
alter table public.tasks                enable row level security;
alter table public.messages             enable row level security;
alter table public.announcements        enable row level security;
alter table public.notifications        enable row level security;
alter table public.attendance           enable row level security;  -- writes via record_attendance()/end_meeting() only
alter table public.kpi_definitions      enable row level security;
alter table public.performance          enable row level security;

-- ── users (org directory readable; profile editable by owner; role/email guarded by trigger) ──
create policy users_select on public.users for select to authenticated using (true);
create policy users_update on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- ── teams & membership ─────────────────────────────────────────────────────
create policy teams_select on public.teams for select to authenticated using (true);
create policy teams_insert on public.teams for insert to authenticated
  with check (public.is_admin() or (public.auth_role() = 'manager' and manager_id = auth.uid()));
create policy teams_update on public.teams for update to authenticated
  using (public.is_admin() or manager_id = auth.uid()) with check (public.is_admin() or manager_id = auth.uid());
create policy teams_delete on public.teams for delete to authenticated using (public.is_admin() or manager_id = auth.uid());

create policy team_members_select on public.team_members for select to authenticated using (true);
create policy team_members_insert on public.team_members for insert to authenticated with check (public.manages_team(team_id));
create policy team_members_update on public.team_members for update to authenticated using (public.manages_team(team_id)) with check (public.manages_team(team_id));
create policy team_members_delete on public.team_members for delete to authenticated using (public.manages_team(team_id));

-- ── team rooms ─────────────────────────────────────────────────────────────
create policy rooms_select on public.team_rooms for select to authenticated using (created_by = auth.uid() or public.can_view_room(id));
create policy rooms_insert on public.team_rooms for insert to authenticated with check (public.is_leader() and created_by = auth.uid());
create policy rooms_update on public.team_rooms for update to authenticated using (public.is_room_owner(id)) with check (public.is_room_owner(id));
create policy rooms_delete on public.team_rooms for delete to authenticated using (public.is_room_owner(id));

create policy room_members_select on public.room_members for select to authenticated using (public.can_view_room(room_id));
create policy room_members_insert on public.room_members for insert to authenticated with check (public.is_room_owner(room_id));
create policy room_members_update on public.room_members for update to authenticated using (public.is_room_owner(room_id)) with check (public.is_room_owner(room_id));
create policy room_members_delete on public.room_members for delete to authenticated using (public.is_room_owner(room_id) or user_id = auth.uid());

-- ── meetings ───────────────────────────────────────────────────────────────
create policy meetings_select on public.meetings for select to authenticated using (host_id = auth.uid() or public.can_view_meeting(id));
create policy meetings_insert on public.meetings for insert to authenticated with check (public.is_leader() and host_id = auth.uid());
create policy meetings_update on public.meetings for update to authenticated
  using (host_id = auth.uid() or public.can_manage_meeting(id)) with check (host_id = auth.uid() or public.can_manage_meeting(id));
create policy meetings_delete on public.meetings for delete to authenticated using (host_id = auth.uid() or public.is_admin());

-- Participants join through join_meeting(); hosts invite / admit / remove directly.
create policy participants_select on public.meeting_participants for select to authenticated using (user_id = auth.uid() or public.can_view_meeting(meeting_id));
create policy participants_insert on public.meeting_participants for insert to authenticated with check (public.can_manage_meeting(meeting_id));
create policy participants_update on public.meeting_participants for update to authenticated using (public.can_manage_meeting(meeting_id)) with check (public.can_manage_meeting(meeting_id));
create policy participants_delete on public.meeting_participants for delete to authenticated using (public.can_manage_meeting(meeting_id));

create policy notes_select on public.meeting_notes for select to authenticated using (public.can_view_meeting(meeting_id));
create policy notes_insert on public.meeting_notes for insert to authenticated with check (author_id = auth.uid() and public.can_view_meeting(meeting_id));
create policy notes_update on public.meeting_notes for update to authenticated
  using (author_id = auth.uid() or public.can_manage_meeting(meeting_id)) with check (author_id = auth.uid() or public.can_manage_meeting(meeting_id));
create policy notes_delete on public.meeting_notes for delete to authenticated using (author_id = auth.uid() or public.can_manage_meeting(meeting_id));

create policy meeting_tasks_select on public.meeting_tasks for select to authenticated using (public.can_view_meeting(meeting_id));
create policy meeting_tasks_insert on public.meeting_tasks for insert to authenticated with check (public.is_leader() and public.can_view_meeting(meeting_id));
create policy meeting_tasks_delete on public.meeting_tasks for delete to authenticated using (public.is_leader() and public.can_view_meeting(meeting_id));

create policy insights_select on public.meeting_insights for select to authenticated using (public.can_view_meeting(meeting_id));
create policy insights_insert on public.meeting_insights for insert to authenticated with check (public.is_leader() and public.can_view_meeting(meeting_id));
create policy insights_update on public.meeting_insights for update to authenticated
  using (public.is_leader() and public.can_view_meeting(meeting_id)) with check (public.is_leader() and public.can_view_meeting(meeting_id));

-- ── tasks (employees: only their own; leaders: their people's) ─────────────
create policy tasks_select on public.tasks for select to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid() or (public.is_leader() and public.manages_user(assignee_id)));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_leader() and created_by = auth.uid());
-- Assignees may update; the tasks_guard trigger limits them to the status column.
create policy tasks_update on public.tasks for update to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid() or (public.is_leader() and public.manages_user(assignee_id)))
  with check (assignee_id = auth.uid() or created_by = auth.uid() or (public.is_leader() and public.manages_user(assignee_id)));
create policy tasks_delete on public.tasks for delete to authenticated
  using (created_by = auth.uid() or public.is_admin() or (public.is_leader() and public.manages_user(assignee_id)));

-- ── messages (room / meeting / direct) ─────────────────────────────────────
create policy messages_select on public.messages for select to authenticated using (
  (room_id is not null and public.can_view_room(room_id))
  or (meeting_id is not null and public.can_view_meeting(meeting_id))
  or (recipient_id is not null and (sender_id = auth.uid() or recipient_id = auth.uid())));
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and (
    (room_id is not null and public.can_view_room(room_id))
    or (meeting_id is not null and public.can_view_meeting(meeting_id))
    or (recipient_id is not null and recipient_id <> auth.uid())));
create policy messages_update on public.messages for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated using (sender_id = auth.uid() or public.is_admin());

-- ── announcements ──────────────────────────────────────────────────────────
create policy announcements_select on public.announcements for select to authenticated
  using (team_id is null or team_id in (select public.my_team_ids()) or author_id = auth.uid());
create policy announcements_insert on public.announcements for insert to authenticated
  with check (author_id = auth.uid() and public.auth_role() in ('admin', 'manager'));
create policy announcements_update on public.announcements for update to authenticated
  using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy announcements_delete on public.announcements for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- ── notifications (own only; created by triggers) ──────────────────────────
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ── attendance (read: self, or leaders who can see the meeting) ────────────
create policy attendance_select on public.attendance for select to authenticated
  using (user_id = auth.uid() or (public.is_leader() and public.can_view_meeting(meeting_id)));

-- ── KPIs & performance ─────────────────────────────────────────────────────
create policy kpi_select on public.kpi_definitions for select to authenticated using (true);
create policy kpi_write on public.kpi_definitions for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy performance_select on public.performance for select to authenticated
  using (user_id = auth.uid() or (public.is_leader() and public.manages_user(user_id)));
create policy performance_write on public.performance for all to authenticated
  using (public.auth_role() in ('admin', 'manager') and public.manages_user(user_id))
  with check (public.auth_role() in ('admin', 'manager') and public.manages_user(user_id));
