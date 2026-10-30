-- ═══════════════════════════════════════════════════════════════════════════
-- TeamHub Meeting — triggers, server functions (RPC), realtime & storage
-- Errors raised for the client carry a machine code in HINT (e.g. 'password_required').
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Profiles: created automatically on sign-up ─────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins change roles / emails (service role & SQL editor have no auth.uid() and are allowed)
create or replace function public.users_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.role is distinct from old.role then raise exception 'Only admins can change roles' using hint = 'rls'; end if;
  if new.email is distinct from old.email then raise exception 'Email is managed by your administrator' using hint = 'rls'; end if;
  return new;
end $$;

create trigger users_guard before update on public.users for each row execute function public.users_guard();

-- Tasks: completed_at bookkeeping + employees may only move the status of their own tasks
create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.completed_at := case when new.status = 'completed' then now() else null end;
  end if;
  if auth.uid() is not null
     and auth.uid() = old.assignee_id
     and old.created_by <> auth.uid()
     and not (public.is_leader() and public.manages_user(old.assignee_id))
     and (new.title, new.description, new.assignee_id, new.priority, new.due_date, new.team_id, new.room_id, new.created_by)
         is distinct from
         (old.title, old.description, old.assignee_id, old.priority, old.due_date, old.team_id, old.room_id, old.created_by)
  then
    raise exception 'Employees can only update the status of their own tasks' using hint = 'rls';
  end if;
  return new;
end $$;

create trigger tasks_guard before update on public.tasks for each row execute function public.tasks_guard();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger notes_touch before update on public.meeting_notes for each row execute function public.touch_updated_at();
create trigger performance_touch before update on public.performance for each row execute function public.touch_updated_at();

-- ── Notifications (skip for service-role inserts such as seeding) ──────────
create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, link) values (p_user, p_type, p_title, left(coalesce(p_body, ''), 280), p_link)
$$;

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from public.users where id = auth.uid()), 'Someone')
$$;

create or replace function public.notify_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.assignee_id = auth.uid() then return new; end if;
  if tg_op = 'INSERT' then
    perform public.notify(new.assignee_id, 'task', 'New task from ' || public.my_name(), new.title, '/tasks');
  elsif new.assignee_id is distinct from old.assignee_id then
    perform public.notify(new.assignee_id, 'task', 'Task reassigned to you', new.title, '/tasks');
  end if;
  return new;
end $$;

create trigger tasks_notify after insert or update of assignee_id on public.tasks for each row execute function public.notify_task();

create or replace function public.notify_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  select u.id, 'announcement', new.title, left(new.body, 280), '/announcements'
  from public.users u
  where u.id <> new.author_id
    and (new.team_id is null or exists (select 1 from public.team_members tm where tm.team_id = new.team_id and tm.user_id = u.id));
  return new;
end $$;

create trigger announcements_notify after insert on public.announcements for each row execute function public.notify_announcement();

create or replace function public.notify_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.meetings;
begin
  if auth.uid() is null or new.user_id = auth.uid() or new.admission <> 'invited' then return new; end if;
  select * into m from public.meetings where id = new.meeting_id;
  perform public.notify(new.user_id, 'meeting', 'Invitation: ' || m.title,
    to_char(m.scheduled_at at time zone 'Asia/Qatar', 'Dy DD Mon · HH24:MI') || ' — from ' || public.my_name(), '/meetings');
  return new;
end $$;

create trigger participants_notify after insert on public.meeting_participants for each row execute function public.notify_invite();

create or replace function public.notify_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.recipient_id is null then return new; end if;
  perform public.notify(new.recipient_id, 'message', 'Message from ' || public.my_name(),
    coalesce(nullif(new.body, ''), 'Attachment'), '/rooms/dm/' || new.sender_id);
  return new;
end $$;

create trigger messages_notify after insert on public.messages for each row execute function public.notify_dm();

-- ── RPC: join a meeting (secure links, team-only, password, approval, lock) ──
create or replace function public.join_meeting(p_token text default null, p_meeting_id uuid default null, p_password text default null)
returns table (meeting_id uuid, admission text)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  m public.meetings;
  p public.meeting_participants;
  v_manage boolean;
  v_admission text := 'admitted';
  v_hash text;
  v_in_team boolean;
begin
  if v_uid is null then raise exception 'Not signed in' using hint = 'auth'; end if;
  if p_token is not null then
    select * into m from public.meetings where join_token = p_token;
  else
    select * into m from public.meetings where id = p_meeting_id;
  end if;
  if m.id is null then raise exception 'Meeting not found or the link has expired' using hint = 'not_found'; end if;
  if m.status in ('ended', 'cancelled') then raise exception 'This meeting has already ended' using hint = 'ended'; end if;

  select * into p from public.meeting_participants mp where mp.meeting_id = m.id and mp.user_id = v_uid;
  if p.admission = 'removed' then raise exception 'You were removed from this meeting by the host' using hint = 'denied'; end if;
  if p.admission = 'denied' then raise exception 'The host declined your request to join' using hint = 'denied'; end if;

  v_manage := public.can_manage_meeting(m.id);
  if not v_manage then
    if m.locked and coalesce(p.admission, '') <> 'admitted' then
      raise exception 'The host has locked this meeting' using hint = 'locked';
    end if;
    v_in_team := p.id is not null
      or (m.team_id is not null and m.team_id in (select public.my_team_ids()))
      or (m.room_id is not null and public.is_room_member(m.room_id));
    if m.access = 'team' and not v_in_team then
      raise exception 'This meeting is restricted to team members' using hint = 'forbidden';
    end if;
    if m.access = 'password' and coalesce(p.admission, '') <> 'admitted' then
      select password_hash into v_hash from public.meeting_secrets s where s.meeting_id = m.id;
      if p_password is null then raise exception 'This meeting requires a password' using hint = 'password_required'; end if;
      if v_hash is null or crypt(p_password, v_hash) <> v_hash then
        raise exception 'Wrong meeting password' using hint = 'password_invalid';
      end if;
    end if;
    if (m.access = 'approval' and p.id is null) or p.admission = 'pending' then v_admission := 'pending'; end if;
  end if;

  if p.id is null then
    insert into public.meeting_participants (meeting_id, user_id, role, admission)
    values (m.id, v_uid, case when v_manage then 'cohost' else 'attendee' end, v_admission)
    returning * into p;
  elsif p.admission <> v_admission then
    update public.meeting_participants mp set admission = v_admission where mp.id = p.id returning * into p;
  end if;
  return query select m.id, p.admission;
end $$;

-- ── RPC: server-timestamped attendance ─────────────────────────────────────
create or replace function public.record_attendance(p_meeting_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  m public.meetings;
  a public.attendance;
  v_late boolean;
begin
  select * into m from public.meetings where id = p_meeting_id;
  if m.id is null then raise exception 'Meeting not found' using hint = 'not_found'; end if;
  if not public.can_manage_meeting(m.id) and not exists (
    select 1 from public.meeting_participants where meeting_id = m.id and user_id = v_uid and admission = 'admitted') then
    raise exception 'You are not admitted to this meeting' using hint = 'forbidden';
  end if;
  -- "Late" = joined more than 5 minutes after the later of scheduled start and actual start
  v_late := v_now > greatest(m.scheduled_at, coalesce(m.started_at, m.scheduled_at)) + interval '5 minutes';
  select * into a from public.attendance where meeting_id = m.id and user_id = v_uid;

  if p_event = 'join' then
    if a.id is null then
      insert into public.attendance (meeting_id, user_id, joined_at, left_at, session_started_at, join_count, status)
      values (m.id, v_uid, v_now, v_now, v_now, 1, case when v_late then 'late' else 'present' end);
    else
      update public.attendance set
        status = case when status = 'absent' then (case when v_late then 'late' else 'present' end) else status end,
        joined_at = coalesce(joined_at, v_now),
        join_count = join_count + case when session_started_at is null then 1 else 0 end,
        session_started_at = coalesce(session_started_at, v_now),
        left_at = v_now
      where id = a.id;
    end if;
  elsif a.session_started_at is not null then
    if p_event = 'leave' then
      update public.attendance set
        left_at = v_now,
        total_seconds = total_seconds + extract(epoch from (v_now - session_started_at))::int,
        session_started_at = null
      where id = a.id;
    else -- heartbeat: remember the last moment we saw this participant connected
      update public.attendance set left_at = v_now where id = a.id;
    end if;
  end if;
end $$;

create or replace function public.start_meeting(p_meeting_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.meetings;
begin
  if not public.can_manage_meeting(p_meeting_id) then raise exception 'Only the host can start this meeting' using hint = 'forbidden'; end if;
  update public.meetings set status = 'live', started_at = coalesce(started_at, now())
  where id = p_meeting_id and status = 'scheduled' returning * into m;
  if m.id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    select p.user_id, 'meeting', m.title || ' has started', public.my_name() || ' started the meeting — join now', '/meet/' || m.id
    from public.meeting_participants p
    where p.meeting_id = m.id and p.user_id <> auth.uid() and p.admission in ('invited', 'admitted');
  end if;
end $$;

-- Ends the meeting, closes open attendance sessions and marks no-shows absent.
create or replace function public.end_meeting(p_meeting_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.meetings;
begin
  if not public.can_manage_meeting(p_meeting_id) then raise exception 'Only the host can end this meeting' using hint = 'forbidden'; end if;
  update public.meetings set status = 'ended', ended_at = now(), started_at = coalesce(started_at, now())
  where id = p_meeting_id and status <> 'ended' returning * into m;
  if m.id is null then return; end if;

  update public.attendance set
    total_seconds = total_seconds + greatest(0, extract(epoch from (greatest(coalesce(left_at, m.ended_at), session_started_at) - session_started_at)))::int,
    session_started_at = null
  where meeting_id = m.id and session_started_at is not null;

  insert into public.attendance (meeting_id, user_id, status, total_seconds, join_count)
  select p.meeting_id, p.user_id, 'absent', 0, 0
  from public.meeting_participants p
  where p.meeting_id = m.id and p.admission <> 'denied'
  on conflict (meeting_id, user_id) do nothing;
end $$;

-- ── RPC: emoji reactions on any message the caller can read ────────────────
create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare
  msg public.messages;
  v_uid text := auth.uid()::text;
  v_list jsonb;
begin
  if p_emoji is null or length(p_emoji) > 16 then raise exception 'Invalid reaction' using hint = 'invalid'; end if;
  select * into msg from public.messages where id = p_message_id;
  if msg.id is null or not (
       (msg.room_id is not null and public.can_view_room(msg.room_id))
    or (msg.meeting_id is not null and public.can_view_meeting(msg.meeting_id))
    or (msg.recipient_id is not null and (msg.sender_id = auth.uid() or msg.recipient_id = auth.uid()))) then
    raise exception 'Message not found' using hint = 'not_found';
  end if;
  v_list := coalesce(msg.reactions -> p_emoji, '[]'::jsonb);
  if v_list ? v_uid then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_list from jsonb_array_elements_text(v_list) x where x <> v_uid;
  else
    v_list := v_list || to_jsonb(v_uid);
  end if;
  update public.messages set reactions = case when jsonb_array_length(v_list) = 0 then reactions - p_emoji else jsonb_set(reactions, array[p_emoji], v_list) end
  where id = p_message_id;
end $$;

-- ── RPC: meeting password (bcrypt), stored where clients can't read it ─────
create or replace function public.set_meeting_password(p_meeting_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.can_manage_meeting(p_meeting_id) then raise exception 'Only the host can change the password' using hint = 'forbidden'; end if;
  if p_password is null or p_password = '' then
    delete from public.meeting_secrets where meeting_id = p_meeting_id;
  else
    insert into public.meeting_secrets (meeting_id, password_hash) values (p_meeting_id, crypt(p_password, gen_salt('bf')))
    on conflict (meeting_id) do update set password_hash = excluded.password_hash;
  end if;
end $$;

-- Lock down: RPCs callable by signed-in users only
revoke execute on function public.join_meeting(text, uuid, text), public.record_attendance(uuid, text), public.start_meeting(uuid),
  public.end_meeting(uuid), public.toggle_reaction(uuid, text), public.set_meeting_password(uuid, text) from public, anon;
grant execute on function public.join_meeting(text, uuid, text), public.record_attendance(uuid, text), public.start_meeting(uuid),
  public.end_meeting(uuid), public.toggle_reaction(uuid, text), public.set_meeting_password(uuid, text) to authenticated;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Postgres Changes respect RLS: each client only receives rows it may read.
alter publication supabase_realtime add table
  public.users, public.teams, public.team_members, public.team_rooms, public.room_members, public.meetings,
  public.meeting_participants, public.meeting_notes, public.meeting_tasks, public.meeting_insights, public.tasks,
  public.messages, public.announcements, public.notifications, public.attendance, public.kpi_definitions, public.performance;

-- Private meeting channels (signaling, presence, reactions): admitted participants and hosts only.
create or replace function public.meeting_channel_allowed(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_topic is null or p_topic not like 'meeting:%' then return false; end if;
  begin
    v_id := substring(p_topic from 9)::uuid;
  exception when others then
    return false;
  end;
  return public.can_manage_meeting(v_id) or exists (
    select 1 from public.meeting_participants where meeting_id = v_id and user_id = auth.uid() and admission = 'admitted');
end $$;

create policy "meeting channel: receive" on realtime.messages for select to authenticated
  using (public.meeting_channel_allowed(realtime.topic()));
create policy "meeting channel: send" on realtime.messages for insert to authenticated
  with check (public.meeting_channel_allowed(realtime.topic()));

-- ── Storage ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false), ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- Recording paths are "<meeting_id>/<file>"
create or replace function public.recording_path_allowed(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  begin
    v_id := (storage.foldername(p_name))[1]::uuid;
  exception when others then
    return false;
  end;
  return case when p_write then public.can_manage_meeting(v_id) else public.can_view_meeting(v_id) end;
end $$;

create policy "attachments: upload" on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
create policy "attachments: read" on storage.objects for select to authenticated using (bucket_id = 'attachments');
create policy "recordings: host upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and public.recording_path_allowed(name, true));
create policy "recordings: participants read" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and public.recording_path_allowed(name, false));
