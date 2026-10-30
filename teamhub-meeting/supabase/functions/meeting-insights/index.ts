// Supabase Edge Function: AI meeting intelligence with Claude.
//
//   POST /functions/v1/meeting-insights   { "meeting_id": "<uuid>" }
//
// Reads the meeting (notes, decisions, chat, tasks, attendance) with the CALLER's JWT, so Row Level
// Security decides what the model may see, asks Claude for a summary / decisions / action items /
// follow-ups as schema-validated JSON, and upserts the result into meeting_insights.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy meeting-insights
// Then set VITE_AI_PROVIDER=edge in the web app.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Structured output schema — the response is guaranteed to match it.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "decisions", "action_items", "follow_ups"],
  properties: {
    summary: { type: "string", description: "3-5 sentence summary of the meeting" },
    decisions: { type: "array", items: { type: "string" } },
    action_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "assignee_id", "priority", "due_date", "source"],
        properties: {
          title: { type: "string" },
          assignee_id: { type: "string", description: "A participant id from the input, or empty string if unclear" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          due_date: { type: "string", description: "YYYY-MM-DD, or empty string if no deadline was mentioned" },
          source: { type: "string", enum: ["task", "note", "chat"] },
        },
      },
    },
    follow_ups: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `You are the meeting assistant of a telecom sales team (KPIs such as LGC, iPay applications and Fiber leads).
You receive the record of one meeting as JSON. Produce:
- summary: what was discussed and achieved, attendance highlights, who owns what. Plain, factual, no filler.
- decisions: every decision that was taken (explicit decision notes first, then clear decisions found in notes or chat).
- action_items: every task already assigned (source "task", copy it as-is) plus concrete follow-up actions implied by notes or chat that nobody owns yet (source "note"/"chat"); assign them to the participant who was mentioned or who raised the point, using the ids from "participants".
- follow_ups: things the manager should check after the meeting (absent people to brief, agenda items not closed, actions without owner or deadline, KPI risks mentioned).
Only use information present in the record. Today is ${new Date().toISOString().slice(0, 10)}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Missing authorization" }, 401);
  const { meeting_id } = await req.json().catch(() => ({}));
  if (!meeting_id) return json({ error: "meeting_id is required" }, 400);

  // Caller-scoped client: every read below is filtered by RLS.
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: meeting } = await sb.from("meetings").select("*").eq("id", meeting_id).maybeSingle();
  if (!meeting) return json({ error: "Meeting not found" }, 404);

  const [participants, notes, chat, links, attendance] = await Promise.all([
    sb.from("meeting_participants").select("user_id, role, users(full_name, title)").eq("meeting_id", meeting_id),
    sb.from("meeting_notes").select("kind, content, author_id, created_at").eq("meeting_id", meeting_id).order("created_at"),
    sb.from("messages").select("sender_id, body, created_at").eq("meeting_id", meeting_id).order("created_at").limit(300),
    sb.from("meeting_tasks").select("tasks(title, assignee_id, priority, due_date, status)").eq("meeting_id", meeting_id),
    sb.from("attendance").select("user_id, status, joined_at, left_at, total_seconds").eq("meeting_id", meeting_id),
  ]);

  const record = {
    meeting: {
      title: meeting.title, description: meeting.description, agenda: meeting.agenda,
      scheduled_at: meeting.scheduled_at, started_at: meeting.started_at, ended_at: meeting.ended_at,
    },
    participants: (participants.data ?? []).map((p: Record<string, any>) => ({ id: p.user_id, name: p.users?.full_name, title: p.users?.title, role: p.role })),
    attendance: attendance.data ?? [],
    notes: notes.data ?? [],
    chat: chat.data ?? [],
    tasks: (links.data ?? []).map((l: Record<string, any>) => l.tasks).filter(Boolean),
  };

  const params = {
    model: MODEL,
    max_tokens: 16000,
    // Server-side fallback: if a safety classifier declines, the API re-runs the request on
    // Anthropic's recommended fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `Meeting record:\n${JSON.stringify(record)}` }],
  };

  let insights: Record<string, unknown>;
  try {
    const response = await anthropic.beta.messages.create(params as unknown as Parameters<typeof anthropic.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;
    if (response.stop_reason === "refusal") return json({ error: "The AI assistant declined this request" }, 422);
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    if (!text) return json({ error: "Empty AI response" }, 502);
    const parsed = JSON.parse(text);
    insights = {
      summary: parsed.summary,
      decisions: parsed.decisions,
      follow_ups: parsed.follow_ups,
      action_items: parsed.action_items.map((a: Record<string, string>) => ({
        ...a,
        assignee_id: a.assignee_id || null,
        due_date: a.due_date || null,
      })),
    };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "AI is busy — try again in a minute" }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `AI error ${e.status}: ${e.message}` }, 502);
    throw e;
  }

  // Stored with the caller's permissions (RLS: leaders who can see the meeting).
  const row = { meeting_id, status: "ready", provider: `claude:${MODEL}`, ...insights };
  const { error } = await sb.from("meeting_insights").upsert(row, { onConflict: "meeting_id" });
  if (error) return json({ error: error.message }, 403);
  return json(insights);
});
