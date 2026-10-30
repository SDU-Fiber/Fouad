import { useState } from 'react';
import { Database, KeyRound, Plus, RotateCcw, Shield, Target, User as UserIcon, Zap } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { activeKpis } from '../data/selectors';
import { can, ROLE_LABEL } from '../lib/permissions';
import type { KpiDefinition, Role } from '../lib/types';
import { cls } from '../lib/utils';
import { Avatar, Field, Toggle, useAction } from '../components/ui';

const COLORS = ['#E60000', '#B45309', '#7C3AED', '#0891B2', '#059669', '#2563EB', '#DB2777', '#3F3F46', '#EA580C', '#0F766E'];

function Profile() {
  const { me, backend } = useApp();
  const run = useAction();
  const [name, setName] = useState(me.full_name);
  const [title, setTitle] = useState(me.title);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [color, setColor] = useState(me.avatar_color);
  return (
    <div className="card card-pad col gap-16">
      <h3 className="row"><UserIcon size={17} className="red" /> Profile</h3>
      <div className="row gap-16">
        <Avatar user={{ full_name: name, avatar_color: color, avatar_url: me.avatar_url }} size="xl" />
        <div className="row wrap gap-4">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: 7, background: c, border: color === c ? '3px solid var(--ink)' : 0 }} aria-label={c} />)}</div>
      </div>
      <div className="form-grid">
        <Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Job title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email" hint="Managed by your administrator"><input className="input" value={me.email} disabled /></Field>
      </div>
      <div className="row between">
        <span className="badge tone-red">{ROLE_LABEL[me.role]}</span>
        <button className="btn btn-primary" onClick={() => run(() => backend.update('users', me.id, { full_name: name.trim(), title: title.trim(), phone: phone.trim() || null, avatar_color: color }), 'Profile saved')}>Save profile</button>
      </div>
    </div>
  );
}

function UsersAdmin() {
  const { db, me, backend } = useApp();
  const run = useAction();
  return (
    <div className="card card-pad col gap-12">
      <h3 className="row"><Shield size={17} className="red" /> Users & roles</h3>
      <p className="small muted">Roles drive what each person can see and do — enforced by Row Level Security in the database. New users sign up through Supabase Auth; a profile is created automatically.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {db.users.map((u) => (
              <tr key={u.id}>
                <td><span className="row small strong"><Avatar user={u} size="xs" /> {u.full_name}</span></td>
                <td className="small muted">{u.email}</td>
                <td>
                  <select className="select input-sm" style={{ width: 150 }} value={u.role} disabled={u.id === me.id} onChange={(e) => run(() => backend.update('users', u.id, { role: e.target.value as Role }), 'Role updated')}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiAdmin() {
  const { db, backend } = useApp();
  const run = useAction();
  const [draft, setDraft] = useState<Partial<KpiDefinition>>({ display: 'count', weight: 1, daily_target: 5, color: '#2563EB' });
  const all = [...db.kpi_definitions].sort((a, b) => a.sort_order - b.sort_order);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = (draft.key || draft.label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    if (!key || !draft.label) return;
    const ok = await run(() => backend.insert('kpi_definitions', { key, label: draft.label!, short_label: draft.short_label || draft.label!.slice(0, 8), unit: draft.unit || 'units', display: draft.display!, color: draft.color!, weight: Number(draft.weight) || 1, daily_target: Number(draft.daily_target) || 1, sort_order: all.length + 1, active: true }), 'KPI added — it now appears on every performance view');
    if (ok) setDraft({ display: 'count', weight: 1, daily_target: 5, color: '#2563EB' });
  };
  return (
    <div className="card card-pad col gap-12">
      <h3 className="row"><Target size={17} className="red" /> KPI definitions</h3>
      <p className="small muted">KPIs are data, not code. Add a KPI here and it appears on dashboards, member cards, the performance page and the scorecard instantly.</p>
      <div className="list">
        {all.map((k) => (
          <div key={k.key} className="list-item">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: k.color }} />
            <div className="grow"><div className="small strong">{k.label} <span className="faint">({k.key})</span></div><div className="xs muted">{k.display === 'percent' ? 'Achievement %' : 'Count'} · daily target {k.daily_target} {k.unit} · weight {k.weight}</div></div>
            <Toggle on={k.active} onChange={(v) => run(() => backend.update('kpi_definitions', k.key, { active: v }))} label="Active" />
          </div>
        ))}
      </div>
      <form className="form-grid" onSubmit={add}>
        <Field label="New KPI name"><input className="input" placeholder="e.g. Postpaid Activations" value={draft.label ?? ''} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></Field>
        <Field label="Short label"><input className="input" placeholder="Postpaid" value={draft.short_label ?? ''} onChange={(e) => setDraft({ ...draft, short_label: e.target.value })} /></Field>
        <Field label="Unit"><input className="input" placeholder="lines" value={draft.unit ?? ''} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></Field>
        <Field label="Display">
          <select className="select" value={draft.display} onChange={(e) => setDraft({ ...draft, display: e.target.value as KpiDefinition['display'] })}>
            <option value="count">Count</option>
            <option value="percent">Achievement %</option>
          </select>
        </Field>
        <Field label="Daily target per rep"><input className="input" type="number" min={0} value={draft.daily_target ?? ''} onChange={(e) => setDraft({ ...draft, daily_target: Number(e.target.value) })} /></Field>
        <Field label="Weight in overall score"><input className="input" type="number" min={0} value={draft.weight ?? ''} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })} /></Field>
        <div className="full row between">
          <div className="row wrap gap-4">{COLORS.map((c) => <button type="button" key={c} onClick={() => setDraft({ ...draft, color: c })} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: draft.color === c ? '3px solid var(--ink)' : 0 }} aria-label={c} />)}</div>
          <button className="btn btn-primary" disabled={!draft.label}><Plus size={16} /> Add KPI</button>
        </div>
      </form>
    </div>
  );
}

export function SettingsPage() {
  const { me, backend, db } = useApp();
  const run = useAction();
  const kpis = activeKpis(db).length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Profile, workspace and administration.</p>
        </div>
      </div>
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <div className="col gap-16">
          <Profile />
          <div className="card card-pad col gap-12">
            <h3 className="row"><Database size={17} className="red" /> Workspace</h3>
            <div className="list">
              <div className="list-item small"><span className="grow">Data backend</span><span className={cls('badge', backend.mode === 'demo' ? 'tone-amber' : 'tone-green')}>{backend.mode === 'demo' ? 'Demo (this browser)' : 'Supabase'}</span></div>
              <div className="list-item small"><span className="grow">Video engine</span><span className="badge">WebRTC mesh (P2P)</span></div>
              <div className="list-item small"><span className="grow">Security</span><span className="badge tone-green"><KeyRound size={11} /> Role-based · RLS</span></div>
              <div className="list-item small"><span className="grow">AI meeting assistant</span><span className="badge tone-purple">{(import.meta.env.VITE_AI_PROVIDER ?? 'mock') === 'edge' ? 'Edge function' : 'Built-in (mock)'}</span></div>
              <div className="list-item small"><span className="grow">Active KPIs</span><span className="badge">{kpis}</span></div>
            </div>
            {backend.mode === 'demo' && (
              <>
                <p className="small muted"><Zap size={13} /> Demo mode keeps data in this browser and syncs live between tabs. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to switch to Supabase (see README).</p>
                <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => confirm('Reset all demo data to the original sample?') && run(async () => { await backend.resetDemo?.(); location.reload(); })}><RotateCcw size={15} /> Reset demo data</button>
              </>
            )}
          </div>
        </div>
        <div className="col gap-16">
          {can(me, 'admin.users') && <UsersAdmin />}
          {can(me, 'admin.kpis') && <KpiAdmin />}
          {!can(me, 'admin.users') && (
            <div className="card card-pad col gap-8">
              <h3 className="row"><Shield size={17} className="red" /> Your access</h3>
              <p className="small muted">You are signed in as <b>{ROLE_LABEL[me.role]}</b>. User roles and KPI definitions are managed by an admin.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
