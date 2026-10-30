import { useCallback } from 'react';
import { useApp } from '../data/AppContext';
import { managedUserIds } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { AgendaItem, Meeting, MeetingAccess, Task } from '../lib/types';
import { appUrl, copyText, firstName, nowIso, randomToken, sha256 } from '../lib/utils';
import { useAction, useToast } from './ui';

export interface MeetingDraft {
  title: string;
  description: string;
  scheduled_at: string;
  duration_min: number;
  team_id: string | null;
  room_id: string | null;
  invitees: string[];
  agenda: AgendaItem[];
  access: MeetingAccess;
  password: string;
  recording_enabled: boolean;
}

export const meetingLink = (m: Pick<Meeting, 'join_token'>) => appUrl(`/join/${m.join_token}`);

export function useMeetingActions() {
  const { backend, me, db } = useApp();
  const run = useAction();
  const toast = useToast();

  const createMeeting = useCallback(
    async (d: MeetingDraft) => {
      const payload: Partial<Meeting> = {
        title: d.title.trim(), description: d.description.trim(), scheduled_at: d.scheduled_at, duration_min: d.duration_min,
        team_id: d.team_id, room_id: d.room_id, agenda: d.agenda, access: d.access, recording_enabled: d.recording_enabled,
        host_id: me.id, join_token: randomToken(),
      };
      // Demo stores a SHA-256 hash locally; production keeps a bcrypt hash in meeting_secrets (never readable by clients).
      if (backend.mode === 'demo' && d.access === 'password' && d.password) payload.password_hash = await sha256(d.password);
      const [m] = await backend.insert('meetings', payload);
      const meeting = m!;
      if (backend.mode === 'supabase' && d.access === 'password' && d.password) await backend.rpc('set_meeting_password', { meeting_id: meeting.id, password: d.password });
      const people = [...new Set([me.id, ...d.invitees])];
      await backend.insert(
        'meeting_participants',
        people.map((uid) => ({ meeting_id: meeting.id, user_id: uid, role: uid === me.id ? ('host' as const) : ('attendee' as const), admission: uid === me.id ? ('admitted' as const) : ('invited' as const) })),
      );
      return meeting;
    },
    [backend, me.id],
  );

  /** One click: create an instant meeting with my team, go live, open the room. */
  const startInstant = useCallback(
    (preset?: Partial<MeetingDraft>) =>
      run(async () => {
        const invitees = [...managedUserIds(me, db)].filter((id) => id !== me.id);
        const m = await createMeeting({
          title: `${firstName(me.full_name)}'s instant meeting`, description: 'Instant meeting', scheduled_at: nowIso(), duration_min: 30,
          team_id: null, room_id: null, invitees, agenda: [], access: 'team', password: '', recording_enabled: false, ...preset,
        });
        navigate(`/meet/${m.id}`);
      }),
    [run, me, db, createMeeting],
  );

  const copyLink = useCallback(
    async (m: Pick<Meeting, 'join_token'>) => {
      const ok = await copyText(meetingLink(m));
      toast(ok ? 'Secure meeting link copied' : meetingLink(m), ok ? 'success' : 'info');
    },
    [toast],
  );

  /** Create a task (optionally linked to a meeting as an action item). */
  const createTask = useCallback(
    async (t: Pick<Task, 'title' | 'assignee_id' | 'priority' | 'due_date'> & Partial<Task>, meetingId?: string) => {
      const [task] = await backend.insert('tasks', { description: '', status: 'todo', created_by: me.id, ...t });
      if (meetingId) await backend.insert('meeting_tasks', { meeting_id: meetingId, task_id: task!.id });
      return task!;
    },
    [backend, me.id],
  );

  return { createMeeting, startInstant, copyLink, createTask };
}
