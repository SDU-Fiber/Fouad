// Seeds a Supabase project with the same realistic demo data the demo mode uses.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed:supabase
//   npm run seed:supabase -- --dry-run      (prints counts, touches nothing)
//
// Creates one auth user per demo person (password: demo1234), then upserts every table.
// Uses the service role key, which bypasses RLS — run it from your machine, never ship the key.
import { createClient } from '@supabase/supabase-js';
import { buildSeed, DEMO_PASSWORD, PEOPLE } from '../src/lib/seed.ts';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

const seed = buildSeed();

// Order matters (foreign keys). Columns that only exist in demo mode are stripped.
const TABLES = [
  'users', 'teams', 'team_members', 'team_rooms', 'room_members', 'kpi_definitions', 'meetings', 'meeting_participants',
  'tasks', 'meeting_tasks', 'meeting_notes', 'meeting_insights', 'messages', 'announcements', 'attendance', 'performance',
  'notifications',
] as const;

if (dryRun) {
  for (const t of TABLES) console.log(`${t.padEnd(22)} ${(seed as Record<string, unknown[]>)[t]!.length} rows`);
  console.log(`\n${PEOPLE.length} auth users would be created (password: ${DEMO_PASSWORD})`);
  process.exit(0);
}

if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// 1) Auth users → map seed ids to real auth ids
const existing = new Map<string, string>();
for (let page = 1; ; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  data.users.forEach((u) => u.email && existing.set(u.email.toLowerCase(), u.id));
  if (data.users.length < 200) break;
}

const idMap = new Map<string, string>();
for (const person of PEOPLE) {
  const seedUser = seed.users.find((u) => u.email === person.email)!;
  let authId = existing.get(person.email);
  if (!authId) {
    const { data, error } = await sb.auth.admin.createUser({
      email: person.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: person.full_name },
    });
    if (error) throw error;
    authId = data.user.id;
    console.log(`created ${person.email}`);
  }
  idMap.set(seedUser.id, authId);
}

// 2) Rewrite every reference to a seed user id
let text = JSON.stringify(seed);
idMap.forEach((real, fake) => (text = text.split(fake).join(real)));
const data = JSON.parse(text) as Record<string, Record<string, unknown>[]>;
data.meetings!.forEach((m) => delete m.password_hash);

// 3) Upsert tables in dependency order (profiles already exist via the on_auth_user_created trigger)
for (const table of TABLES) {
  const rows = data[table]!;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from(table).upsert(chunk, { onConflict: table === 'kpi_definitions' ? 'key' : 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`${table.padEnd(22)} ${rows.length} rows`);
}

console.log(`\nDone. Sign in with any demo email (e.g. manager@teamhub.demo) and password "${DEMO_PASSWORD}".`);
