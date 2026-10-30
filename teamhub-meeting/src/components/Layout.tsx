import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell, CheckSquare, History, LayoutDashboard, LogOut, Megaphone, MessagesSquare, MoreHorizontal, Settings,
  TrendingUp, Users, Video, Zap,
} from 'lucide-react';
import { useApp } from '../data/AppContext';
import { navigate } from '../lib/router';
import { ROLE_LABEL, can } from '../lib/permissions';
import type { UserStatus } from '../lib/types';
import { cls, firstName, timeAgo } from '../lib/utils';
import { Avatar, Menu, STATUS_LABEL, StatusDot, useAction } from './ui';
import { useMeetingActions } from './meetingActions';

export const BrandMark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h8A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 16.5z" fill="currentColor" />
    <path d="M17 10.2 21 7.5v9l-4-2.7z" fill="currentColor" opacity=".85" />
    <path d="m6.5 12.2 2 2 4-4.2" stroke="#E60000" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><BrandMark /></div>
      <div>
        <div className="brand-name">TeamHub <span>Meeting</span></div>
        <div className="brand-tag">Built for sales teams</div>
      </div>
    </div>
  );
}

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'team', label: 'My Team', icon: Users },
  { key: 'meetings', label: 'Meetings', icon: Video },
  { key: 'rooms', label: 'Team Rooms', icon: MessagesSquare },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'performance', label: 'Performance', icon: TrendingUp },
  { key: 'history', label: 'Meeting History', icon: History },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const;

const MOBILE_PRIMARY = ['dashboard', 'meetings', 'rooms', 'tasks'] as const;

function NotificationsBell() {
  const { db, backend } = useApp();
  const run = useAction();
  const items = [...db.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
  const unread = items.filter((n) => !n.read);
  const markAll = () => run(async () => Promise.all(unread.map((n) => backend.update('notifications', n.id, { read: true }))));
  return (
    <Menu
      trigger={(_, toggle) => (
        <button className="icon-btn" onClick={toggle} aria-label="Notifications">
          <Bell size={19} />
          {unread.length > 0 && <span className="dot-count">{unread.length > 9 ? '9+' : unread.length}</span>}
        </button>
      )}
    >
      {(close) => (
        <div style={{ width: 'min(360px, 86vw)' }}>
          <div className="row between" style={{ padding: '6px 8px 8px' }}>
            <h3>Notifications</h3>
            {unread.length > 0 && <button className="btn btn-ghost btn-xs" onClick={markAll}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.length === 0 && <p className="muted small" style={{ padding: 12 }}>You're all caught up.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                className="menu-item"
                style={{ alignItems: 'flex-start', background: n.read ? undefined : 'var(--red-50)', marginBottom: 2 }}
                onClick={() => {
                  close();
                  if (!n.read) void backend.update('notifications', n.id, { read: true });
                  if (n.link) navigate(n.link);
                }}
              >
                <span className={cls('sdot', n.read ? 's-offline' : 's-busy')} style={{ marginTop: 5, border: 0 }} />
                <span className="grow">
                  <span className="strong" style={{ display: 'block' }}>{n.title}</span>
                  <span className="muted small" style={{ display: 'block' }}>{n.body}</span>
                  <span className="faint xs">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}

const STATUS_CHOICES: UserStatus[] = ['online', 'busy', 'away'];

function StatusMenu() {
  const { me, statusOf, setMyStatus, signOut, backend } = useApp();
  const run = useAction();
  const [activity, setActivity] = useState(me.activity);
  useEffect(() => setActivity(me.activity), [me.activity]);
  const status = statusOf(me.id);
  return (
    <Menu
      trigger={(_, toggle) => (
        <button className="icon-btn" style={{ width: 'auto', padding: '0 4px', gap: 8, display: 'flex' }} onClick={toggle} aria-label="Account">
          <Avatar user={me} size="sm" status={status} />
        </button>
      )}
    >
      {(close) => (
        <div style={{ width: 280 }}>
          <div className="row" style={{ padding: '8px 10px' }}>
            <Avatar user={me} size="lg" status={status} />
            <div className="grow">
              <div className="strong truncate">{me.full_name}</div>
              <div className="muted small">{ROLE_LABEL[me.role]} · {me.title}</div>
            </div>
          </div>
          <div className="menu-label">Status</div>
          {STATUS_CHOICES.map((s) => (
            <button key={s} className="menu-item" onClick={() => run(() => setMyStatus(s))}>
              <StatusDot status={s} /> {STATUS_LABEL[s]} {me.status === s && <span className="red" style={{ marginLeft: 'auto' }}>●</span>}
            </button>
          ))}
          <form
            style={{ padding: '6px 8px' }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => setMyStatus(me.status, activity.trim()), 'Activity updated');
            }}
          >
            <input className="input input-sm" placeholder="What are you working on?" value={activity} onChange={(e) => setActivity(e.target.value)} />
          </form>
          <div className="sep" style={{ margin: '6px 0' }} />
          <button className="menu-item" onClick={() => { close(); navigate('/settings'); }}><Settings size={16} /> Settings</button>
          <button className="menu-item danger" onClick={() => run(signOut)}><LogOut size={16} /> Sign out{backend.mode === 'demo' ? ' / switch user' : ''}</button>
        </div>
      )}
    </Menu>
  );
}

export function Layout({ section, children }: { section: string; children: ReactNode }) {
  const { me, db, backend, statusOf } = useApp();
  const { startInstant } = useMeetingActions();
  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    setMoreOpen(false);
  }, [section]);

  const openTasks = db.tasks.filter((t) => t.assignee_id === me.id && t.status !== 'completed').length;
  const liveMeetings = db.meetings.filter((m) => m.status === 'live').length;
  const counts: Partial<Record<string, number>> = { tasks: openTasks, meetings: liveMeetings };

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          {NAV.map(({ key, label, icon: Icon }) => (
            <a key={key} href={`#/${key}`} className={cls('nav-item', section === key && 'active')}>
              <Icon size={18} /> {label}
              {!!counts[key] && <span className="count">{counts[key]}</span>}
            </a>
          ))}
        </nav>
        {backend.mode === 'demo' && <div className="mode-banner"><Zap size={14} /> Demo mode — local data</div>}
        <div className="side-user">
          <Avatar user={me} size="sm" status={statusOf(me.id)} />
          <div className="grow">
            <div className="strong small truncate">{me.full_name}</div>
            <div className="faint xs">{ROLE_LABEL[me.role]}</div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className={cls('topbar', scrolled && 'scrolled')}>
          <div className="mobile-brand">
            <div className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9 }}><BrandMark size={16} /></div>
            <div className="brand-name" style={{ fontSize: 15 }}>TeamHub</div>
          </div>
          <div className="topbar-title">{section === 'dashboard' ? `Hello, ${firstName(me.full_name)} 👋` : ''}</div>
          <div className="grow" />
          {can(me, 'meeting.create') && (
            <button className="btn btn-primary btn-sm" onClick={() => startInstant()}>
              <Video size={16} /> <span className="hide-mobile">Start meeting</span><span className="show-mobile">Start</span>
            </button>
          )}
          <NotificationsBell />
          <StatusMenu />
        </header>
        <main className="page">{children}</main>
      </div>

      <nav className="bottom-nav">
        {MOBILE_PRIMARY.map((key) => {
          const n = NAV.find((x) => x.key === key)!;
          const Icon = n.icon;
          return (
            <a key={key} href={`#/${key}`} className={cls('bn-item', section === key && 'active')}>
              <Icon size={21} />
              {key === 'dashboard' ? 'Home' : key === 'rooms' ? 'Rooms' : n.label}
              {!!counts[key] && <span className="dot-count">{counts[key]}</span>}
            </a>
          );
        })}
        <button className={cls('bn-item', !MOBILE_PRIMARY.includes(section as never) && 'active')} onClick={() => setMoreOpen(true)}>
          <MoreHorizontal size={21} /> More
        </button>
      </nav>
      {moreOpen && (
        <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div className="modal" style={{ paddingBottom: 'var(--safe-b)' }}>
            <div className="modal-head"><h2>More</h2></div>
            <div className="modal-body" style={{ paddingBottom: 20 }}>
              <div className="grid g-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.key as never)).map(({ key, label, icon: Icon }) => (
                  <a key={key} href={`#/${key}`} className={cls('card card-pad col', section === key && 'card-accent')} style={{ alignItems: 'center', gap: 8, padding: 14 }} onClick={() => setMoreOpen(false)}>
                    <Icon size={22} className={section === key ? 'red' : undefined} />
                    <span className="small strong center">{label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
