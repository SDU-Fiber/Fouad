// AI Meeting Assistant — provider architecture.
//
//   MeetingContext ──► MeetingIntelligenceProvider.analyze() ──► meeting_insights row
//
// • "mock"  (default) — deterministic heuristics over notes, decisions, chat, tasks and attendance.
//                       Works offline so the full post-meeting flow is testable today.
// • "edge"            — Supabase Edge Function `meeting-insights` (supabase/functions) which calls an LLM
//                       server-side (API key never reaches the browser) and writes the same row shape.
// Future: a transcription provider feeds `transcript` into the same context — no UI change needed.
import type { Backend } from '../data/backend';
import type { ActionSuggestion, Attendance, Meeting, MeetingInsights, MeetingNote, Message, Priority, Snapshot, Task, User } from '../lib/types';
import { addDays, firstName, fmtDuration, ymd } from '../lib/utils';

export interface MeetingContext {
  meeting: Meeting;
  notes: MeetingNote[];
  tasks: Task[];
  chat: Message[];
  attendance: Attendance[];
  participants: User[];
  transcript?: string;
}

export type InsightsResult = Pick<MeetingInsights, 'summary' | 'decisions' | 'action_items' | 'follow_ups'>;

export interface MeetingIntelligenceProvider {
  readonly name: string;
  analyze(ctx: MeetingContext): Promise<InsightsResult>;
}

const DECISION_RE = /\b(we (will|agreed|decided)|agreed|decision|decided|going forward|from now on|let'?s)\b/i;
const ACTION_RE = /\b(follow[- ]?up|call|send|prepare|visit|share|check|update|escalate|book|confirm|submit|review|draft)\b/i;

export const mockProvider: MeetingIntelligenceProvider = {
  name: 'mock',
  async analyze(ctx) {
    const { meeting: m, notes, tasks, chat, attendance, participants } = ctx;
    const nameOf = new Map(participants.map((u) => [u.id, u.full_name]));
    const present = attendance.filter((a) => a.status !== 'absent');
    const late = attendance.filter((a) => a.status === 'late');
    const absent = attendance.filter((a) => a.status === 'absent');
    const decisionNotes = notes.filter((n) => n.kind === 'decision').map((n) => n.content);
    const plainNotes = notes.filter((n) => n.kind === 'note');
    const durationSec = m.started_at && m.ended_at ? (new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()) / 1000 : m.duration_min * 60;

    // Decisions: explicit decision notes + decision-like statements in notes/chat
    const decisions = [...decisionNotes];
    [...plainNotes.map((n) => n.content), ...chat.map((c) => c.body)].forEach((line) => {
      if (DECISION_RE.test(line) && !decisions.some((d) => d.toLowerCase() === line.toLowerCase())) decisions.push(line);
    });

    // Action items: existing tasks + extracted candidates
    const action_items: ActionSuggestion[] = tasks.map((t) => ({ title: t.title, assignee_id: t.assignee_id, priority: t.priority, due_date: t.due_date, source: 'task' }));
    const lines = [...plainNotes.map((n) => ({ text: n.content, author: n.author_id, src: 'note' })), ...chat.map((c) => ({ text: c.body, author: c.sender_id, src: 'chat' }))];
    lines.forEach(({ text, author, src }) => {
      if (!ACTION_RE.test(text)) return;
      if (action_items.some((a) => a.title.toLowerCase() === text.toLowerCase())) return;
      const mentioned = participants.find((u) => new RegExp(`\\b${firstName(u.full_name)}\\b`, 'i').test(text));
      const priority: Priority = /urgent|asap|today|now/i.test(text) ? 'high' : 'medium';
      action_items.push({ title: text.length > 90 ? text.slice(0, 87) + '…' : text, assignee_id: mentioned?.id ?? author, priority, due_date: ymd(addDays(new Date(), priority === 'high' ? 0 : 1)), source: src });
    });

    // Follow-ups
    const follow_ups: string[] = [];
    if (absent.length > 3) follow_ups.push(`Share the minutes with the ${absent.length} absent members: ${absent.map((a) => firstName(nameOf.get(a.user_id) ?? '')).join(', ')}`);
    else absent.forEach((a) => follow_ups.push(`Share the minutes with ${nameOf.get(a.user_id) ?? 'absent member'} (absent)`));
    late.forEach((a) => follow_ups.push(`${nameOf.get(a.user_id) ?? 'A participant'} joined late — confirm they caught the decisions`));
    m.agenda.filter((a) => !a.done).forEach((a) => follow_ups.push(`Agenda item “${a.title}” not closed — carry over to the next meeting`));
    tasks.filter((t) => !t.due_date).forEach((t) => follow_ups.push(`Set a deadline for “${t.title}”`));
    if (!tasks.length) follow_ups.push('No action items were assigned — confirm owners for the decisions');

    const owners = new Map<string, number>();
    tasks.forEach((t) => owners.set(t.assignee_id, (owners.get(t.assignee_id) ?? 0) + 1));
    const topOwner = [...owners.entries()].sort((a, b) => b[1] - a[1])[0];
    const agenda = m.agenda.map((a) => a.title.toLowerCase());

    const summary = [
      `${m.title} ran ${fmtDuration(durationSec)} with ${present.length}/${attendance.length || participants.length} attendees` +
        (late.length ? ` (${late.map((a) => firstName(nameOf.get(a.user_id) ?? '')).join(', ')} late)` : '') +
        (absent.length > 3 ? `; ${absent.length} absent` : absent.length ? `; ${absent.map((a) => firstName(nameOf.get(a.user_id) ?? '')).join(', ')} absent` : '') + '.',
      agenda.length ? `The team covered ${agenda.join(', ')}.` : '',
      plainNotes[0] ? `Key point: ${plainNotes[0].content.replace(/\.$/, '')}.` : '',
      `${decisions.length} decision${decisions.length === 1 ? '' : 's'} recorded and ${tasks.length} action item${tasks.length === 1 ? '' : 's'} assigned` +
        (topOwner ? ` — ${nameOf.get(topOwner[0])} owns the most (${topOwner[1]}).` : '.'),
    ].filter(Boolean).join(' ');

    return { summary, decisions, action_items, follow_ups };
  },
};

function edgeProvider(backend: Backend, meetingId: string): MeetingIntelligenceProvider {
  return {
    name: 'edge',
    async analyze() {
      if (!backend.invoke) throw new Error('Edge functions are only available with Supabase');
      return (await backend.invoke('meeting-insights', { meeting_id: meetingId })) as InsightsResult;
    },
  };
}

export function buildContext(db: Snapshot, meetingId: string, chat: Message[]): MeetingContext | null {
  const meeting = db.meetings.find((m) => m.id === meetingId);
  if (!meeting) return null;
  const taskIds = new Set(db.meeting_tasks.filter((t) => t.meeting_id === meetingId).map((t) => t.task_id));
  const ids = new Set(db.meeting_participants.filter((p) => p.meeting_id === meetingId).map((p) => p.user_id));
  return {
    meeting,
    notes: db.meeting_notes.filter((n) => n.meeting_id === meetingId),
    tasks: db.tasks.filter((t) => taskIds.has(t.id)),
    chat,
    attendance: db.attendance.filter((a) => a.meeting_id === meetingId),
    participants: db.users.filter((u) => ids.has(u.id)),
  };
}

/** Runs the configured provider and stores the result in meeting_insights. */
export async function generateInsights(backend: Backend, db: Snapshot, meetingId: string, chat: Message[]) {
  const useEdge = (import.meta.env.VITE_AI_PROVIDER ?? 'mock') === 'edge' && backend.mode === 'supabase';
  const provider = useEdge ? edgeProvider(backend, meetingId) : mockProvider;
  const ctx = buildContext(db, meetingId, chat);
  if (!ctx) throw new Error('Meeting not found');
  const result = await provider.analyze(ctx);
  if (useEdge) return; // the edge function stores meeting_insights itself (with the caller's RLS permissions)
  const existing = db.meeting_insights.find((i) => i.meeting_id === meetingId);
  const row = { ...result, status: 'ready' as const, provider: provider.name };
  if (existing) await backend.update('meeting_insights', existing.id, row);
  else await backend.insert('meeting_insights', { ...row, meeting_id: meetingId });
}
