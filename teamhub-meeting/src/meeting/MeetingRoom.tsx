import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Copy, Expand, Hand, KeyRound, LayoutGrid, Lock, MessageSquare, Mic, MicOff, MonitorUp,
  MoreHorizontal, PhoneOff, Presentation, Settings2, ShieldAlert, Smile, Unlock, Users, Video, VideoOff, Volume2,
  VolumeX, Circle, Square, Gavel, ListChecks, UserCheck, Clock,
} from 'lucide-react';
import { useApp } from '../data/AppContext';
import { BackendError } from '../data/backend';
import { canHostControl, isLeader } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { Meeting } from '../lib/types';
import { cls, fmtClock, fmtDay, fmtTime, uid } from '../lib/utils';
import { Avatar, Menu, Modal, useAction, useToast } from '../components/ui';
import { useMeetingActions } from '../components/meetingActions';
import { QUICK_REACTIONS } from '../components/Chat';
import { MeshEngine, type PeerState, type RemotePeer } from '../rtc/MeshEngine';
import { LevelMeter } from '../rtc/levels';
import { canPickSpeaker, canShareScreen, getCameraTrack, getMicTrack, iceServers, listDevices, mediaError, type DeviceLists } from '../rtc/media';
import { canRecord, MeetingRecorder } from '../rtc/recorder';
import { SidePanel, type PanelTab } from './SidePanel';
import { Tile } from './Tile';

interface JoinPrefs {
  mic: boolean;
  cam: boolean;
  micId: string | null;
  camId: string | null;
}

const PREFS_KEY = 'teamhub.mediaPrefs';
const loadPrefs = (): JoinPrefs => {
  try {
    return { mic: true, cam: true, micId: null, camId: null, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { mic: true, cam: true, micId: null, camId: null };
  }
};

// ─── Lobby (pre-join check) ─────────────────────────────────────────────────
function Lobby({ meeting, waiting, onJoin }: { meeting: Meeting; waiting: boolean; onJoin: (p: JoinPrefs) => void }) {
  const { db, me, userById } = useApp();
  const [prefs, setPrefs] = useState<JoinPrefs>(loadPrefs);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<DeviceLists>({ audioIn: [], videoIn: [], audioOut: [] });
  const [level, setLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const host = canHostControl(me, meeting, db);
  const invited = db.meeting_participants.filter((p) => p.meeting_id === meeting.id && p.admission !== 'denied').length;

  useEffect(() => {
    let alive = true;
    let tracks: MediaStreamTrack[] = [];
    (async () => {
      const got: MediaStreamTrack[] = [];
      const errs: string[] = [];
      if (prefs.cam) await getCameraTrack(prefs.camId).then((t) => got.push(t)).catch((e) => errs.push(mediaError(e, 'Camera')));
      await getMicTrack(prefs.micId).then((t) => got.push(t)).catch((e) => errs.push(mediaError(e, 'Microphone')));
      if (!alive) return got.forEach((t) => t.stop());
      tracks = got;
      setError(errs[0] ?? '');
      setStream(new MediaStream(got));
      setDevices(await listDevices());
    })();
    return () => {
      alive = false;
      tracks.forEach((t) => t.stop());
    };
  }, [prefs.cam, prefs.camId, prefs.micId]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    const meter = new LevelMeter();
    meter.set('me', stream);
    const t = setInterval(() => setLevel(prefs.mic ? meter.level('me') : 0), 120);
    return () => {
      clearInterval(t);
      meter.dispose();
    };
  }, [stream, prefs.mic]);

  const update = (p: Partial<JoinPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };
  const bars = Array.from({ length: 8 }, (_, i) => i);
  const lit = Math.min(8, Math.round(level * 60));
  const scheduled = new Date(meeting.scheduled_at);

  return (
    <div className="lobby">
      <div className="lobby-grid">
        <div className="col gap-12">
          <div className="preview">
            {prefs.cam && stream?.getVideoTracks().length ? <video ref={videoRef} autoPlay playsInline muted /> : (
              <div className="col" style={{ alignItems: 'center' }}>
                <Avatar user={me} size="xxl" />
                <span style={{ color: '#a1a1aa' }}>Camera is off</span>
              </div>
            )}
            <div className="preview-controls">
              <button className={cls('round-btn', !prefs.mic && 'off')} onClick={() => update({ mic: !prefs.mic })} aria-label="Toggle microphone">{prefs.mic ? <Mic size={22} /> : <MicOff size={22} />}</button>
              <button className={cls('round-btn', !prefs.cam && 'off')} onClick={() => update({ cam: !prefs.cam })} aria-label="Toggle camera">{prefs.cam ? <Video size={22} /> : <VideoOff size={22} />}</button>
            </div>
          </div>
          <div className="row wrap gap-12">
            <div className="row grow" style={{ minWidth: 200 }}>
              <Mic size={16} className="muted" />
              <select className="select input-sm grow" value={prefs.micId ?? ''} onChange={(e) => update({ micId: e.target.value || null })}>
                <option value="">Default microphone</option>
                {devices.audioIn.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
              </select>
              <div className="meter" aria-label="Mic level">{bars.map((i) => <i key={i} className={cls(i < lit && 'lit')} style={{ height: 6 + i * 1.6 }} />)}</div>
            </div>
            <div className="row grow" style={{ minWidth: 200 }}>
              <Video size={16} className="muted" />
              <select className="select input-sm grow" value={prefs.camId ?? ''} onChange={(e) => update({ camId: e.target.value || null })}>
                <option value="">Default camera</option>
                {devices.videoIn.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="error-text row"><ShieldAlert size={15} /> {error} You can still join and turn it on later.</p>}
        </div>

        <div className="card card-pad col gap-16">
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/meetings')}><ArrowLeft size={15} /> Back</button>
          <div>
            <div className="row gap-4">{meeting.status === 'live' ? <span className="live-pill">LIVE</span> : <span className="badge tone-gray"><Clock size={12} /> {fmtDay(meeting.scheduled_at)} · {fmtTime(meeting.scheduled_at)}</span>}{meeting.locked && <span className="badge tone-dark"><Lock size={11} /> Locked</span>}</div>
            <h1 className="mt-8">{meeting.title}</h1>
            <p className="muted mt-4">Host: {userById(meeting.host_id)?.full_name} · {invited} invited · {meeting.duration_min} min</p>
          </div>
          {meeting.agenda.length > 0 && (
            <div className="agenda-list">
              {meeting.agenda.slice(0, 4).map((a, i) => <div key={a.id} className="row small"><span className="faint num">{i + 1}.</span><span className="grow">{a.title}</span><span className="faint">{a.minutes}m</span></div>)}
            </div>
          )}
          {waiting ? (
            <div className="card card-pad col" style={{ alignItems: 'center', textAlign: 'center', background: 'var(--amber-50)', borderColor: '#f5d38b' }}>
              <div className="spinner" />
              <h3>Waiting for the host to let you in…</h3>
              <p className="small muted">This meeting requires manager approval.</p>
            </div>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => onJoin(prefs)}>
              <Video size={18} /> {host && meeting.status !== 'live' ? 'Start meeting' : 'Join meeting'}
            </button>
          )}
          {!host && meeting.status !== 'live' && !waiting && (
            <p className="xs muted">{scheduled.getTime() > Date.now() ? 'The host hasn’t started yet — you can join early.' : 'The host hasn’t started the meeting yet.'}</p>
          )}
          <p className="xs faint">Your attendance (join & leave time) is recorded automatically.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Live room ──────────────────────────────────────────────────────────────
type ExitReason = 'left' | 'ended' | 'removed';

/** Largest tile size that fits n tiles in the box (16:9 on wide screens, portrait-friendly on phones). */
function gridLayout(W: number, H: number, n: number, gap: number) {
  const ratio = W / Math.max(H, 1) < 0.8 ? 0.8 : 16 / 9;
  let best = { w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let w = (W - gap * (cols - 1)) / cols;
    let h = w / ratio;
    if (h * rows + gap * (rows - 1) > H) {
      h = (H - gap * (rows - 1)) / rows;
      w = h * ratio;
    }
    if (w > best.w) best = { w: Math.floor(w), h: Math.floor(h) };
  }
  return best;
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

function DeviceModal({ engine, sinkId, setSinkId, onClose }: { engine: MeshEngine | null; sinkId: string; setSinkId: (s: string) => void; onClose: () => void }) {
  const [devices, setDevices] = useState<DeviceLists>({ audioIn: [], videoIn: [], audioOut: [] });
  const run = useAction();
  useEffect(() => void listDevices().then(setDevices), []);
  return (
    <Modal title="Audio & video settings" onClose={onClose}>
      <div className="col gap-12">
        <label className="field"><span className="label">Microphone</span>
          <select className="select" defaultValue={engine?.devices.mic ?? ''} onChange={(e) => run(() => engine!.switchDevice('mic', e.target.value), 'Microphone switched')}>
            <option value="" disabled>Choose…</option>
            {devices.audioIn.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">Camera</span>
          <select className="select" defaultValue={engine?.devices.cam ?? ''} onChange={(e) => run(() => engine!.switchDevice('cam', e.target.value), 'Camera switched')}>
            <option value="" disabled>Choose…</option>
            {devices.videoIn.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
          </select>
        </label>
        {canPickSpeaker() && (
          <label className="field"><span className="label">Speaker</span>
            <select className="select" value={sinkId} onChange={(e) => setSinkId(e.target.value)}>
              <option value="">System default</option>
              {devices.audioOut.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>)}
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}

function LiveRoom({ meeting, prefs, onExit }: { meeting: Meeting; prefs: JoinPrefs; onExit: (r: ExitReason) => void }) {
  const { db, me, backend, userById, setPresenceOverride } = useApp();
  const toast = useToast();
  const run = useAction();
  const { copyLink } = useMeetingActions();
  const host = canHostControl(me, meeting, db);
  const leader = isLeader(me);
  const peerId = useMemo(() => uid(), []);
  const engineRef = useRef<MeshEngine | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [local, setLocal] = useState<PeerState>({ peerId, userId: me.id, name: me.full_name, mic: false, cam: false, screen: false, hand: false, rec: false, joinedAt: Date.now() });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [panel, setPanel] = useState<PanelTab | null>(window.innerWidth > 1200 && leader ? 'notes' : null);
  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [floating, setFloating] = useState<Record<string, { id: number; emoji: string }[]>>({});
  const [deafened, setDeafened] = useState(false);
  const [sinkId, setSinkId] = useState('');
  const [recording, setRecording] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [now, setNow] = useState(Date.now());
  const recorderRef = useRef<MeetingRecorder | null>(null);
  const videoEls = useRef(new Map<string, HTMLVideoElement>());
  const prevPeers = useRef<RemotePeer[]>([]);
  const exiting = useRef(false);
  const [stageRef, stageBox] = useBox<HTMLDivElement>();

  const engine = engineRef.current;
  const panelRef = useRef(panel);
  panelRef.current = panel;

  const register = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) videoEls.current.set(id, el);
    else videoEls.current.delete(id);
  }, []);

  const addReaction = useCallback((key: string, emoji: string) => {
    const id = Date.now() + Math.random();
    setFloating((f) => ({ ...f, [key]: [...(f[key] ?? []), { id, emoji }] }));
    setTimeout(() => setFloating((f) => ({ ...f, [key]: (f[key] ?? []).filter((r) => r.id !== id) })), 2700);
  }, []);

  // Messages from other participants (host commands are verified against the meeting's permissions)
  const handler = useRef<(from: PeerState | undefined, msg: Record<string, unknown>) => void>(() => undefined);
  handler.current = (from, msg) => {
    const sender = from ? userById(from.userId) : undefined;
    const fromHost = !!sender && canHostControl(sender, meeting, db);
    if (msg.type === 'reaction' && from) addReaction(from.peerId, String(msg.emoji));
    if (msg.type === 'end' && fromHost) void exit('ended');
    if (msg.type === 'cmd' && fromHost) {
      const e = engineRef.current;
      if (msg.action === 'mute' || (msg.action === 'muteAll' && !host)) {
        void e?.setMic(false).then(() => setLocal({ ...e.self }));
        toast(`${sender!.full_name.split(' ')[0]} muted you`);
      }
      if (msg.action === 'camOff') {
        void e?.setCam(false).then(() => setLocal({ ...e.self }));
        toast(`${sender!.full_name.split(' ')[0]} turned off your camera`);
      }
      if (msg.action === 'lowerHand') {
        e?.setHand(false);
        if (e) setLocal({ ...e.self });
      }
      if (msg.action === 'remove') void exit('removed');
    }
  };

  const exit = useCallback(async (reason: ExitReason) => {
    if (exiting.current) return;
    exiting.current = true;
    if (recorderRef.current) await stopRecording();
    engineRef.current?.leave();
    await backend.rpc('record_attendance', { meeting_id: meeting.id, event: 'leave' }).catch(() => undefined);
    onExit(reason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, meeting.id, onExit]);

  // Engine lifecycle
  useEffect(() => {
    const ch = backend.channel(`meeting:${meeting.id}`, { presenceKey: peerId });
    const e = new MeshEngine(ch, { peerId, userId: me.id, name: me.full_name }, iceServers());
    engineRef.current = e;
    let disposed = false;
    e.onPeers((list) => {
      const before = new Map(prevPeers.current.map((p) => [p.peerId, p]));
      list.forEach((p) => {
        const old = before.get(p.peerId);
        if (!old && Date.now() - e.self.joinedAt > 3000) toast(`${p.name} joined`);
        if (old && !old.hand && p.hand) toast(`✋ ${p.name} raised their hand`);
      });
      prevPeers.current.forEach((p) => !list.some((x) => x.peerId === p.peerId) && toast(`${p.name} left`));
      prevPeers.current = list;
      setPeers(list);
    });
    e.onLocal(() => {
      setLocalStream(e.localStream);
      setLocal({ ...e.self });
    });
    e.onMessage(({ from, msg }) => handler.current(from, msg));
    (async () => {
      const errs = await e.init(prefs);
      if (disposed) return;
      errs.forEach((err, i) => toast(mediaError(err, i === 0 && !e.micTrack ? 'Microphone' : 'Camera'), 'error'));
      setLocal({ ...e.self });
      setLocalStream(e.localStream);
      try {
        await e.connect();
      } catch (err) {
        toast(`Realtime connection failed: ${(err as Error).message}`, 'error');
      }
      if (disposed) return;
      await backend.rpc('record_attendance', { meeting_id: meeting.id, event: 'join' }).catch(() => undefined);
      if (host && meeting.status !== 'live') await backend.rpc('start_meeting', { meeting_id: meeting.id }).catch((err) => toast((err as Error).message, 'error'));
      if (host && meeting.recording_enabled && canRecord()) {
        setTimeout(() => !disposed && startRecording(true), 1500);
      }
    })();
    setPresenceOverride({ status: 'in_meeting', activity: `In ${meeting.title}` });
    document.body.classList.add('in-meeting');
    const hb = setInterval(() => void backend.rpc('record_attendance', { meeting_id: meeting.id, event: 'heartbeat' }).catch(() => undefined), 30_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const onHide = () => e.leave();
    window.addEventListener('pagehide', onHide);
    return () => {
      disposed = true;
      clearInterval(hb);
      clearInterval(clock);
      window.removeEventListener('pagehide', onHide);
      e.leave();
      setPresenceOverride(null);
      document.body.classList.remove('in-meeting');
      if (!exiting.current) void backend.rpc('record_attendance', { meeting_id: meeting.id, event: 'leave' }).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active speaker detection
  useEffect(() => {
    const meter = new LevelMeter();
    let current: string | null = null;
    let quietSince = 0;
    const t = setInterval(() => {
      meter.set('me', local.mic ? localStream : null);
      peers.forEach((p) => meter.set(p.peerId, p.mic ? p.stream : null));
      meter.keys().forEach((k) => k !== 'me' && !peers.some((p) => p.peerId === k) && meter.remove(k));
      let best: string | null = null;
      let max = 0.035;
      meter.keys().forEach((k) => {
        const l = meter.level(k);
        if (l > max) { max = l; best = k; }
      });
      if (best) { current = best; quietSince = 0; }
      else if (current && !quietSince) quietSince = Date.now();
      else if (current && Date.now() - quietSince > 1200) current = null;
      setSpeaking(current);
    }, 250);
    return () => { clearInterval(t); meter.dispose(); };
  }, [peers, localStream, local.mic]);

  // Meeting ended / I was removed (from the database, e.g. if the broadcast was missed)
  const myPart = db.meeting_participants.find((p) => p.meeting_id === meeting.id && p.user_id === me.id);
  useEffect(() => {
    if (meeting.status === 'ended') void exit('ended');
  }, [meeting.status, exit]);
  useEffect(() => {
    if (myPart?.admission === 'removed') void exit('removed');
  }, [myPart?.admission, exit]);

  // Unread chat badge
  const { onMessageEvent } = useApp();
  useEffect(() => onMessageEvent((e) => {
    if (e.type === 'INSERT' && e.row.meeting_id === meeting.id && e.row.sender_id !== me.id && panelRef.current !== 'chat') setUnread((n) => n + 1);
  }), [onMessageEvent, meeting.id, me.id]);
  useEffect(() => { if (panel === 'chat') setUnread(0); }, [panel]);

  // Keyboard shortcuts: M = mic, V = camera
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey) return;
      if (e.key === 'm') void toggleMic();
      if (e.key === 'v') void toggleCam();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // ── controls ──
  const sync = () => engineRef.current && setLocal({ ...engineRef.current.self });
  const toggleMic = async () => {
    const e = engineRef.current;
    if (!e) return;
    try { await e.setMic(!e.self.mic); } catch (err) { toast(mediaError(err, 'Microphone'), 'error'); }
    sync();
  };
  const toggleCam = async () => {
    const e = engineRef.current;
    if (!e) return;
    try { await e.setCam(!e.self.cam); } catch (err) { toast(mediaError(err, 'Camera'), 'error'); }
    sync();
  };
  const toggleScreen = async () => {
    const e = engineRef.current;
    if (!e) return;
    try {
      if (e.self.screen) await e.stopScreenShare();
      else await e.startScreenShare();
    } catch (err) {
      if ((err as DOMException).name !== 'NotAllowedError') toast('Screen sharing failed', 'error');
    }
    sync();
  };
  const toggleHand = () => {
    const e = engineRef.current;
    if (!e) return;
    e.setHand(!e.self.hand);
    sync();
  };
  const react = (emoji: string) => {
    engineRef.current?.broadcast({ type: 'reaction', emoji });
    addReaction(peerId, emoji);
  };
  const togglePanel = (t: PanelTab) => setPanel((p) => (p === t ? null : t));

  const recordSources = () => [
    { video: videoEls.current.get(peerId) ?? null, name: me.full_name, showVideo: engineRef.current?.self.cam || engineRef.current?.self.screen || false, stream: engineRef.current?.localStream ?? null },
    ...prevPeers.current.map((p) => ({ video: videoEls.current.get(p.peerId) ?? null, name: p.name, showVideo: p.cam || p.screen, stream: p.stream })),
  ];

  function startRecording(auto = false) {
    if (!canRecord()) return toast('Recording is not supported in this browser', 'error');
    const r = new MeetingRecorder(recordSources, meeting.title);
    r.start();
    recorderRef.current = r;
    setRecording(true);
    engineRef.current?.setRecording(true);
    toast(auto ? 'Recording started (enabled for this meeting)' : 'Recording started — everyone can see the REC indicator');
  }

  async function stopRecording() {
    const r = recorderRef.current;
    if (!r) return;
    recorderRef.current = null;
    setRecording(false);
    engineRef.current?.setRecording(false);
    toast('Saving recording…');
    const { blob, durationSec, ext } = await r.stop();
    const rid = uid();
    await run(async () => {
      const url = await backend.uploadFile('recordings', `${meeting.id}/${rid}.${ext}`, blob);
      await backend.update('meetings', meeting.id, {
        recording: { id: rid, name: `${meeting.title} — ${new Date().toLocaleDateString()}.${ext}`, size: blob.size, duration_sec: durationSec, url, created_at: new Date().toISOString() },
      });
    }, 'Recording saved to meeting history');
  }

  const endForAll = async () => {
    setConfirmLeave(false);
    engineRef.current?.broadcast({ type: 'end' });
    if (recorderRef.current) await stopRecording();
    await run(() => backend.rpc('end_meeting', { meeting_id: meeting.id }));
    await exit('ended');
  };

  // ── layout ──
  type T = { key: string; isLocal: boolean; state: PeerState; stream: MediaStream | null; conn?: string };
  const tiles: T[] = [{ key: peerId, isLocal: true, state: local, stream: localStream }, ...peers.map((p) => ({ key: p.peerId, isLocal: false, state: p as PeerState, stream: p.stream, conn: p.conn }))];
  const presenter = tiles.find((t) => t.state.screen && !t.isLocal) ?? tiles.find((t) => t.state.screen);
  const spotlightKey = presenter?.key ?? (layout === 'speaker' && tiles.length > 1 ? (speaking && speaking !== 'me' ? speaking : peers[0]?.peerId) : undefined);
  const spot = tiles.find((t) => t.key === spotlightKey);
  const renderTile = (t: T) => (
    <Tile
      key={t.key}
      id={t.key}
      stream={t.stream}
      user={userById(t.state.userId)}
      name={t.state.name}
      mic={t.state.mic}
      cam={t.state.cam}
      screen={t.state.screen}
      hand={t.state.hand}
      isLocal={t.isLocal}
      speaking={(t.isLocal ? speaking === 'me' : speaking === t.key) && tiles.length > 1}
      conn={t.conn}
      muted={deafened}
      sinkId={sinkId}
      reactions={floating[t.key] ?? []}
      register={register}
    />
  );
  const n = tiles.length;
  const tileSize = gridLayout(stageBox.w, stageBox.h, n, stageBox.w < 600 ? 6 : 10);

  // outcome counters
  const notes = db.meeting_notes.filter((x) => x.meeting_id === meeting.id);
  const decisions = notes.filter((x) => x.kind === 'decision').length;
  const actions = db.meeting_tasks.filter((x) => x.meeting_id === meeting.id).length;
  const invited = db.meeting_participants.filter((p) => p.meeting_id === meeting.id && (p.admission === 'invited' || p.admission === 'admitted')).length;
  const inRoomUsers = new Set([me.id, ...peers.map((p) => p.userId)]).size;
  const waiting = db.meeting_participants.filter((p) => p.meeting_id === meeting.id && p.admission === 'pending').length;
  const startedAt = meeting.started_at ? new Date(meeting.started_at).getTime() : local.joinedAt;
  const anyoneRecording = recording || peers.some((p) => p.rec);
  const hands = peers.filter((p) => p.hand).length + (local.hand ? 1 : 0);

  useEffect(() => {
    if (waiting && host) toast(`${waiting} waiting for approval`, 'info');
  }, [waiting, host, toast]);

  return (
    <div className="meet">
      <header className="meet-top">
        <div style={{ minWidth: 0 }}>
          <div className="meet-title truncate">{meeting.title}</div>
          <div className="meet-sub">
            <span className="num">{fmtClock((now - startedAt) / 1000)}</span>
            {meeting.locked && <><span>·</span><Lock size={12} /> Locked</>}
            {anyoneRecording && <span className="rec-badge">REC</span>}
          </div>
        </div>
        <div className="outcomes">
          <button className="outcome keep" onClick={() => togglePanel(leader ? 'attendance' : 'people')} style={{ cursor: 'pointer' }}><UserCheck size={14} /> <b>{inRoomUsers}/{Math.max(invited, inRoomUsers)}</b> <span className="hide-mobile">present</span></button>
          <button className={cls('outcome', decisions > 0 && 'hot')} onClick={() => togglePanel('notes')} style={{ cursor: 'pointer' }}><Gavel size={14} /> <b>{decisions}</b> decisions</button>
          <button className={cls('outcome', actions > 0 && 'hot')} onClick={() => togglePanel('actions')} style={{ cursor: 'pointer' }}><ListChecks size={14} /> <b>{actions}</b> actions</button>
          {hands > 0 && <span className="outcome keep" style={{ borderColor: '#f59e0b' }}><Hand size={14} className="amber" /> <b>{hands}</b></span>}
          {host && waiting > 0 && <button className="outcome keep hot" onClick={() => setPanel('people')} style={{ cursor: 'pointer' }}><Users size={14} /> <b>{waiting}</b> waiting</button>}
        </div>
      </header>

      <section className="stage">
        <div className="stage-box" ref={stageRef}>
          {spot ? (
            <div className="spot">
              {renderTile(spot)}
              <div className="rail">{tiles.filter((t) => t.key !== spot.key).map(renderTile)}</div>
            </div>
          ) : (
            <div className="tiles">
              {tiles.map((t) => <div key={t.key} style={{ width: tileSize.w, height: tileSize.h, display: 'grid' }}>{renderTile(t)}</div>)}
            </div>
          )}
        </div>
        {n === 1 && (
          <div className="row" style={{ justifyContent: 'center', color: '#a1a1aa', fontSize: 13 }}>
            You're the only one here.
            <button className="btn btn-sm" style={{ background: '#26282e', color: '#fff' }} onClick={() => copyLink(meeting)}><Copy size={14} /> Copy invite link</button>
          </div>
        )}
      </section>

      <footer className="toolbar">
        <div className="tb-group">
          <button className={cls('tb', !local.mic && 'off')} onClick={toggleMic} title="Microphone (M)">{local.mic ? <Mic size={20} /> : <MicOff size={20} />}<span>{local.mic ? 'Mute' : 'Unmute'}</span></button>
          <button className={cls('tb', !local.cam && 'off')} onClick={toggleCam} title="Camera (V)">{local.cam ? <Video size={20} /> : <VideoOff size={20} />}<span>Camera</span></button>
          {canShareScreen() && <button className={cls('tb optional', local.screen && 'accent')} onClick={toggleScreen} title="Share screen"><MonitorUp size={20} /><span>{local.screen ? 'Stop share' : 'Share'}</span></button>}
          <button className={cls('tb', local.hand && 'on')} onClick={toggleHand} title="Raise hand" style={local.hand ? { color: '#fbbf24' } : undefined}><Hand size={20} /><span>{local.hand ? 'Lower' : 'Raise'}</span></button>
          <Menu direction="up" align="left" dark trigger={(_, t) => <button className="tb optional" onClick={t} title="Reactions"><Smile size={20} /><span>React</span></button>}>
            {(close) => <div className="reaction-bar">{QUICK_REACTIONS.map((e) => <button key={e} onClick={() => { react(e); close(); }}>{e}</button>)}</div>}
          </Menu>
        </div>
        <div className="tb-group">
          <button className={cls('tb', panel === 'chat' && 'on')} onClick={() => togglePanel('chat')} title="Chat"><MessageSquare size={20} /><span>Chat</span>{unread > 0 && <span className="dot-count">{unread}</span>}</button>
          <button className={cls('tb', panel === 'people' && 'on')} onClick={() => togglePanel('people')} title="Participants"><Users size={20} /><span>People</span>{host && waiting > 0 && <span className="dot-count">{waiting}</span>}</button>
          <button className={cls('tb', (panel === 'notes' || panel === 'actions' || panel === 'agenda') && 'on')} onClick={() => togglePanel(leader ? 'actions' : 'notes')} title="Notes, decisions & action items"><ListChecks size={20} /><span>Actions</span>{actions > 0 && <span className="dot-count" style={{ background: '#3f3f46' }}>{actions}</span>}</button>
          <Menu direction="up" align="right" dark trigger={(_, t) => <button className="tb" onClick={t} title="More"><MoreHorizontal size={20} /><span>More</span></button>}>
            {(close) => (
              <div style={{ width: 250 }}>
                <div className="menu-label">View</div>
                <button className="menu-item" onClick={() => { setLayout(layout === 'grid' ? 'speaker' : 'grid'); close(); }}>{layout === 'grid' ? <Presentation size={16} /> : <LayoutGrid size={16} />} {layout === 'grid' ? 'Speaker view' : 'Grid view'}</button>
                <button className="menu-item" onClick={() => { togglePanel('agenda'); close(); }}><ListChecks size={16} /> Agenda</button>
                <button className="menu-item" onClick={() => { document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined); close(); }}><Expand size={16} /> Full screen</button>
                <div className="menu-label">Audio</div>
                <button className="menu-item" onClick={() => { setDeafened((d) => !d); close(); }}>{deafened ? <Volume2 size={16} /> : <VolumeX size={16} />} {deafened ? 'Turn speaker on' : 'Mute speaker'}</button>
                <button className="menu-item" onClick={() => { setDevicesOpen(true); close(); }}><Settings2 size={16} /> Audio & video settings</button>
                {host && <div className="menu-label">Host</div>}
                {host && (recording
                  ? <button className="menu-item" onClick={() => { void stopRecording(); close(); }}><Square size={16} className="red" /> Stop recording</button>
                  : <button className="menu-item" onClick={() => { startRecording(); close(); }}><Circle size={16} className="red" /> Start recording</button>)}
                {host && <button className="menu-item" onClick={() => { void run(() => backend.update('meetings', meeting.id, { locked: !meeting.locked }), meeting.locked ? 'Meeting unlocked' : 'Meeting locked'); close(); }}>{meeting.locked ? <Unlock size={16} /> : <Lock size={16} />} {meeting.locked ? 'Unlock meeting' : 'Lock meeting'}</button>}
                {host && <button className="menu-item" onClick={() => { engineRef.current?.broadcast({ type: 'cmd', action: 'muteAll' }); toast('Everyone was muted'); close(); }}><MicOff size={16} /> Mute everyone</button>}
                <button className="menu-item" onClick={() => { void copyLink(meeting); close(); }}><Copy size={16} /> Copy invite link</button>
              </div>
            )}
          </Menu>
        </div>
        <button className="tb-leave" onClick={() => setConfirmLeave(true)}><PhoneOff size={20} /><span>{host ? 'End' : 'Leave'}</span></button>
      </footer>

      {panel && <SidePanel meeting={meeting} tab={panel} setTab={setPanel} onClose={() => setPanel(null)} peers={peers} local={local} engine={engine ?? engineRef.current} leader={leader} />}

      {confirmLeave && (
        <Modal title={host ? 'End this meeting?' : 'Leave the meeting?'} subtitle={host ? `${actions} action items · ${decisions} decisions captured` : undefined} onClose={() => setConfirmLeave(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>Cancel</button>
              <button className="btn btn-outline" onClick={() => { setConfirmLeave(false); void exit('left'); }}>Leave{host ? ' (keep running)' : ''}</button>
              {host && <button className="btn btn-primary" onClick={endForAll}><PhoneOff size={16} /> End for everyone</button>}
            </>
          }>
          <p className="muted">{host ? 'Ending closes the room for everyone, finalises attendance and opens the meeting summary.' : 'You can rejoin while the meeting is running.'}</p>
          {host && actions === 0 && <p className="small mt-12 row" style={{ color: '#9a6300' }}><ShieldAlert size={15} /> No action items yet — every meeting should end with clear owners.</p>}
        </Modal>
      )}
      {devicesOpen && <DeviceModal engine={engineRef.current} sinkId={sinkId} setSinkId={setSinkId} onClose={() => setDevicesOpen(false)} />}
    </div>
  );
}

// ─── Entry: access check → lobby → room ─────────────────────────────────────
export default function MeetingRoom({ meetingId }: { meetingId: string }) {
  const { db, me, backend } = useApp();
  const [gate, setGate] = useState<{ state: 'checking' | 'password' | 'error' | 'ok'; error?: string }>({ state: 'checking' });
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'lobby' | 'live' | 'left' | 'removed'>('lobby');
  const [prefs, setPrefs] = useState<JoinPrefs | null>(null);
  const meeting = db.meetings.find((m) => m.id === meetingId);
  const myPart = db.meeting_participants.find((p) => p.meeting_id === meetingId && p.user_id === me.id);

  const check = useCallback(async (pw?: string) => {
    try {
      await backend.rpc('join_meeting', { meeting_id: meetingId, password: pw });
      setGate({ state: 'ok' });
    } catch (e) {
      const code = e instanceof BackendError ? e.code : '';
      if (code === 'password_required' || code === 'password_invalid') setGate({ state: 'password', error: code === 'password_invalid' ? 'Wrong password — try again.' : undefined });
      else if (code === 'ended') navigate(`/history/${meetingId}`);
      else setGate({ state: 'error', error: (e as Error).message });
    }
  }, [backend, meetingId]);

  useEffect(() => void check(), [check]);

  const onExit = useCallback((r: ExitReason) => {
    if (r === 'ended') navigate(`/history/${meetingId}?ended=1`);
    else setPhase(r);
  }, [meetingId]);

  if (gate.state === 'password')
    return (
      <div className="boot">
        <form className="boot-card" style={{ width: 'min(420px,100%)' }} onSubmit={(e) => { e.preventDefault(); void check(password); }}>
          <h2 className="row"><KeyRound size={20} className="red" /> Password required</h2>
          <p className="muted">Enter the meeting password shared by the host.</p>
          <input className="input" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          {gate.error && <p className="error-text">{gate.error}</p>}
          <div className="row"><button type="button" className="btn btn-ghost" onClick={() => navigate('/meetings')}>Cancel</button><button className="btn btn-primary grow" disabled={!password}>Continue</button></div>
        </form>
      </div>
    );
  if (gate.state === 'error' || phase === 'removed' || myPart?.admission === 'denied')
    return (
      <div className="boot">
        <div className="boot-card">
          <h2 className="row"><ShieldAlert size={20} className="red" /> {phase === 'removed' ? 'You were removed from the meeting' : myPart?.admission === 'denied' ? 'Request declined' : "Can't join this meeting"}</h2>
          <p className="muted">{phase === 'removed' ? 'The host removed you from this meeting.' : myPart?.admission === 'denied' ? 'The host declined your request to join.' : gate.error}</p>
          <button className="btn btn-dark" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
        </div>
      </div>
    );
  if (gate.state === 'checking' || !meeting) return <div className="boot"><div className="spinner" /></div>;
  if (phase === 'left')
    return (
      <div className="boot">
        <div className="boot-card">
          <h2 className="row"><CheckCircle2 size={20} className="green" /> You left “{meeting.title}”</h2>
          <p className="muted">{meeting.status === 'ended' ? 'The meeting has ended.' : 'The meeting is still running.'}</p>
          <div className="row">
            {meeting.status !== 'ended' && <button className="btn btn-primary" onClick={() => setPhase('lobby')}><Video size={16} /> Rejoin</button>}
            <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>Dashboard</button>
          </div>
        </div>
      </div>
    );
  if (meeting.status === 'ended' && phase !== 'live') {
    navigate(`/history/${meeting.id}`);
    return null;
  }
  if (phase === 'lobby' || !prefs)
    return <Lobby meeting={meeting} waiting={myPart?.admission === 'pending'} onJoin={(p) => { setPrefs(p); setPhase('live'); }} />;
  return <LiveRoom meeting={meeting} prefs={prefs} onExit={onExit} />;
}
