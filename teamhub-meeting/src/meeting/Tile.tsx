import { memo, useEffect, useRef } from 'react';
import { Hand, MicOff, MonitorUp } from 'lucide-react';
import type { User } from '../lib/types';
import { cls } from '../lib/utils';
import { Avatar } from '../components/ui';

export interface TileProps {
  id: string;
  stream: MediaStream | null;
  user: User | undefined;
  name: string;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  hand: boolean;
  isLocal?: boolean;
  speaking?: boolean;
  conn?: string;
  muted?: boolean;
  sinkId?: string;
  reactions: { id: number; emoji: string }[];
  register: (id: string, el: HTMLVideoElement | null) => void;
}

export const Tile = memo(function Tile(p: TileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const showVideo = p.cam || p.screen;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== p.stream) el.srcObject = p.stream;
    if (p.stream) void el.play().catch(() => undefined);
  }, [p.stream]);

  useEffect(() => {
    const el = ref.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el && p.sinkId && el.setSinkId) void el.setSinkId(p.sinkId).catch(() => undefined);
  }, [p.sinkId]);

  useEffect(() => {
    p.register(p.id, ref.current);
    return () => p.register(p.id, null);
  }, [p.id, p.register]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cls('tile', p.speaking && 'speaking')}>
      {/* The <video> stays mounted even with camera off: it also plays the participant's audio. */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={p.isLocal || p.muted}
        className={cls(p.screen && 'contain', p.isLocal && !p.screen && 'mirror')}
        style={{ opacity: showVideo ? 1 : 0 }}
      />
      {!showVideo && (
        <div className="tile-avatar">
          <Avatar user={p.user ?? { full_name: p.name, avatar_color: '#52525b', avatar_url: null }} size="xxl" />
        </div>
      )}
      {p.conn && p.conn !== 'connected' && !p.isLocal && <span className="tile-conn">{p.conn === 'failed' ? 'Reconnecting…' : 'Connecting…'}</span>}
      <div className="tile-flags">
        {p.hand && <span className="tile-flag hand" title="Hand raised"><Hand size={15} /></span>}
        {p.screen && <span className="tile-flag" title="Presenting"><MonitorUp size={15} /></span>}
        {!p.mic && <span className="tile-flag muted" title="Muted"><MicOff size={14} /></span>}
      </div>
      <div className="tile-label"><span className="truncate">{p.name}{p.isLocal ? ' (you)' : ''}</span></div>
      {p.reactions.map((r, i) => (
        <span key={r.id} className="float-reaction" style={{ left: `${30 + ((r.id + i * 17) % 40)}%` }}>{r.emoji}</span>
      ))}
    </div>
  );
});
