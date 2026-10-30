# TeamHub Meeting

**The meeting room built for sales teams.**
Video meetings + team management + meeting actions + sales performance — in one app.

> **Meet → Discuss → Decide → Assign → Track → Measure.** Every meeting ends with clear owners and measurable follow-up.

---

## Run it (2 minutes, no setup)

```bash
cd teamhub-meeting
npm install
npm run dev          # http://localhost:3000
```

With no Supabase keys the app starts in **Demo mode**: realistic data (10-person sales team, 2 zones, 5 team rooms, meetings, tasks, KPIs) stored in your browser.

| Demo account | Role | Password |
|---|---|---|
| `manager@teamhub.demo` (Karim) | Manager | `demo1234` |
| `leader@teamhub.demo` (Nadia) | Team Leader | `demo1234` |
| `salim@teamhub.demo` / `staff@teamhub.demo` | Sales Staff | `demo1234` |
| `admin@teamhub.demo` (Rania) | Admin | `demo1234` |

**Test a real video call:** open a 2nd tab, sign in as another person (each tab keeps its own login), join the same meeting. Video, audio, screen share, chat, raise hand, reactions, waiting room and host controls all work live between tabs.

---

## What's inside

| Area | Features |
|---|---|
| **Dashboard** | Team pulse (members / online / away / offline), today's LGC · iPay · Fiber, attendance today, open/completed tasks, upcoming meeting with countdown, team ranking, announcements, live activity, **Start / Create meeting** |
| **My Team** | Member cards (status, activity, attendance today, tasks, KPIs), profile drawer, message / meet now / assign task, manage teams |
| **Meetings** | Create · schedule · instant meeting, invite people, team room, agenda, duration, recording, description, secure link, **security: team only / anyone with link / password / manager approval** |
| **Meeting room** | WebRTC video grid, active speaker, screen share, mic/camera/speaker, chat, raise hand, reactions, participants, recording, layout switch, device settings |
| **Meeting workspace** (side panel) | People · Chat · Agenda · **Notes → Decisions → Action items** · Attendance (live: present / late / absent, join/leave/duration) |
| **Host controls** | Waiting-room admit/deny, lock meeting, mute participant / mute all, disable camera, lower hand, remove participant (can't rejoin) |
| **End screen & history** | Duration, attendance x/y, tasks created, decisions, notes, action items, attendance table, recording playback, chat transcript, **AI summary**, copy minutes, export PDF |
| **Team Rooms** | Persistent rooms with Chat · Meetings · Tasks · Files · Members · Announcements; private rooms; **direct messages** |
| **Chat** | Room / group / DM / automatic meeting chat, attachments, emoji reactions, replies, timestamps, online status |
| **Tasks** | Board (drag & drop) + list, priority, deadline, status; employees only see/update their own |
| **Announcements** | Publish to everyone or one team, important / pinned, everyone notified |
| **Performance** | Target vs. achievement per KPI, weighted achievement, 14-day trend, leaderboard, scorecard, "log results" for managers. **New KPIs = Settings → add row, no code** |
| **AI meeting assistant** | Summary · key decisions · action items (one-click "create task") · follow-ups. Built-in mock today; Claude via Edge Function when enabled |

Roles: **Admin** (everything) · **Manager** (meetings, team, tasks, performance, attendance, announcements) · **Team Leader** (meetings, own team, tasks, attendance, team performance) · **Sales Staff** (join, chat, own tasks & performance, rooms).

Responsive: desktop sidebar → mobile bottom navigation; meeting room and workspace adapt to phones.

---

## Connect Supabase (production)

1. Create a Supabase project.
2. SQL Editor → run, in order:
   `supabase/migrations/0001_schema.sql` → `0002_rls.sql` → `0003_functions.sql`
   (tables, Row Level Security, server functions, realtime, storage buckets)
3. `cp .env.example .env` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Optional demo data: add `SUPABASE_SERVICE_ROLE_KEY` to `.env`, then `npm run seed:supabase`
   (`npm run seed:supabase -- --dry-run` shows what would be created)
5. `npm run build` → deploy `dist/` to any static host (Vercel, Netlify, Supabase Storage, IIS…). Hash routing = no server config.

Users sign up through Supabase Auth (profile row created automatically, role `employee`); an admin promotes roles in **Settings → Users & roles**.

**Realtime:** the app uses private Realtime channels for meetings (policies are in `0003_functions.sql`). Keep "public access" enabled for the `org-presence` / `db-changes` channels, or set `VITE_REALTIME_PRIVATE=false`.

**Networks that block P2P:** add a TURN server (`VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`), e.g. coturn or a managed TURN service.

### AI assistant with Claude

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy meeting-insights
```
then set `VITE_AI_PROVIDER=edge`. The function (`supabase/functions/meeting-insights`) reads the meeting with the caller's permissions (RLS), asks Claude Opus 5.5 for schema-validated JSON, and stores it in `meeting_insights`. The API key never reaches the browser. Server-side refusal fallback is enabled (`fallbacks: "default"`).

---

## Security

- Supabase Auth + **Row Level Security on every table** (role + team + meeting/room membership)
- Employees: only their own tasks, performance and attendance; private rooms invisible to non-members
- Meeting access enforced server-side by `join_meeting()`: team-only, link (128-bit token), **bcrypt password** (stored in `meeting_secrets`, unreadable by clients), manager approval, lock, removed users blocked
- Attendance written only by server functions with server timestamps
- Meeting signaling channels restricted to admitted participants (Realtime Authorization)
- Recordings: upload by hosts, read by meeting viewers (Storage policies)

Verified locally on PostgreSQL 16: migrations, every RLS rule above, and the full demo seed.

---

## Project layout

```
src/
  data/        backend interface · demo backend (localStorage + BroadcastChannel, RLS mirror) · Supabase backend · app state
  rtc/         WebRTC mesh engine · media helpers · audio levels · recorder
  meeting/     lobby · live room · tiles · workspace panel
  pages/       dashboard, team, meetings, rooms, tasks, announcements, performance, history, settings, join, login
  components/  UI kit, forms, cards, chat, meeting report
  ai/          meeting assistant (provider interface + mock)
  lib/         types (= DB tables), permissions, KPI engine, seed data, router, utils
supabase/      migrations (schema · RLS · functions) + edge function
scripts/       seed-supabase.ts
docs/          ARCHITECTURE.md (design + roadmap)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architecture decisions and the roadmap.
