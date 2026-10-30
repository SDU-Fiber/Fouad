import { useState } from 'react';
import { CheckSquare, Clock, FileText, Film, History, Search, Sparkles, Users } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { meetingStats, myMeetings } from '../data/selectors';
import { isLeader } from '../lib/permissions';
import { navigate } from '../lib/router';
import { fmtDuration, fmtTime, sortBy } from '../lib/utils';
import { DateBlock } from '../components/cards';
import { MeetingReport } from '../components/MeetingReport';
import { AvatarStack, Empty } from '../components/ui';

export function HistoryPage({ meetingId, justEnded }: { meetingId?: string; justEnded?: boolean }) {
  const { db, me } = useApp();
  const [q, setQ] = useState('');
  const [roomId, setRoomId] = useState('all');

  if (meetingId) return <MeetingReport meetingId={meetingId} justEnded={justEnded} key={meetingId} />;

  const pool = isLeader(me) ? db.meetings : myMeetings(db, me.id);
  const meetings = sortBy(
    pool.filter((m) => m.status === 'ended')
      .filter((m) => roomId === 'all' || m.room_id === roomId)
      .filter((m) => !q || m.title.toLowerCase().includes(q.toLowerCase())),
    (m) => m.scheduled_at,
    -1,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Meeting History</h1>
          <p>Every meeting with its notes, decisions, actions, attendance and recording.</p>
        </div>
      </div>
      <div className="row wrap gap-12" style={{ marginBottom: 16 }}>
        <div className="input-icon" style={{ width: 'min(280px, 100%)' }}>
          <Search size={16} />
          <input className="input" placeholder="Search meetings" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="all">All rooms</option>
          {db.team_rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {meetings.length === 0 ? (
        <div className="card"><Empty icon={<History size={22} />} title="No past meetings">Completed meetings will appear here.</Empty></div>
      ) : (
        <div className="col gap-12">
          {meetings.map((m) => {
            const s = meetingStats(db, m);
            const insight = db.meeting_insights.find((i) => i.meeting_id === m.id);
            const room = db.team_rooms.find((r) => r.id === m.room_id);
            return (
              <button key={m.id} className="card card-pad card-link" style={{ textAlign: 'left', font: 'inherit', display: 'flex', gap: 14, alignItems: 'flex-start' }} onClick={() => navigate(`/history/${m.id}`)}>
                <DateBlock iso={m.scheduled_at} />
                <div className="grow col gap-4" style={{ minWidth: 0 }}>
                  <div className="row wrap between">
                    <h3>{m.title}</h3>
                    <AvatarStack ids={s.participants.map((p) => p.user_id)} max={5} size="xs" />
                  </div>
                  <div className="row wrap gap-12 small muted">
                    <span className="row gap-4"><Clock size={13} /> {fmtTime(m.started_at ?? m.scheduled_at)} · {fmtDuration(s.durationSec)}</span>
                    <span className="row gap-4"><Users size={13} /> {s.present}/{s.invited} attended{s.late ? ` · ${s.late} late` : ''}</span>
                    <span className="row gap-4"><FileText size={13} /> {s.notes.length + s.decisions.length} notes</span>
                    <span className="row gap-4"><CheckSquare size={13} /> {s.tasks.length} tasks</span>
                    {m.recording && <span className="row gap-4"><Film size={13} /> Recording</span>}
                    {room && <span className="badge tone-red">{room.name}</span>}
                  </div>
                  {insight && <p className="small" style={{ color: 'var(--ink-2)' }}><Sparkles size={12} className="faint" /> {insight.summary.length > 220 ? insight.summary.slice(0, 217) + '…' : insight.summary}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
