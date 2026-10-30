import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { User } from './lib/types';
import { getBackend, type Backend } from './data/backend';
import { AppProvider } from './data/AppContext';
import { useRoute } from './lib/router';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { TeamPage } from './pages/Team';
import { MeetingsPage } from './pages/Meetings';
import { RoomsPage } from './pages/Rooms';
import { TasksPage } from './pages/Tasks';
import { AnnouncementsPage } from './pages/Announcements';
import { PerformancePage } from './pages/Performance';
import { HistoryPage } from './pages/History';
import { SettingsPage } from './pages/Settings';
import { JoinPage } from './pages/Join';

// The meeting room (WebRTC, recorder…) is code-split: it only loads when someone joins a meeting.
const MeetingRoom = lazy(() => import('./meeting/MeetingRoom'));

function Routes() {
  const route = useRoute();
  const [section, id] = route.parts;

  if (section === 'meet' && id)
    return (
      <Suspense fallback={<div className="boot"><div className="spinner" /></div>}>
        <MeetingRoom meetingId={id} key={id} />
      </Suspense>
    );
  if (section === 'join' && id) return <JoinPage token={id} />;

  const page = (() => {
    switch (section) {
      case 'team': return <TeamPage />;
      case 'meetings': return <MeetingsPage />;
      case 'rooms': return <RoomsPage parts={route.parts.slice(1)} />;
      case 'tasks': return <TasksPage />;
      case 'announcements': return <AnnouncementsPage />;
      case 'performance': return <PerformancePage />;
      case 'history': return <HistoryPage meetingId={id} justEnded={route.query.get('ended') === '1'} />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  })();
  return <Layout section={section ?? 'dashboard'}>{page}</Layout>;
}

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    getBackend()
      .then(async (b) => {
        setBackend(b);
        setMe(await b.restoreSession());
      })
      .finally(() => setBooting(false));
  }, []);

  const onSignedOut = useCallback(() => setMe(null), []);

  if (booting || !backend) return <div className="boot"><div className="spinner" /></div>;
  return (
    <ToastProvider>
      {!me ? (
        <Login backend={backend} onSignedIn={setMe} />
      ) : (
        <AppProvider backend={backend} me={me} onSignedOut={onSignedOut} key={me.id}>
          <Routes />
        </AppProvider>
      )}
    </ToastProvider>
  );
}
