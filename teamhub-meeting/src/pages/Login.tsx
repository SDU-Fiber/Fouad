import { useState } from 'react';
import { ArrowRight, LogIn } from 'lucide-react';
import type { Backend } from '../data/backend';
import { DEMO_PASSWORD, PEOPLE } from '../lib/seed';
import { ROLE_LABEL } from '../lib/permissions';
import type { User } from '../lib/types';
import { BrandMark } from '../components/Layout';
import { Avatar } from '../components/ui';

const DEMO_KEYS = ['manager', 'nadia', 'salim', 'aisha', 'omar', 'admin'];

export function Login({ backend, onSignedIn }: { backend: Backend; onSignedIn: (u: User) => void }) {
  const demo = backend.mode === 'demo';
  const [email, setEmail] = useState(demo ? 'manager@teamhub.demo' : '');
  const [password, setPassword] = useState(demo ? DEMO_PASSWORD : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const joining = location.hash.startsWith('#/join/') || location.hash.startsWith('#/meet/');

  const signIn = async (e?: string, p?: string) => {
    setBusy(true);
    setError('');
    try {
      onSignedIn(await backend.signIn(e ?? email, p ?? password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-hero">
        <div className="row" style={{ position: 'relative' }}>
          <div className="brand-mark"><BrandMark /></div>
          <div className="brand-name" style={{ color: '#fff' }}>TeamHub <span>Meeting</span></div>
        </div>
        <div className="col gap-20" style={{ position: 'relative' }}>
          <h1>The meeting room <span>built for sales teams.</span></h1>
          <p style={{ color: 'rgba(255,255,255,.7)', maxWidth: 460, fontSize: 15 }}>
            Video meetings, attendance, notes, action items and sales performance — in one place. Every meeting ends with clear owners and measurable follow-up.
          </p>
          <div className="login-flow">
            {['Meet', 'Discuss', 'Decide', 'Assign', 'Track', 'Measure'].map((s) => <span key={s}>{s}</span>)}
          </div>
        </div>
        <p className="hide-mobile" style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, position: 'relative' }}>Secure by design · Role-based access · Row Level Security</p>
      </section>

      <section className="login-main">
        <form className="login-card" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <div>
            <h1>Sign in</h1>
            <p className="muted mt-4">{joining ? 'Sign in to join the meeting.' : 'Welcome back — your team is waiting.'}</p>
          </div>
          <label className="field">
            <span className="label">Work email</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? <span className="spinner sm" style={{ borderTopColor: '#fff' }} /> : <LogIn size={18} />} Sign in
          </button>

          {demo && (
            <>
              <div className="row gap-12 mt-8">
                <div className="sep grow" style={{ margin: 0 }} />
                <span className="faint xs strong">DEMO ACCOUNTS · password {DEMO_PASSWORD}</span>
                <div className="sep grow" style={{ margin: 0 }} />
              </div>
              <div className="demo-accounts">
                {DEMO_KEYS.map((k) => {
                  const p = PEOPLE.find((x) => x.key === k)!;
                  return (
                    <button type="button" key={k} className="demo-acc" onClick={() => signIn(p.email, DEMO_PASSWORD)} disabled={busy}>
                      <Avatar user={{ full_name: p.full_name, avatar_color: p.color, avatar_url: null }} size="sm" />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="strong small truncate" style={{ display: 'block' }}>{p.full_name}</span>
                        <span className="faint xs">{ROLE_LABEL[p.role]}</span>
                      </span>
                      <ArrowRight size={14} className="faint" />
                    </button>
                  );
                })}
              </div>
              <p className="faint xs center">
                Tip: open a second tab and sign in as another person to test live video, chat and the waiting room.
              </p>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
