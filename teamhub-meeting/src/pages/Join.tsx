import { useEffect, useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { BackendError } from '../data/backend';
import { navigate } from '../lib/router';
import { BrandMark } from '../components/Layout';

/** Secure link entry point: #/join/<token>. Access rules are enforced by the join_meeting RPC. */
export function JoinPage({ token }: { token: string }) {
  const { backend } = useApp();
  const [state, setState] = useState<'checking' | 'password' | 'error'>('checking');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');

  const attempt = async (pw?: string) => {
    setError('');
    try {
      const r = await backend.rpc('join_meeting', { token, password: pw });
      navigate(`/meet/${r.meeting_id}`);
    } catch (e) {
      const code = e instanceof BackendError ? e.code : '';
      if (code === 'password_required' || code === 'password_invalid') {
        setState('password');
        if (code === 'password_invalid') setError('Wrong password — try again.');
      } else {
        setState('error');
        setError((e as Error).message);
      }
    }
  };

  useEffect(() => {
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="boot">
      <div className="boot-card" style={{ width: 'min(420px, 100%)' }}>
        <div className="brand-mark"><BrandMark /></div>
        {state === 'checking' && <><h2>Checking your access…</h2><div className="spinner" /></>}
        {state === 'password' && (
          <form className="col gap-12" onSubmit={(e) => { e.preventDefault(); void attempt(password); }}>
            <h2 className="row"><KeyRound size={20} className="red" /> Password required</h2>
            <p className="muted">This meeting is protected. Enter the password shared by the host.</p>
            <input className="input" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Meeting password" />
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary" disabled={!password}>Continue</button>
          </form>
        )}
        {state === 'error' && (
          <>
            <h2 className="row"><ShieldAlert size={20} className="red" /> Can't join this meeting</h2>
            <p className="muted">{error}</p>
            <button className="btn btn-dark" onClick={() => navigate('/meetings')}>Back to meetings</button>
          </>
        )}
      </div>
    </div>
  );
}
