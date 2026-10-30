// Realistic demo data generated relative to "now", shared by the demo backend and scripts/seed-supabase.ts.
// Only type imports here so Node can run it with --experimental-strip-types.
import type {
  AgendaItem, Announcement, Attendance, KpiDefinition, Meeting, MeetingInsights, MeetingNote, MeetingParticipant,
  MeetingTask, Message, Notification, Performance, Role, RoomMember, Snapshot, Task, Team, TeamMember, TeamRoom,
  User, UserStatus,
} from './types';

export const DEMO_PASSWORD = 'demo1234';

// Deterministic PRNG so every fresh demo looks the same.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset: number, h = 0, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d;
};
const iso = (d: Date) => d.toISOString();
const minutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

// Stable UUIDs so the Supabase seed is idempotent and demo links survive reloads.
const id = (prefix: number, n: number) => `00000000-0000-4000-8000-${prefix.toString(16).padStart(2, '0')}${String(n).padStart(10, '0')}`;

export interface SeedPerson {
  key: string;
  full_name: string;
  email: string;
  role: Role;
  title: string;
  status: UserStatus;
  activity: string;
  color: string;
  team?: 'west' | 'north';
  /** Relative strength used to generate KPI actuals (1 = on target). */
  strength: number;
}

export const PEOPLE: SeedPerson[] = [
  { key: 'admin', full_name: 'Rania Saleh', email: 'admin@teamhub.demo', role: 'admin', title: 'Platform Admin', status: 'online', activity: 'Reviewing access settings', color: '#3F3F46', strength: 1 },
  { key: 'manager', full_name: 'Karim Mansour', email: 'manager@teamhub.demo', role: 'manager', title: 'Zonal Sales Manager', status: 'online', activity: 'Preparing weekly review', color: '#E60000', strength: 1 },
  { key: 'nadia', full_name: 'Nadia Haddad', email: 'leader@teamhub.demo', role: 'team_leader', title: 'Team Leader — West Zone', status: 'online', activity: 'Coaching on iPay pitch', color: '#B45309', team: 'west', strength: 1.05 },
  { key: 'omar', full_name: 'Omar Khalil', email: 'omar@teamhub.demo', role: 'team_leader', title: 'Team Leader — North Zone', status: 'away', activity: 'Store visit — Lusail', color: '#0F766E', team: 'north', strength: 0.92 },
  { key: 'salim', full_name: 'Salim Ben Ali', email: 'salim@teamhub.demo', role: 'employee', title: 'Sales Executive', status: 'online', activity: 'Calling iPay leads', color: '#7C3AED', team: 'west', strength: 1.39 },
  { key: 'aisha', full_name: 'Aisha Rahman', email: 'staff@teamhub.demo', role: 'employee', title: 'Sales Executive', status: 'online', activity: 'Customer visit — West Bay', color: '#DB2777', team: 'west', strength: 1.12 },
  { key: 'youssef', full_name: 'Youssef Amari', email: 'youssef@teamhub.demo', role: 'employee', title: 'Senior Sales Executive', status: 'online', activity: 'Fiber survey follow-ups', color: '#2563EB', team: 'west', strength: 0.96 },
  { key: 'mariam', full_name: 'Mariam Al-Kuwari', email: 'mariam@teamhub.demo', role: 'employee', title: 'Sales Executive', status: 'away', activity: 'Lunch break', color: '#059669', team: 'west', strength: 0.78 },
  { key: 'hassan', full_name: 'Hassan Farouk', email: 'hassan@teamhub.demo', role: 'employee', title: 'Sales Executive', status: 'online', activity: 'Booth — City Center mall', color: '#EA580C', team: 'north', strength: 0.88 },
  { key: 'layla', full_name: 'Layla Nasser', email: 'layla@teamhub.demo', role: 'employee', title: 'Sales Executive', status: 'online', activity: 'Updating CRM pipeline', color: '#0891B2', team: 'north', strength: 1.02 },
  { key: 'tarek', full_name: 'Tarek Mahmoud', email: 'tarek@teamhub.demo', role: 'employee', title: 'Sales Executive', status: 'offline', activity: 'Day off', color: '#4B5563', team: 'north', strength: 0.64 },
  { key: 'sara', full_name: 'Sara Dabbagh', email: 'sara@teamhub.demo', role: 'employee', title: 'Junior Sales Executive', status: 'busy', activity: 'Closing Fiber contract', color: '#9333EA', team: 'north', strength: 0.81 },
];

export const KPI_DEFINITIONS: KpiDefinition[] = [
  { key: 'lgc', label: 'LGC Achievement', short_label: 'LGC', unit: 'pts', display: 'percent', color: '#E60000', weight: 3, daily_target: 4, sort_order: 1, active: true },
  { key: 'ipay', label: 'iPay Applications', short_label: 'iPay', unit: 'apps', display: 'count', color: '#7C3AED', weight: 2, daily_target: 2, sort_order: 2, active: true },
  { key: 'fiber', label: 'Fiber Leads', short_label: 'Fiber', unit: 'leads', display: 'count', color: '#0891B2', weight: 2, daily_target: 3, sort_order: 3, active: true },
  { key: 'leads', label: 'Leads', short_label: 'Leads', unit: 'leads', display: 'count', color: '#B45309', weight: 1, daily_target: 8, sort_order: 4, active: true },
  { key: 'conversions', label: 'Conversions', short_label: 'Conv.', unit: 'deals', display: 'count', color: '#059669', weight: 2, daily_target: 3, sort_order: 5, active: true },
  { key: 'applications', label: 'Applications', short_label: 'Apps', unit: 'apps', display: 'count', color: '#2563EB', weight: 1, daily_target: 4, sort_order: 6, active: true },
];

export type SeedData = Snapshot & { messages: Message[] };

export function buildSeed(): SeedData {
  const rand = rng(42);
  const now = new Date();
  const userId: Record<string, string> = {};
  PEOPLE.forEach((p, i) => (userId[p.key] = id(1, i + 1)));
  const U = (k: string) => userId[k]!;

  const users: User[] = PEOPLE.map((p) => ({
    id: U(p.key), email: p.email, full_name: p.full_name, role: p.role, title: p.title, avatar_url: null,
    avatar_color: p.color, phone: '+974 5' + String(5000000 + Math.floor(rand() * 4999999)).slice(0, 7),
    status: p.status, activity: p.activity,
    last_seen_at: iso(p.status === 'offline' ? day(-1, 18, 40) : now), created_at: iso(day(-120, 9)),
  }));

  const teams: Team[] = [
    { id: id(2, 1), name: 'West Zone', description: 'West Bay, Al Sadd, Education City', manager_id: U('manager'), leader_id: U('nadia'), created_at: iso(day(-120, 9)) },
    { id: id(2, 2), name: 'North Zone', description: 'Lusail, Al Khor, The Pearl', manager_id: U('manager'), leader_id: U('omar'), created_at: iso(day(-120, 9)) },
  ];
  const TEAM = { west: teams[0]!.id, north: teams[1]!.id };

  let tm = 0;
  const team_members: TeamMember[] = PEOPLE.filter((p) => p.team).map((p) => ({
    id: id(3, ++tm), team_id: TEAM[p.team!], user_id: U(p.key),
    member_role: p.role === 'team_leader' ? 'leader' : 'member', joined_at: iso(day(-110, 9)),
  }));

  const sales = PEOPLE.filter((p) => p.team);
  const westKeys = sales.filter((p) => p.team === 'west').map((p) => p.key);
  const northKeys = sales.filter((p) => p.team === 'north').map((p) => p.key);
  const allSales = sales.map((p) => p.key);

  // ── Team rooms ───────────────────────────────────────────────────────────
  const roomDefs: [string, string, string, string, boolean, string[]][] = [
    ['Daily Sales Room', 'Morning huddles, daily targets and quick wins', 'sun', '#E60000', false, ['manager', ...allSales]],
    ['LGC Room', 'LGC pipeline, offers and objections', 'target', '#B45309', false, ['manager', ...allSales]],
    ['iPay Room', 'iPay applications, KYC issues and approvals', 'wallet', '#7C3AED', false, ['manager', ...allSales]],
    ['Fiber Room', 'Fiber leads, surveys and installation follow-up', 'wifi', '#0891B2', false, ['manager', ...allSales]],
    ['Management Room', 'Private — manager and team leaders only', 'shield', '#18181B', true, ['manager', 'nadia', 'omar']],
  ];
  const team_rooms: TeamRoom[] = roomDefs.map(([name, description, icon, color, is_private], i) => ({
    id: id(4, i + 1), name, description, icon, color, is_private, team_id: null, created_by: U('manager'), created_at: iso(day(-100, 9)),
  }));
  let rm = 0;
  const room_members: RoomMember[] = roomDefs.flatMap(([, , , , , members], i) =>
    members.map((k) => ({ id: id(5, ++rm), room_id: team_rooms[i]!.id, user_id: U(k), member_role: k === 'manager' ? 'owner' as const : 'member' as const, created_at: iso(day(-100, 9)) })),
  );
  const ROOM = { daily: team_rooms[0]!.id, lgc: team_rooms[1]!.id, ipay: team_rooms[2]!.id, fiber: team_rooms[3]!.id, mgmt: team_rooms[4]!.id };

  // ── Meetings ────────────────────────────────────────────────────────────
  const meetings: Meeting[] = [];
  const meeting_participants: MeetingParticipant[] = [];
  const attendance: Attendance[] = [];
  const meeting_notes: MeetingNote[] = [];
  const meeting_tasks: MeetingTask[] = [];
  const meeting_insights: MeetingInsights[] = [];
  const tasks: Task[] = [];
  const messages: Message[] = [];
  let mp = 0, at = 0, mn = 0, mt = 0, tk = 0, msg = 0, mi = 0;

  const agenda = (...items: [string, number][]): AgendaItem[] =>
    items.map(([title, mins], i) => ({ id: `ag-${i + 1}`, title, minutes: mins, done: false }));

  const addTask = (t: Partial<Task> & Pick<Task, 'title' | 'assignee_id'>): Task => {
    const task: Task = {
      id: id(8, ++tk), description: '', team_id: null, room_id: null, priority: 'medium', status: 'todo',
      due_date: ymd(day(1)), created_by: U('manager'), created_at: iso(day(-1, 10)), completed_at: null, ...t,
    };
    tasks.push(task);
    return task;
  };

  interface MeetingSpec {
    title: string; description: string; at: Date; dur: number; host: string; team: string | null; room: string | null;
    invite: string[]; status: Meeting['status']; access?: Meeting['access']; agenda: AgendaItem[];
    late?: string[]; absent?: string[]; notes?: [string, string][]; decisions?: string[];
    actions?: [string, string, Task['priority'], number, Task['status']?][]; chat?: [string, string][]; summary?: string;
  }

  const addMeeting = (s: MeetingSpec) => {
    const mid = id(6, meetings.length + 1);
    const ended = s.status === 'ended';
    const startedAt = ended ? minutes(s.at, 1) : null;
    const endedAt = ended ? minutes(s.at, s.dur) : null;
    meetings.push({
      id: mid, title: s.title, description: s.description, agenda: s.agenda.map((a) => ({ ...a, done: ended })),
      team_id: s.team, room_id: s.room, host_id: U(s.host), scheduled_at: iso(s.at), duration_min: s.dur,
      status: s.status, access: s.access ?? 'team', password_hash: null,
      join_token: `demo-${mid.slice(-6)}-${Math.floor(rand() * 1e9).toString(36)}`, locked: false,
      recording_enabled: false, recording: null, started_at: startedAt ? iso(startedAt) : null,
      ended_at: endedAt ? iso(endedAt) : null, created_at: iso(minutes(s.at, -60 * 24)),
    });
    const people = [...new Set([s.host, ...s.invite])];
    people.forEach((k) =>
      meeting_participants.push({
        id: id(7, ++mp), meeting_id: mid, user_id: U(k), role: k === s.host ? 'host' : 'attendee',
        admission: ended && !s.absent?.includes(k) ? 'admitted' : 'invited', created_at: iso(minutes(s.at, -60 * 24)),
      }),
    );
    if (ended) {
      people.forEach((k) => {
        const absent = s.absent?.includes(k);
        const late = s.late?.includes(k);
        const join = minutes(s.at, late ? 7 + Math.floor(rand() * 6) : Math.floor(rand() * 3));
        const leave = minutes(s.at, s.dur - Math.floor(rand() * 2));
        attendance.push({
          id: id(9, ++at), meeting_id: mid, user_id: U(k), joined_at: absent ? null : iso(join), left_at: absent ? null : iso(leave),
          session_started_at: null, total_seconds: absent ? 0 : Math.round((leave.getTime() - join.getTime()) / 1000),
          join_count: absent ? 0 : 1, status: absent ? 'absent' : late ? 'late' : 'present',
        });
      });
      (s.notes ?? []).forEach(([author, content], i) => {
        const t = iso(minutes(s.at, 3 + i * 4));
        meeting_notes.push({ id: id(10, ++mn), meeting_id: mid, author_id: U(author), kind: 'note', content, created_at: t, updated_at: t });
      });
      (s.decisions ?? []).forEach((content, i) => {
        const t = iso(minutes(s.at, 10 + i * 5));
        meeting_notes.push({ id: id(10, ++mn), meeting_id: mid, author_id: U(s.host), kind: 'decision', content, created_at: t, updated_at: t });
      });
      const created: Task[] = [];
      const old = s.at.getTime() < Date.now() - 3 * 86_400_000;
      (s.actions ?? []).forEach(([title, who, priority, dueOffset, explicit]) => {
        const status = explicit ?? (old && rand() > 0.25 ? 'completed' : undefined);
        const due = new Date(s.at);
        due.setDate(due.getDate() + dueOffset);
        const task = addTask({
          title, assignee_id: U(who), priority, status: status ?? 'todo', due_date: ymd(due), created_by: U(s.host),
          team_id: s.team, room_id: s.room, created_at: iso(minutes(s.at, s.dur - 5)),
          description: `Action item from "${s.title}" (${s.at.toLocaleDateString()})`,
          completed_at: status === 'completed' ? iso(minutes(s.at, 60 * 20)) : null,
        });
        created.push(task);
        meeting_tasks.push({ id: id(11, ++mt), meeting_id: mid, task_id: task.id, created_at: task.created_at });
      });
      (s.chat ?? []).forEach(([who, body], i) =>
        messages.push({
          id: id(12, ++msg), room_id: null, meeting_id: mid, recipient_id: null, sender_id: U(who), body, reply_to_id: null,
          attachments: [], reactions: {}, created_at: iso(minutes(s.at, 2 + i * 3)),
        }),
      );
      if (s.summary) {
        meeting_insights.push({
          id: id(13, ++mi), meeting_id: mid, status: 'ready', provider: 'mock', summary: s.summary,
          decisions: s.decisions ?? [],
          action_items: created.map((t) => ({ title: t.title, assignee_id: t.assignee_id, priority: t.priority, due_date: t.due_date, source: 'task' })),
          follow_ups: (s.absent ?? []).map((k) => `Share minutes with ${PEOPLE.find((p) => p.key === k)!.full_name} (absent)`),
          created_at: iso(minutes(s.at, s.dur + 2)),
        });
      }
    }
    return mid;
  };

  // Past meetings (history)
  const pastTemplates = [
    {
      title: 'Daily Sales Meeting', room: ROOM.daily, team: null as string | null, invite: ['nadia', 'omar', ...allSales],
      agenda: agenda(['Yesterday results', 5], ['Today targets per zone', 10], ['Blockers & support needed', 10], ['Commitments', 5]),
      notes: [['manager', 'Yesterday closed at 92% of daily LGC target — North Zone behind by 3 activations'], ['nadia', 'West Zone booth at City Center converting well after 4pm'], ['omar', 'Two iPay applications stuck on KYC — need back-office escalation'], ['salim', 'Corporate lead at West Bay tower interested in 12 Fiber lines']] as [string, string][],
      decisions: ['Focus first 2 hours on warm iPay leads', 'North Zone to borrow one promoter from West for the weekend'],
      actions: [['Follow up 5 iPay customers', 'salim', 'high', 1], ['Escalate 2 stuck KYC cases to back-office', 'omar', 'urgent', 0, 'completed'], ['Send Fiber proposal to West Bay tower', 'youssef', 'high', 2], ['Share booth timing analysis', 'nadia', 'medium', 3, 'in_progress']] as [string, string, Task['priority'], number, Task['status']?][],
      chat: [['salim', 'Good morning team 💪'], ['layla', 'Can we get updated iPay flyers?'], ['manager', 'Yes — Nadia will share the new pack in the iPay Room'], ['aisha', 'Agreed, will push the bundle offer today']] as [string, string][],
      late: ['mariam'], absent: ['tarek'],
    },
    {
      title: 'iPay Push Review', room: ROOM.ipay, team: TEAM.west, invite: ['nadia', ...westKeys],
      agenda: agenda(['Funnel: leads → applications', 10], ['KYC rejection reasons', 10], ['Next week plan', 10]),
      notes: [['nadia', '38% of rejections caused by expired QID copies'], ['aisha', 'Customers ask about cashback — need clear one-pager'], ['youssef', 'Mall booth leads convert 2x better than cold calls']] as [string, string][],
      decisions: ['Check QID expiry before submitting every iPay application', 'Run iPay pitch at the mall booth every evening'],
      actions: [['Create QID pre-check checklist', 'nadia', 'high', 1, 'completed'], ['Prepare cashback one-pager', 'aisha', 'medium', 2, 'completed'], ['Book booth evening slots for next week', 'youssef', 'medium', 3]] as [string, string, Task['priority'], number, Task['status']?][],
      chat: [['aisha', 'Sharing the rejection list in the iPay room'], ['nadia', 'Thanks Aisha 🙏']] as [string, string][],
      late: [], absent: ['mariam'],
    },
    {
      title: 'Fiber Pipeline Sync', room: ROOM.fiber, team: TEAM.north, invite: ['omar', ...northKeys],
      agenda: agenda(['Pipeline status', 10], ['Survey backlog', 10], ['Installation complaints', 5]),
      notes: [['omar', '18 Fiber leads open, 6 waiting for site survey'], ['layla', 'Lusail towers: building management approval needed'], ['hassan', 'Two customers waiting more than 10 days for installation']] as [string, string][],
      decisions: ['Escalate surveys older than 5 days every morning', 'Hassan owns the Lusail building approvals'],
      actions: [['Call 6 customers waiting for survey', 'layla', 'high', 1], ['Get Lusail building approval letters', 'hassan', 'high', 4], ['Weekly Fiber backlog report', 'omar', 'medium', 5]] as [string, string, Task['priority'], number, Task['status']?][],
      chat: [['sara', 'I can take two of the survey calls'], ['omar', 'Great, coordinate with Layla']] as [string, string][],
      late: ['sara'], absent: ['tarek'],
    },
    {
      title: 'Weekly Performance Review', room: ROOM.mgmt, team: null as string | null, invite: ['nadia', 'omar'],
      agenda: agenda(['Zone scorecards', 15], ['Low performers support plan', 10], ['Incentive scheme', 10]),
      notes: [['manager', 'West at 104% of LGC, North at 81%'], ['omar', 'Tarek needs coaching on objection handling'], ['nadia', 'Propose pairing juniors with top performers twice a week']] as [string, string][],
      decisions: ['Start buddy program: Salim ↔ Sara, Aisha ↔ Mariam', 'Weekly top-performer recognition on Thursday huddle'],
      actions: [['Draft buddy program schedule', 'nadia', 'medium', 2], ['Coaching session with Tarek', 'omar', 'high', 1], ['Prepare recognition certificates', 'manager', 'low', 4, 'completed']] as [string, string, Task['priority'], number, Task['status']?][],
      chat: [] as [string, string][], late: [], absent: [],
    },
  ];

  const pastDays = [-1, -2, -3, -4, -6, -7, -8, -10];
  pastDays.forEach((offset, i) => {
    const t = pastTemplates[i % pastTemplates.length]!;
    const d = day(offset, i % 4 === 0 ? 9 : 11, 0);
    const host = t.team === TEAM.west ? 'nadia' : t.team === TEAM.north ? 'omar' : 'manager';
    const dur = [34, 41, 28, 47][i % 4]!;
    const absentCount = (t.absent ?? []).length;
    const invitedCount = new Set([host, ...t.invite]).size;
    const present = invitedCount - absentCount;
    addMeeting({
      title: t.title, description: 'Recurring team meeting', at: d, dur, host, team: t.team, room: t.room, invite: t.invite,
      status: 'ended', agenda: t.agenda, late: t.late, absent: t.absent, notes: i < 4 ? t.notes : t.notes.slice(0, 2),
      decisions: t.decisions, actions: i < 4 ? t.actions : t.actions.slice(0, 1), chat: i < 4 ? t.chat : [],
      summary: `${t.title} ran ${dur} minutes with ${present}/${invitedCount} attendees. The team reviewed ${t.agenda.map((a) => a.title.toLowerCase()).join(', ')}. ${t.decisions.length} decisions were taken and action owners were assigned with deadlines.`,
    });
  });

  // Earlier today: completed morning huddle
  const morning = day(0, Math.min(Math.max(now.getHours() - 3, 7), 9), 0);
  if (morning < now) {
    addMeeting({
      title: 'Daily Sales Meeting', description: 'Morning huddle — targets, blockers and commitments', at: morning, dur: 34,
      host: 'manager', team: null, room: ROOM.daily, invite: ['nadia', 'omar', ...allSales], status: 'ended',
      agenda: pastTemplates[0]!.agenda, late: ['mariam'], absent: ['tarek'],
      notes: [['manager', 'Target today: 10 iPay applications per team, 18 Fiber leads overall'], ['salim', 'Already 3 iPay appointments booked for this morning'], ['omar', 'North zone short on promoters at the Pearl kiosk'], ['aisha', 'West Bay corporate visit at 11:00 — bringing Fiber + LGC bundle']],
      decisions: ['Every rep logs leads in TeamHub before 6pm', 'Omar gets Hassan for the Pearl kiosk this afternoon', 'Fiber leads above 5 lines go to Youssef'],
      actions: [['Follow up 5 iPay customers', 'salim', 'high', 1], ['Confirm Pearl kiosk staffing', 'omar', 'urgent', 0, 'in_progress'], ['Send West Bay bundle proposal', 'aisha', 'high', 1], ['Update Fiber lead sheet', 'youssef', 'medium', 0, 'completed'], ['Call back 3 LGC prospects from yesterday', 'mariam', 'medium', 0], ['Prepare iPay objection-handling notes', 'nadia', 'medium', 2], ['Check Tarek coverage for tomorrow', 'omar', 'low', 1]],
      chat: [['salim', 'Morning all ☀️'], ['nadia', 'West zone is ready 🚀'], ['layla', 'Can someone share yesterday’s numbers?'], ['manager', 'Posted in the Daily Sales Room']],
      summary: 'Morning huddle ran 34 minutes with 10/11 attendees (Mariam late, Tarek absent). Daily target set at 10 iPay applications per team and 18 Fiber leads. Three decisions recorded and seven action items assigned — Salim owns the iPay follow-ups and Omar the Pearl kiosk staffing.',
    });
  }

  // Upcoming
  const nextSlot = new Date(now);
  nextSlot.setMinutes(nextSlot.getMinutes() < 30 ? 30 : 60, 0, 0);
  if (nextSlot.getTime() - now.getTime() < 15 * 60_000) nextSlot.setMinutes(nextSlot.getMinutes() + 30);
  addMeeting({
    title: 'iPay Push Review', description: 'Mid-day check on iPay applications vs. the 10-per-team target', at: nextSlot, dur: 30,
    host: 'manager', team: null, room: ROOM.ipay, invite: ['nadia', 'omar', ...allSales], status: 'scheduled',
    agenda: agenda(['Applications so far', 10], ['Stuck applications', 10], ['Afternoon plan', 10]),
  });
  addMeeting({
    title: 'Fiber Pipeline Sync', description: 'North Zone fiber backlog and surveys', at: day(1, 10, 0), dur: 45,
    host: 'omar', team: TEAM.north, room: ROOM.fiber, invite: northKeys, status: 'scheduled',
    agenda: agenda(['Pipeline status', 15], ['Survey backlog', 15], ['Installation issues', 15]),
  });
  addMeeting({
    title: 'Daily Sales Meeting', description: 'Morning huddle', at: day(1, 9, 0), dur: 30, host: 'manager', team: null,
    room: ROOM.daily, invite: ['nadia', 'omar', ...allSales], status: 'scheduled', agenda: pastTemplates[0]!.agenda,
  });
  addMeeting({
    title: 'Weekly Performance Review', description: 'Zone scorecards and coaching plan', at: day(3, 14, 0), dur: 60,
    host: 'manager', team: null, room: ROOM.mgmt, invite: ['nadia', 'omar'], status: 'scheduled', access: 'approval',
    agenda: pastTemplates[3]!.agenda,
  });

  // Stand-alone tasks
  addTask({ title: 'Approve weekend promoter swap (North → West)', assignee_id: U('manager'), priority: 'high', status: 'todo', due_date: ymd(day(0)), created_by: U('omar') });
  addTask({ title: 'Review zone forecasts before Thursday', assignee_id: U('manager'), priority: 'medium', status: 'in_progress', due_date: ymd(day(2)) });
  addTask({ title: 'Visit Al Sadd SME cluster (8 shops)', assignee_id: U('hassan'), priority: 'medium', status: 'todo', due_date: ymd(day(2)), team_id: TEAM.north, created_by: U('omar') });
  addTask({ title: 'Renew mall booth permit', assignee_id: U('nadia'), priority: 'high', status: 'in_progress', due_date: ymd(day(1)), team_id: TEAM.west });
  addTask({ title: 'Upload signed Fiber contracts', assignee_id: U('sara'), priority: 'high', status: 'todo', due_date: ymd(day(-1)), team_id: TEAM.north, created_by: U('omar') });
  addTask({ title: 'Complete iPay compliance e-learning', assignee_id: U('layla'), priority: 'low', status: 'todo', due_date: ymd(day(5)), team_id: TEAM.north });
  addTask({ title: 'Prepare LGC offer comparison sheet', assignee_id: U('salim'), priority: 'medium', status: 'in_progress', due_date: ymd(day(0)), team_id: TEAM.west, created_by: U('nadia') });
  addTask({ title: 'Customer feedback calls (5)', assignee_id: U('aisha'), priority: 'low', status: 'completed', due_date: ymd(day(-2)), team_id: TEAM.west, completed_at: iso(day(-2, 15)) });
  addTask({ title: 'Clean duplicate leads in CRM', assignee_id: U('tarek'), priority: 'medium', status: 'todo', due_date: ymd(day(-2)), team_id: TEAM.north, created_by: U('omar') });

  // ── Room & direct messages ───────────────────────────────────────────────
  const roomChat: [string, string, string, number][] = [
    [ROOM.daily, 'manager', "Yesterday: LGC 92% · iPay 17 apps · Fiber 15 leads. Let's close the gap today 💪", -200],
    [ROOM.daily, 'salim', '3 iPay appointments booked before noon', -180],
    [ROOM.daily, 'aisha', 'Heading to West Bay for the corporate visit', -150],
    [ROOM.daily, 'omar', 'North: Hassan moving to the Pearl kiosk at 2pm', -95],
    [ROOM.daily, 'layla', 'Fiber lead from Lusail Marina — 4 lines 🎉', -40],
    [ROOM.daily, 'nadia', 'Great job Layla 👏', -38],
    [ROOM.ipay, 'nadia', 'Reminder: check QID expiry before submitting. Checklist pinned in Files.', -300],
    [ROOM.ipay, 'salim', 'Customer asking if iPay works with Apple Pay — anyone confirmed?', -120],
    [ROOM.ipay, 'youssef', 'Yes, works with Apple Pay since last update', -115],
    [ROOM.ipay, 'manager', "Tomorrow's target is 10 iPay applications per team.", -60],
    [ROOM.fiber, 'omar', '6 surveys pending > 5 days. Layla and Sara please call today.', -260],
    [ROOM.fiber, 'sara', 'Called 2/3 so far, both rescheduled for Thursday', -90],
    [ROOM.fiber, 'youssef', 'West Bay tower wants 12 lines — proposal going out tomorrow', -30],
    [ROOM.lgc, 'manager', 'New LGC bundle pricing is live from today', -500],
    [ROOM.lgc, 'mariam', 'Customers comparing with competitor 5G home plan — need talking points', -200],
    [ROOM.lgc, 'nadia', 'Will cover it in the objection-handling notes', -190],
    [ROOM.mgmt, 'manager', 'Please send your zone forecast before Thursday', -400],
    [ROOM.mgmt, 'omar', "North forecast: 85% LGC. Tarek's coverage is the risk.", -350],
    [ROOM.mgmt, 'nadia', 'West forecast: 105% LGC, iPay on track', -340],
  ];
  roomChat.forEach(([room, who, body, mins]) =>
    messages.push({ id: id(12, ++msg), room_id: room, meeting_id: null, recipient_id: null, sender_id: U(who), body, reply_to_id: null, attachments: [], reactions: mins > -60 ? { '👍': [U('manager')] } : {}, created_at: iso(minutes(now, mins)) }),
  );
  const dms: [string, string, string, number][] = [
    ['manager', 'salim', 'Great numbers this week Salim — keep it up!', -240],
    ['salim', 'manager', 'Thanks! Aiming for 10 iPay today 🎯', -235],
    ['nadia', 'aisha', 'Can you cover the booth 4–6pm?', -70],
    ['aisha', 'nadia', 'Yes, confirmed 👍', -65],
    ['omar', 'manager', 'Need approval for weekend promoter swap', -50],
  ];
  dms.forEach(([from, to, body, mins]) =>
    messages.push({ id: id(12, ++msg), room_id: null, meeting_id: null, recipient_id: U(to), sender_id: U(from), body, reply_to_id: null, attachments: [], reactions: {}, created_at: iso(minutes(now, mins)) }),
  );

  // ── Announcements ────────────────────────────────────────────────────────
  const announcements: Announcement[] = [
    { id: id(14, 1), title: "Tomorrow's iPay target", body: "Tomorrow's target is 10 iPay applications per team. Prioritise warm leads before noon.", author_id: U('manager'), team_id: null, priority: 'important', pinned: true, created_at: iso(minutes(now, -60)) },
    { id: id(14, 2), title: 'New LGC bundle pricing', body: 'Updated LGC bundle prices are live. Talking points are in the LGC Room.', author_id: U('manager'), team_id: null, priority: 'normal', pinned: false, created_at: iso(day(-1, 16)) },
    { id: id(14, 3), title: 'West Zone booth schedule', body: 'City Center booth runs 4–10pm all week. Check the rota in the Daily Sales Room.', author_id: U('nadia'), team_id: TEAM.west, priority: 'normal', pinned: false, created_at: iso(day(-2, 12)) },
    { id: id(14, 4), title: 'Top performer of the week 🏆', body: 'Congratulations Salim — 139% LGC achievement this week!', author_id: U('manager'), team_id: null, priority: 'normal', pinned: false, created_at: iso(day(-3, 17)) },
  ];

  // ── Performance (daily grain, month to date + last 30 days) ──────────────
  const performance: Performance[] = [];
  let pf = 0;
  const hourFactor = Math.min(1, Math.max(0.15, (now.getHours() - 8) / 10));
  for (let offset = -34; offset <= 0; offset++) {
    const d = day(offset);
    if (d.getDay() === 5 && offset !== 0) continue; // Friday off (today always has data for the demo)
    sales.forEach((p) => {
      KPI_DEFINITIONS.forEach((k) => {
        const target = k.daily_target;
        const noise = 0.6 + rand() * 0.8;
        let actual = Math.round(target * p.strength * noise * (offset === 0 ? hourFactor : 1));
        if (offset === 0 && p.status === 'offline') actual = 0;
        performance.push({ id: id(15, ++pf), user_id: U(p.key), kpi_key: k.key, period: ymd(d), target, actual: Math.max(0, actual), updated_at: iso(offset === 0 ? now : d) });
      });
    });
  }

  // ── Notifications ────────────────────────────────────────────────────────
  const notifications: Notification[] = [];
  let nf = 0;
  tasks.filter((t) => t.status !== 'completed').forEach((t) =>
    notifications.push({ id: id(16, ++nf), user_id: t.assignee_id, type: 'task', title: 'New task assigned', body: t.title, link: '/tasks', read: rand() > 0.5, created_at: t.created_at }),
  );
  users.forEach((u) =>
    notifications.push({ id: id(16, ++nf), user_id: u.id, type: 'announcement', title: "Tomorrow's iPay target", body: 'Tomorrow’s target is 10 iPay applications per team.', link: '/announcements', read: false, created_at: iso(minutes(now, -60)) }),
  );

  return {
    users, teams, team_members, meetings, meeting_participants, meeting_notes, meeting_tasks, meeting_insights, tasks,
    team_rooms, room_members, announcements, attendance, kpi_definitions: KPI_DEFINITIONS, performance, notifications,
    messages,
  };
}
