import { useMemo, useState } from 'react';
import { Pencil, Target, TrendingUp, Trophy } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { activeKpis, kpisForGroup, kpisForUser } from '../data/selectors';
import { achievementTone, formatKpi, PERIODS, type PeriodKey } from '../lib/kpi';
import { can, managedUserIds } from '../lib/permissions';
import type { KpiDefinition, Performance } from '../lib/types';
import { addDays, cls, pct, sortBy, ymd } from '../lib/utils';
import { Avatar, Progress, Seg, useAction } from '../components/ui';

/** Single-series daily bars (team actual) with a dashed target reference and per-bar hover tooltip. */
function TrendChart({ rows, kpi, userIds }: { rows: Performance[]; kpi: KpiDefinition; userIds: Set<string> }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = Array.from({ length: 14 }, (_, i) => ymd(addDays(new Date(), i - 13)));
  const data = days.map((d) => {
    const r = rows.filter((x) => x.period === d && x.kpi_key === kpi.key && userIds.has(x.user_id));
    return { d, actual: r.reduce((s, x) => s + x.actual, 0), target: r.reduce((s, x) => s + x.target, 0), off: r.length === 0 };
  });
  const max = Math.max(1, ...data.map((x) => Math.max(x.actual, x.target))) * 1.12;
  const W = 640, H = 200, padL = 32, padB = 22, padT = 8;
  const bw = (W - padL) / data.length;
  const y = (v: number) => H - padB - (v / max) * (H - padB - padT);
  const ticks = [0, Math.round(max / 2), Math.round(max)];

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${kpi.label} — last 14 days`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--faint)">{t}</text>
          </g>
        ))}
        {data.map((p, i) => {
          const x = padL + i * bw;
          const barW = Math.min(22, bw - 6);
          const h = Math.max(0, H - padB - y(p.actual));
          return (
            <g key={p.d} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              {!p.off && h > 0 && (
                <path
                  d={`M${x + (bw - barW) / 2},${H - padB} v${-(h - 4)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${h - 4} z`}
                  fill={hover === null || hover === i ? 'var(--red)' : '#f3a3a3'}
                />
              )}
              {!p.off && <line x1={x + 3} x2={x + bw - 3} y1={y(p.target)} y2={y(p.target)} stroke="var(--ink)" strokeWidth={2} strokeDasharray="3 3" opacity={0.55} />}
              {(i % 2 === 1 || data.length < 8) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--faint)">{new Date(p.d + 'T12:00').getDate()}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="card" style={{ position: 'absolute', top: 0, left: `${Math.min(78, ((padL + hover * bw) / W) * 100)}%`, padding: '8px 10px', pointerEvents: 'none', boxShadow: 'var(--shadow-md)' }}>
          <div className="xs muted strong">{new Date(data[hover]!.d + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          {data[hover]!.off ? <div className="small">Day off</div> : (
            <div className="small num"><b>{data[hover]!.actual}</b> / {data[hover]!.target} target · {pct(data[hover]!.actual, data[hover]!.target)}%</div>
          )}
        </div>
      )}
      <div className="row gap-16 xs muted mt-4">
        <span className="row gap-4"><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--red)', display: 'inline-block' }} /> Actual</span>
        <span className="row gap-4"><span style={{ width: 14, borderTop: '2px dashed var(--ink)', opacity: 0.55, display: 'inline-block' }} /> Target</span>
      </div>
    </div>
  );
}

function LogResults({ userIds }: { userIds: string[] }) {
  const { db, backend, userById } = useApp();
  const run = useAction();
  const kpis = activeKpis(db);
  const today = ymd();
  const rowFor = (uid: string, key: string) => db.performance.find((p) => p.user_id === uid && p.kpi_key === key && p.period === today);

  const save = (uid: string, k: KpiDefinition, value: number) => {
    const existing = rowFor(uid, k.key);
    if (existing?.actual === value) return;
    void run(async () => {
      if (existing) await backend.update('performance', existing.id, { actual: value });
      else await backend.insert('performance', { user_id: uid, kpi_key: k.key, period: today, target: k.daily_target, actual: value });
    });
  };

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Today · {new Date().toLocaleDateString([], { day: 'numeric', month: 'short' })}</th>{kpis.map((k) => <th key={k.key} className="r">{k.short_label}</th>)}</tr>
        </thead>
        <tbody>
          {userIds.map((uid) => (
            <tr key={uid}>
              <td><span className="row small strong"><Avatar user={userById(uid)} size="xs" /> {userById(uid)?.full_name}</span></td>
              {kpis.map((k) => (
                <td key={k.key} className="r">
                  <input
                    className="cell-edit"
                    type="number"
                    min={0}
                    defaultValue={rowFor(uid, k.key)?.actual ?? 0}
                    key={`${uid}-${k.key}-${rowFor(uid, k.key)?.actual ?? 0}`}
                    onBlur={(e) => save(uid, k, Math.max(0, Number(e.target.value) || 0))}
                    aria-label={`${k.label} for ${userById(uid)?.full_name}`}
                  />
                  <div className="faint xs">/ {rowFor(uid, k.key)?.target ?? k.daily_target}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerformancePage() {
  const { db, me } = useApp();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [scope, setScope] = useState<'team' | 'me'>(can(me, 'performance.viewTeam') ? 'team' : 'me');
  const [trendKpi, setTrendKpi] = useState('lgc');
  const [logging, setLogging] = useState(false);
  const kpis = activeKpis(db);

  const teamIds = useMemo(() => {
    const ids = managedUserIds(me, db);
    if (me.role !== 'employee') ids.delete(me.id);
    return new Set([...ids].filter((id) => db.performance.some((p) => p.user_id === id)));
  }, [me, db]);
  const ids = scope === 'team' ? teamIds : new Set([me.id]);
  const { totals, overall } = kpisForGroup(db, ids, period);
  const board = sortBy([...teamIds].map((id) => ({ id, user: db.users.find((u) => u.id === id)!, ...kpisForUser(db, id, period) })).filter((r) => r.user), (r) => r.overall, -1);
  const trend = kpis.find((k) => k.key === trendKpi) ?? kpis[0];
  const sumTarget = kpis.reduce((s, k) => s + (totals[k.key]?.target ?? 0), 0);
  const sumActual = kpis.reduce((s, k) => s + (totals[k.key]?.actual ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Performance</h1>
          <p>Targets vs. achievement for every KPI. New KPIs can be added in Settings without code changes.</p>
        </div>
        <div className="row wrap">
          {can(me, 'performance.viewTeam') && <Seg value={scope} onChange={setScope} items={[{ key: 'team', label: 'Team' }, { key: 'me', label: 'Me' }]} />}
          <Seg value={period} onChange={setPeriod} items={PERIODS} />
        </div>
      </div>

      <div className="grid g-4">
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><Trophy size={15} /></span> Achievement</span>
          <span className={cls('stat-value', achievementTone(overall) === 'good' ? 'green' : achievementTone(overall) === 'bad' ? 'red' : 'amber')}>{overall}%</span>
          <span className="stat-sub">Weighted across {kpis.length} KPIs</span>
        </div>
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><Target size={15} /></span> Target</span>
          <span className="stat-value">{sumTarget}</span>
          <span className="stat-sub">units across all KPIs</span>
        </div>
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><TrendingUp size={15} /></span> Achieved</span>
          <span className="stat-value">{sumActual}</span>
          <span className="stat-sub">{pct(sumActual, sumTarget)}% of combined target</span>
        </div>
        <div className="card stat">
          <span className="stat-label"><span className="stat-icon"><Target size={15} /></span> Conversion rate</span>
          <span className="stat-value">{pct(totals.conversions?.actual ?? 0, totals.leads?.actual ?? 0)}%</span>
          <span className="stat-sub">conversions ÷ leads</span>
        </div>
      </div>

      <div className="grid mt-16" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {kpis.map((k) => {
          const t = totals[k.key]!;
          return (
            <button key={k.key} className={cls('card stat card-link', trendKpi === k.key && 'card-accent')} style={{ textAlign: 'left', font: 'inherit' }} onClick={() => setTrendKpi(k.key)}>
              <span className="stat-label">{k.label}</span>
              <span className="stat-value">{formatKpi(k, t)}</span>
              <Progress value={t.achievement} tone={achievementTone(t.achievement)} />
              <span className="stat-sub num">{t.actual} / {t.target} {k.unit} · {t.achievement}%</span>
            </button>
          );
        })}
      </div>

      <div className="grid g-3 mt-16">
        <div className="card span-2">
          <div className="card-head">
            <h3>{trend?.label} — daily, last 14 days</h3>
            <select className="select input-sm" style={{ width: 'auto' }} value={trendKpi} onChange={(e) => setTrendKpi(e.target.value)}>
              {kpis.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          <div className="card-body">{trend && <TrendChart rows={db.performance} kpi={trend} userIds={ids} />}</div>
        </div>
        <div className="card">
          <div className="card-head"><h3><Trophy size={17} className="red" /> Leaderboard</h3></div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            <div className="list">
              {board.slice(0, 8).map((r, i) => (
                <div key={r.id} className="list-item">
                  <span className={cls('strong num small', i < 3 && 'red')} style={{ width: 18 }}>{i + 1}</span>
                  <Avatar user={r.user} size="sm" />
                  <span className="grow small strong truncate">{r.user.full_name}</span>
                  <span className={cls('strong num', achievementTone(r.overall) === 'good' ? 'green' : achievementTone(r.overall) === 'bad' ? 'red' : 'amber')}>{r.overall}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {board.length > 0 && (
        <div className="card mt-16">
          <div className="card-head">
            <h3>{logging ? 'Log today’s results' : 'Team scorecard'}</h3>
            {can(me, 'performance.edit') && (
              <button className={cls('btn btn-sm', logging ? 'btn-dark' : 'btn-outline')} onClick={() => setLogging((l) => !l)}><Pencil size={14} /> {logging ? 'Done' : 'Log results'}</button>
            )}
          </div>
          <div className="card-body">
            {logging ? <LogResults userIds={board.map((r) => r.id)} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Member</th>{kpis.map((k) => <th key={k.key} className="r">{k.short_label}</th>)}<th className="r">Overall</th></tr>
                  </thead>
                  <tbody>
                    {board.map((r) => (
                      <tr key={r.id}>
                        <td><span className="row small strong"><Avatar user={r.user} size="xs" /> {r.user.full_name}</span></td>
                        {kpis.map((k) => {
                          const t = r.totals[k.key]!;
                          return (
                            <td key={k.key} className="r num">
                              <div className="strong">{formatKpi(k, t)}</div>
                              <div className={cls('xs', achievementTone(t.achievement) === 'bad' ? 'red' : 'faint')}>{k.display === 'percent' ? `${t.actual}/${t.target}` : `${t.achievement}%`}</div>
                            </td>
                          );
                        })}
                        <td className="r"><span className={cls('badge', achievementTone(r.overall) === 'good' ? 'tone-green' : achievementTone(r.overall) === 'bad' ? 'tone-red' : 'tone-amber')}>{r.overall}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
