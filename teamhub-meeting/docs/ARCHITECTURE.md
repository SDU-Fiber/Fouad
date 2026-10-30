# TeamHub Meeting — Architecture

## 1. Overview

```
┌──────────────────────────── Browser (React SPA, hash routing) ────────────────────────────┐
│ pages / meeting room / components                                                          │
│        │ useApp() snapshot + realtime            │ MeshEngine (WebRTC)                      │
│        ▼                                          ▼                                         │
│  Backend interface  ── LocalBackend (demo)    RealtimeChannel (signaling, presence, events) │
│                     └─ SupabaseBackend         ▲                                            │
└────────────────────────────┬───────────────────┼────────────────────────────────────────────┘
                             │ REST / RPC         │ Realtime (broadcast + presence + postgres changes)
                     ┌───────▼────────────────────┴──────┐        ┌─────────────────────────┐
                     │ Supabase: Auth · Postgres (RLS)   │        │ Edge Function            │
                     │ Realtime · Storage                │◄──────►│ meeting-insights → Claude│
                     └───────────────────────────────────┘        └─────────────────────────┘
          Media (audio/video/screen) flows peer-to-peer between browsers (STUN/TURN), never through our servers.
```

## 2. Key decisions

| Decision | Why |
|---|---|
| **One `Backend` interface, two implementations** | Demo mode works with zero setup (product can be tested immediately); production uses Supabase. Pages never know which one is active. |
| **Demo mode mirrors RLS** (`src/data/local/policies.ts`) | An employee in the demo sees exactly what they'd see in production. |
| **Demo realtime via BroadcastChannel + Web Locks** | Two tabs behave like two devices (chat, signaling, waiting room); cross-tab writes are serialized so no update is lost. |
| **WebRTC mesh, not a proprietary media server** | Spec: no proprietary streaming infra for the MVP. Mesh is ideal for team meetings up to ~8–10 people. The engine's public API (`setMic`, `setCam`, `startScreenShare`, `broadcast`, `onPeers`) is the seam for swapping in an SFU (LiveKit / Jitsi Videobridge / mediasoup) for larger rooms. |
| **Senders never renegotiate** | Each connection always carries one audio + one video sender; mic/camera/screen changes use `replaceTrack()`. Only the peer with the smaller id makes offers → no glare. |
| **Signaling over Supabase Realtime** | No extra signaling server. Private channels (`meeting:<id>`) are authorized by RLS on `realtime.messages`. |
| **Server-side meeting rules** | `join_meeting()`, `record_attendance()`, `start_meeting()`, `end_meeting()` are `SECURITY DEFINER` RPCs: access, lock, password, approval and attendance timestamps can't be faked by the client. |
| **KPIs as rows** (`kpi_definitions` + long-format `performance`) | New KPIs need no migration and no UI change. Weighted overall achievement is computed from definitions. |
| **Notes are entries, not a shared text blob** | Conflict-free real-time collaboration, and each note can be promoted to a *decision* or converted to an *action item* in one click — the core "Decide → Assign" loop. |
| **AI behind a provider interface** | `mock` (deterministic, offline) today; `edge` (Claude via Edge Function) by env flag. A transcription provider can feed the same context later. |
| **Hash router, static build** | Deploys to any static host; meeting links are plain URLs (`#/join/<token>`). |

## 3. Data model

`users · teams · team_members · meetings · meeting_secrets · meeting_participants · meeting_notes · meeting_tasks · meeting_insights · tasks · team_rooms · room_members · messages · announcements · attendance · kpi_definitions · performance · notifications`

- `messages` has exactly one target: `room_id` (room/group), `meeting_id` (automatic meeting chat) or `recipient_id` (DM).
- `meeting_participants.admission`: `invited → pending → admitted | denied | removed`.
- `attendance`: one row per (meeting, user); `session_started_at` while connected, heartbeats every 30 s, `end_meeting()` closes sessions and marks no-shows absent. Late = joined > 5 min after the later of scheduled/actual start.
- TypeScript types in `src/lib/types.ts` match the SQL 1:1.

## 4. Access model (RLS summary)

| Data | Employee | Team Leader | Manager | Admin |
|---|---|---|---|---|
| Directory (users, teams) | read | read | read · manage own teams | all |
| Meetings | invited / own team | + create, host | + teams they manage | all |
| Tasks | own (status only) | + their team, create | + their teams | all |
| Performance | own | team | team · edit | all |
| Attendance | own | meetings they see | meetings they see | all |
| Announcements | read | read | publish | all |
| Private rooms | members only | members only | members only | all |

## 5. Roadmap hooks

| Roadmap item | Where it plugs in |
|---|---|
| AI summaries / action-item extraction | `src/ai/assistant.ts` provider + `meeting_insights` (Edge Function already included) |
| Transcription | Add `transcript` to `MeetingContext`; store in a `meeting_transcripts` table; feed recorder audio to a speech-to-text provider |
| Recording (cloud) | Recorder already uploads to Storage `recordings/<meeting>/…`; server-side recording arrives with an SFU |
| Breakout rooms | Child meetings (`parent_meeting_id`) + per-room channels — the engine already isolates by channel |
| Whiteboard / polls | New `EngineMessage` types over the meeting channel + tables for persistence |
| File storage | `attachments` bucket in place; add a `files` table for metadata/search |
| Calendar / email / push | DB triggers already create `notifications`; add an Edge Function consumer (ICS, email, Web Push) |
| Mobile apps | Same Supabase backend; the RTC engine API maps to React Native WebRTC |
| Multiple companies / departments | Add `organization_id` to `teams` (+ users) and one extra condition in the RLS helper functions |
| External customer meetings | `access = 'link'` + guest auth (Supabase anonymous sign-in) + `participant.role = 'guest'` |
| Analytics, CRM, Salesforce, MS Teams, Google Calendar | Edge Functions writing to `performance` / `meetings`; KPIs are already data-driven |
| Larger meetings | Replace `MeshEngine` with an SFU-backed engine exposing the same API |
