import { useState } from 'react';
import { Megaphone, Pin, Send, Trash2 } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { can, myTeamIds } from '../lib/permissions';
import { cls, sortBy, timeAgo } from '../lib/utils';
import { Avatar, Empty, Toggle, useAction } from '../components/ui';

export function AnnouncementsPage() {
  const { db, me, backend, userById } = useApp();
  const run = useAction();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [teamId, setTeamId] = useState('');
  const [important, setImportant] = useState(false);
  const [pinned, setPinned] = useState(false);
  const canPost = can(me, 'announcement.create');
  const teams = db.teams.filter((t) => myTeamIds(me, db).includes(t.id));
  const items = sortBy(db.announcements, (a) => (a.pinned ? '1' : '0') + a.created_at, -1);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => backend.insert('announcements', { title: title.trim() || body.trim().slice(0, 60), body: body.trim(), team_id: teamId || null, priority: important ? 'important' : 'normal', pinned }), 'Announcement published — team notified');
    if (ok) {
      setTitle('');
      setBody('');
      setImportant(false);
      setPinned(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Announcements</h1>
          <p>Targets, updates and recognition — delivered to every dashboard.</p>
        </div>
      </div>
      <div className={cls('grid', canPost && 'split')} style={{ alignItems: 'start' }}>
        {canPost && (
          <form className="card card-pad col gap-12" onSubmit={publish}>
            <h3 className="row"><Megaphone size={18} className="red" /> New announcement</h3>
            <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="textarea" rows={4} placeholder="e.g. Tomorrow's target is 10 iPay applications per team." value={body} onChange={(e) => setBody(e.target.value)} required />
            <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Everyone</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} only</option>)}
            </select>
            <div className="row between"><span className="small strong">Mark as important</span><Toggle on={important} onChange={setImportant} /></div>
            <div className="row between"><span className="small strong">Pin to top of dashboards</span><Toggle on={pinned} onChange={setPinned} /></div>
            <button className="btn btn-primary" disabled={!body.trim()}><Send size={16} /> Publish</button>
          </form>
        )}
        <div className="col gap-12">
          {items.length === 0 && <div className="card"><Empty icon={<Megaphone size={22} />} title="No announcements yet" /></div>}
          {items.map((a) => {
            const author = userById(a.author_id);
            const team = db.teams.find((t) => t.id === a.team_id);
            return (
              <div key={a.id} className={cls('card announce', a.priority === 'important' && 'important')}>
                <Avatar user={author} />
                <div className="grow col gap-4">
                  <div className="row wrap between">
                    <div className="row wrap gap-4">
                      <h3>{a.title}</h3>
                      {a.pinned && <span className="badge tone-dark"><Pin size={11} /> Pinned</span>}
                      {a.priority === 'important' && <span className="badge tone-red">Important</span>}
                      <span className="badge tone-gray">{team ? team.name : 'Everyone'}</span>
                    </div>
                    {a.author_id === me.id && (
                      <div className="row gap-4">
                        <button className="btn btn-ghost btn-xs" onClick={() => run(() => backend.update('announcements', a.id, { pinned: !a.pinned }))}><Pin size={13} /> {a.pinned ? 'Unpin' : 'Pin'}</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => confirm('Delete announcement?') && run(() => backend.remove('announcements', a.id))}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
                  <span className="faint xs">{author?.full_name} · {timeAgo(a.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
