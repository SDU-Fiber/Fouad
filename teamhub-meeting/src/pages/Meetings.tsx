import { useState } from 'react';
import { CalendarPlus, Link2, Video } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { myMeetings } from '../data/selectors';
import { can, isLeader } from '../lib/permissions';
import { navigate } from '../lib/router';
import { isSameDay, sortBy } from '../lib/utils';
import { MeetingCard } from '../components/cards';
import { MeetingFormModal } from '../components/forms';
import { Empty, Tabs } from '../components/ui';
import { useMeetingActions } from '../components/meetingActions';

type View = 'upcoming' | 'today' | 'live' | 'past';

export function MeetingsPage() {
  const { db, me } = useApp();
  const { startInstant } = useMeetingActions();
  const [view, setView] = useState<View>('upcoming');
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');

  const all = isLeader(me) ? db.meetings : myMeetings(db, me.id);
  const live = all.filter((m) => m.status === 'live');
  const upcoming = sortBy(all.filter((m) => m.status === 'scheduled'), (m) => m.scheduled_at);
  const today = sortBy(all.filter((m) => isSameDay(m.scheduled_at) && m.status !== 'cancelled'), (m) => m.scheduled_at);
  const past = sortBy(all.filter((m) => m.status === 'ended'), (m) => m.scheduled_at, -1).slice(0, 12);
  const list = { upcoming: [...live, ...upcoming], today, live, past }[view];

  const joinByLink = (e: React.FormEvent) => {
    e.preventDefault();
    const token = link.trim().split('/join/').pop()?.split(/[?#]/)[0];
    if (token) navigate(`/join/${token}`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Meetings</h1>
          <p>Schedule, start and join team meetings.</p>
        </div>
        {can(me, 'meeting.create') && (
          <div className="row">
            <button className="btn btn-outline" onClick={() => setCreating(true)}><CalendarPlus size={16} /> Schedule</button>
            <button className="btn btn-primary" onClick={() => startInstant()}><Video size={16} /> Start instant meeting</button>
          </div>
        )}
      </div>

      <form className="card card-pad row wrap gap-12" style={{ marginBottom: 16 }} onSubmit={joinByLink}>
        <Link2 size={18} className="red" />
        <span className="strong">Have a meeting link?</span>
        <input className="input grow" style={{ minWidth: 200 }} placeholder="Paste the secure meeting link" value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn btn-dark" disabled={!link.trim()}>Join</button>
      </form>

      <Tabs
        value={view}
        onChange={setView}
        items={[
          { key: 'upcoming', label: 'Upcoming', count: live.length + upcoming.length },
          { key: 'today', label: 'Today', count: today.length },
          { key: 'live', label: 'Live now', count: live.length },
          { key: 'past', label: 'Recent' },
        ]}
      />
      <div className="mt-16">
        {list.length === 0 ? (
          <div className="card">
            <Empty icon={<Video size={22} />} title="No meetings here" action={can(me, 'meeting.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}><CalendarPlus size={16} /> Schedule a meeting</button>}>
              Meetings you're invited to will appear here.
            </Empty>
          </div>
        ) : (
          <div className="grid g-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {list.map((m) => <MeetingCard key={m.id} meeting={m} />)}
          </div>
        )}
      </div>
      {creating && <MeetingFormModal onClose={() => setCreating(false)} />}
    </>
  );
}
