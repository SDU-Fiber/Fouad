import type { KpiDefinition, Performance } from './types';
import { addDays, pct, startOfDay, ymd } from './utils';

// KPIs are data, not code: rows in kpi_definitions drive every performance view.
// Adding a KPI = inserting a definition row (Settings → KPIs). No schema or UI change needed.

export type PeriodKey = 'today' | 'week' | 'month';

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'Month to date' },
];

export function periodRange(key: PeriodKey): { from: string; to: string } {
  const today = startOfDay();
  if (key === 'today') return { from: ymd(today), to: ymd(today) };
  if (key === 'week') {
    // Sales week starts Sunday (Gulf working week)
    return { from: ymd(addDays(today, -today.getDay())), to: ymd(today) };
  }
  return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
}

export interface KpiTotal {
  key: string;
  target: number;
  actual: number;
  achievement: number; // %
}

export function aggregate(rows: Performance[], kpis: KpiDefinition[], period: PeriodKey, userIds?: Set<string>) {
  const { from, to } = periodRange(period);
  const totals: Record<string, KpiTotal> = {};
  kpis.forEach((k) => (totals[k.key] = { key: k.key, target: 0, actual: 0, achievement: 0 }));
  for (const r of rows) {
    if (r.period < from || r.period > to) continue;
    if (userIds && !userIds.has(r.user_id)) continue;
    const t = totals[r.kpi_key];
    if (!t) continue;
    t.target += r.target;
    t.actual += r.actual;
  }
  Object.values(totals).forEach((t) => (t.achievement = pct(t.actual, t.target)));
  return totals;
}

/** Weighted overall achievement across active KPIs (the "Achievement" headline metric). */
export function overallAchievement(totals: Record<string, KpiTotal>, kpis: KpiDefinition[]) {
  let w = 0;
  let sum = 0;
  kpis.forEach((k) => {
    const t = totals[k.key];
    if (!t || t.target <= 0) return;
    w += k.weight;
    sum += Math.min(t.achievement, 200) * k.weight;
  });
  return w ? Math.round(sum / w) : 0;
}

export const formatKpi = (k: KpiDefinition, t: KpiTotal | undefined) =>
  !t ? '—' : k.display === 'percent' ? `${t.achievement}%` : `${t.actual}`;

export const achievementTone = (p: number) => (p >= 100 ? 'good' : p >= 70 ? 'warn' : 'bad');
