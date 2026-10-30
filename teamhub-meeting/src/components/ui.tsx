import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { Priority, TaskStatus, User, UserStatus } from '../lib/types';
import { cls, initials } from '../lib/utils';
import { useApp } from '../data/AppContext';

export const STATUS_LABEL: Record<UserStatus, string> = {
  online: 'Online', away: 'Away', busy: 'Busy', in_meeting: 'In a meeting', offline: 'Offline',
};
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To Do', in_progress: 'In Progress', completed: 'Completed' };
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const PRIORITY_TONE: Record<Priority, string> = { low: 'tone-gray', medium: 'tone-blue', high: 'tone-amber', urgent: 'tone-red' };

export function StatusDot({ status }: { status: UserStatus }) {
  return <span className={cls('sdot', `s-${status}`)} title={STATUS_LABEL[status]} />;
}

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export function Avatar({ user, size = 'md', status }: { user: Pick<User, 'full_name' | 'avatar_color' | 'avatar_url'> | undefined; size?: Size; status?: UserStatus }) {
  if (!user) return <div className={cls('avatar', size !== 'md' && size)} style={{ background: '#c4c7cd' }}>?</div>;
  return (
    <div className={cls('avatar', size !== 'md' && size)} style={{ background: user.avatar_color }} title={user.full_name}>
      {user.avatar_url ? <img src={user.avatar_url} alt="" /> : initials(user.full_name)}
      {status && <StatusDot status={status} />}
    </div>
  );
}

/** Avatar bound to live presence. */
export function UserAvatar({ id, size, showStatus = true }: { id: string | null | undefined; size?: Size; showStatus?: boolean }) {
  const { userById, statusOf } = useApp();
  const u = userById(id);
  return <Avatar user={u} size={size} status={showStatus && u ? statusOf(u.id) : undefined} />;
}

export function AvatarStack({ ids, max = 5, size = 'sm' }: { ids: string[]; max?: number; size?: Size }) {
  const { userById } = useApp();
  return (
    <div className="avatar-stack">
      {ids.slice(0, max).map((id) => <Avatar key={id} user={userById(id)} size={size} />)}
      {ids.length > max && <div className={cls('avatar avatar-more', size)}>+{ids.length - max}</div>}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls('modal', wide && 'wide')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted small mt-4">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">{children}</aside>
    </div>
  );
}

/** Dropdown menu with outside-click close. */
export function Menu({ trigger, children, align = 'right', direction = 'down', dark }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; direction?: 'up' | 'down'; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div className={cls('menu', align === 'right' && 'right', direction, dark && 'dark-menu')}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: ReactNode; count?: number; icon?: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.key} role="tab" className={cls('tab', value === it.key && 'active')} onClick={() => onChange(it.key)}>
          {it.icon}
          {it.label}
          {it.count !== undefined && it.count > 0 && <span className="count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: ReactNode }[] }) {
  return (
    <div className="seg">
      {items.map((it) => (
        <button key={it.key} className={cls(value === it.key && 'active')} onClick={() => onChange(it.key)}>{it.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={cls('toggle', on && 'on')} onClick={() => onChange(!on)} />;
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function Progress({ value, tone, marker }: { value: number; tone?: 'good' | 'warn' | 'bad'; marker?: number }) {
  return (
    <div className={cls('progress', tone)}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      {marker !== undefined && <i className="marker" style={{ left: `${Math.min(100, marker)}%` }} />}
    </div>
  );
}

// ── toasts ────────────────────────────────────────────────────────────────
type ToastKind = 'info' | 'success' | 'error';
interface ToastItem { id: number; text: string; kind: ToastKind }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), kind === 'error' ? 5200 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cls('toast', t.kind)}>
            {t.kind === 'error' ? <AlertCircle size={16} /> : t.kind === 'success' ? <CheckCircle2 size={16} /> : null}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Wraps an async action with error toasts. */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (success) toast(success, 'success');
        return r;
      } catch (e) {
        toast((e as Error).message || 'Something went wrong', 'error');
        return undefined;
      }
    },
    [toast],
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cls('field', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
