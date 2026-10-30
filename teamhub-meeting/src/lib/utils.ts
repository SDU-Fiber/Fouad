export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** 128-bit URL-safe random token used for secure meeting links. */
export const randomToken = (bytes = 16): string => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const nowIso = () => new Date().toISOString();

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export const ymd = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (d: Date, days: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
};

export const startOfDay = (d: Date = new Date()) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

export const isSameDay = (a: Date | string, b: Date | string = new Date()) => ymd(new Date(a)) === ymd(new Date(b));

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  iso ? new Date(iso).toLocaleDateString([], opts) : '—';

export function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (isSameDay(d)) return 'Today';
  if (isSameDay(d, addDays(new Date(), 1))) return 'Tomorrow';
  if (isSameDay(d, addDays(new Date(), -1))) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtDue(date: string | null): string {
  if (!date) return 'No deadline';
  const d = new Date(date + 'T12:00:00');
  const diff = Math.round((startOfDay(d).getTime() - startOfDay().getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff}d overdue`;
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const isOverdue = (date: string | null) => !!date && date < ymd();

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${pad(m)}m`;
  if (m) return `${m} min`;
  return `${s}s`;
}

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(iso);
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const firstName = (name: string) => name.split(' ')[0] ?? name;

export const pct = (actual: number, target: number) => (target > 0 ? Math.round((actual / target) * 100) : 0);

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  return items.reduce((acc, it) => {
    (acc[key(it)] ||= []).push(it);
    return acc;
  }, {} as Record<K, T[]>);
}

export const sortBy = <T,>(items: T[], key: (t: T) => string | number, dir: 1 | -1 = 1) =>
  [...items].sort((a, b) => (key(a) > key(b) ? dir : key(a) < key(b) ? -dir : 0));

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Absolute URL for an in-app hash route (works for any hosting sub-path). */
export const appUrl = (hash: string) => `${location.origin}${location.pathname}#${hash.startsWith('/') ? hash : '/' + hash}`;
