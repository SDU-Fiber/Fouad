// WebRTC mesh engine — peer-to-peer audio/video between meeting participants.
//
// • Signaling + presence run over the backend's realtime channel (Supabase Realtime in production,
//   BroadcastChannel in demo mode). No media ever touches our servers.
// • One RTCPeerConnection per remote peer. The peer with the smaller peerId always makes the offer,
//   so offers never collide.
// • Every connection always carries one audio + one video sender. Mic/camera/screen changes use
//   RTCRtpSender.replaceTrack(), so no renegotiation is ever needed.
// • Mesh is ideal for team meetings up to ~8–10 people. For larger rooms, swap this engine for an
//   SFU (LiveKit / Jitsi Videobridge / mediasoup) behind the same public API.
import type { RealtimeChannel } from '../data/backend';
import { blackVideoTrack, getCameraTrack, getMicTrack, silentAudioTrack } from './media';

export interface PeerState {
  peerId: string;
  userId: string;
  name: string;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  hand: boolean;
  rec: boolean;
  joinedAt: number;
}

export interface RemotePeer extends PeerState {
  stream: MediaStream | null;
  conn: RTCPeerConnectionState | 'waiting';
}

export type EngineMessage = Record<string, unknown> & { type: string; from?: string };

interface Conn {
  pc: RTCPeerConnection;
  initiator: boolean;
  pending: RTCIceCandidateInit[];
  stream: MediaStream | null;
  audio?: RTCRtpSender;
  video?: RTCRtpSender;
}

type Listener<T> = (v: T) => void;

export class MeshEngine {
  readonly self: PeerState;
  /** Stream for the local preview tile (camera or screen; never the placeholder). */
  localStream: MediaStream = new MediaStream();
  micTrack: MediaStreamTrack | null = null;
  private camTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private placeholderVideo: MediaStreamTrack | null = null;
  private placeholderAudio: MediaStreamTrack | null = null;
  private sendStream = new MediaStream();
  private conns = new Map<string, Conn>();
  private presence = new Map<string, PeerState>();
  private peersCbs = new Set<Listener<RemotePeer[]>>();
  private msgCbs = new Set<Listener<{ from: PeerState | undefined; msg: EngineMessage }>>();
  private localCbs = new Set<Listener<void>>();
  private closed = false;
  devices: { mic: string | null; cam: string | null } = { mic: null, cam: null };

  constructor(private channel: RealtimeChannel, self: Omit<PeerState, 'mic' | 'cam' | 'screen' | 'hand' | 'rec' | 'joinedAt'>, private ice: RTCIceServer[]) {
    this.self = { ...self, mic: false, cam: false, screen: false, hand: false, rec: false, joinedAt: Date.now() };
  }

  // ── events ──────────────────────────────────────────────────────────────
  onPeers(cb: Listener<RemotePeer[]>) { this.peersCbs.add(cb); return () => void this.peersCbs.delete(cb); }
  onMessage(cb: Listener<{ from: PeerState | undefined; msg: EngineMessage }>) { this.msgCbs.add(cb); return () => void this.msgCbs.delete(cb); }
  onLocal(cb: Listener<void>) { this.localCbs.add(cb); return () => void this.localCbs.delete(cb); }

  peers(): RemotePeer[] {
    return [...this.presence.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => {
        const c = this.conns.get(p.peerId);
        return { ...p, stream: c?.stream ?? null, conn: c ? c.pc.connectionState : 'waiting' };
      });
  }

  private emitPeers() { const list = this.peers(); this.peersCbs.forEach((cb) => cb(list)); }
  private emitLocal() { this.localCbs.forEach((cb) => cb()); }

  // ── lifecycle ───────────────────────────────────────────────────────────
  /** Acquire media. Failures are reported but never block joining (placeholders keep senders alive). */
  async init(opts: { mic: boolean; cam: boolean; micId?: string | null; camId?: string | null }) {
    const errors: unknown[] = [];
    this.devices = { mic: opts.micId ?? null, cam: opts.camId ?? null };
    try {
      this.micTrack = await getMicTrack(opts.micId);
      this.micTrack.enabled = opts.mic;
      this.self.mic = opts.mic;
    } catch (e) {
      errors.push(e);
    }
    if (opts.cam) {
      try {
        this.camTrack = await getCameraTrack(opts.camId);
        this.self.cam = true;
      } catch (e) {
        errors.push(e);
      }
    }
    this.placeholderVideo = blackVideoTrack();
    if (!this.micTrack) this.placeholderAudio = silentAudioTrack();
    this.rebuildLocal();
    return errors;
  }

  async connect() {
    this.channel.onPresence((members) => {
      if (this.closed) return;
      const next = new Map<string, PeerState>();
      members.forEach(({ state }) => {
        const s = state as unknown as PeerState;
        if (s?.peerId && s.peerId !== this.self.peerId) next.set(s.peerId, s);
      });
      for (const id of this.presence.keys()) if (!next.has(id)) this.closeConn(id);
      this.presence = next;
      for (const id of next.keys()) if (!this.conns.has(id) && this.self.peerId < id) void this.call(id);
      this.adaptBitrate();
      this.emitPeers();
    });
    this.channel.onMessage((raw) => {
      if (this.closed) return;
      const msg = raw as EngineMessage;
      if (msg.from === this.self.peerId) return;
      if (msg.to && msg.to !== this.self.peerId && msg.to !== this.self.userId) return;
      if (msg.type === 'signal') return void this.onSignal(msg.from as string, msg);
      this.msgCbs.forEach((cb) => cb({ from: this.presence.get(msg.from as string), msg }));
    });
    await this.channel.subscribe();
    this.publish();
  }

  leave() {
    if (this.closed) return;
    this.closed = true;
    this.conns.forEach((_, id) => this.closeConn(id));
    [this.micTrack, this.camTrack, this.screenTrack, this.placeholderVideo, this.placeholderAudio].forEach((t) => t?.stop());
    this.channel.unsubscribe();
    this.peersCbs.clear();
    this.msgCbs.clear();
    this.localCbs.clear();
  }

  // ── signaling ───────────────────────────────────────────────────────────
  private send(msg: EngineMessage) {
    this.channel.send({ ...msg, from: this.self.peerId });
  }

  private signal(to: string, data: { sdp?: RTCSessionDescriptionInit | null; candidate?: RTCIceCandidateInit }) {
    this.send({ type: 'signal', to, ...data });
  }

  private createConn(peerId: string, initiator: boolean): Conn {
    this.closeConn(peerId);
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: 'max-bundle' });
    const c: Conn = { pc, initiator, pending: [], stream: null };
    pc.onicecandidate = (e) => e.candidate && this.signal(peerId, { candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      if (e.streams[0]) c.stream = e.streams[0];
      else {
        c.stream ??= new MediaStream();
        c.stream.addTrack(e.track);
      }
      this.emitPeers();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.adaptBitrate();
      // Recover from network changes: the offerer rebuilds the connection.
      if (pc.connectionState === 'failed' && c.initiator && this.presence.has(peerId)) setTimeout(() => this.conns.get(peerId) === c && void this.call(peerId), 1000);
      this.emitPeers();
    };
    this.conns.set(peerId, c);
    return c;
  }

  private addSenders(c: Conn) {
    c.audio = c.pc.addTrack(this.audioOut(), this.sendStream);
    c.video = c.pc.addTrack(this.videoOut(), this.sendStream);
  }

  private async call(peerId: string) {
    const c = this.createConn(peerId, true);
    this.addSenders(c);
    try {
      await c.pc.setLocalDescription(await c.pc.createOffer());
      this.signal(peerId, { sdp: c.pc.localDescription?.toJSON() });
    } catch (e) {
      console.warn('[rtc] offer failed', e);
    }
    this.emitPeers();
  }

  private async onSignal(from: string, msg: EngineMessage) {
    const sdp = msg.sdp as RTCSessionDescriptionInit | undefined;
    const candidate = msg.candidate as RTCIceCandidateInit | undefined;
    let c = this.conns.get(from);
    try {
      if (sdp?.type === 'offer') {
        // A new offer always starts a fresh session (first contact, reconnect or peer rebuilt).
        if (!c || c.initiator || c.pc.remoteDescription) {
          const early = c && !c.pc.remoteDescription ? c.pending : [];
          c = this.createConn(from, false);
          c.pending.push(...early);
        }
        await c.pc.setRemoteDescription(sdp);
        this.addSenders(c); // reuses the transceivers created by the offer
        await c.pc.setLocalDescription(await c.pc.createAnswer());
        this.signal(from, { sdp: c.pc.localDescription?.toJSON() });
        await this.flush(c);
      } else if (sdp?.type === 'answer' && c && c.pc.signalingState === 'have-local-offer') {
        await c.pc.setRemoteDescription(sdp);
        await this.flush(c);
      } else if (candidate) {
        if (!c) c = this.createConn(from, false); // candidate raced ahead of the offer
        if (c.pc.remoteDescription) await c.pc.addIceCandidate(candidate).catch(() => undefined);
        else c.pending.push(candidate);
      }
    } catch (e) {
      console.warn('[rtc] signaling error', e);
    }
    this.emitPeers();
  }

  private async flush(c: Conn) {
    const list = c.pending.splice(0);
    for (const cand of list) await c.pc.addIceCandidate(cand).catch(() => undefined);
  }

  private closeConn(peerId: string) {
    const c = this.conns.get(peerId);
    if (!c) return;
    c.pc.onicecandidate = c.pc.ontrack = c.pc.onconnectionstatechange = null;
    c.pc.close();
    this.conns.delete(peerId);
  }

  // ── tracks ──────────────────────────────────────────────────────────────
  private audioOut() {
    return this.micTrack ?? this.placeholderAudio ?? (this.placeholderAudio = silentAudioTrack());
  }

  private videoOut() {
    return this.screenTrack ?? (this.self.cam ? this.camTrack : null) ?? this.placeholderVideo ?? (this.placeholderVideo = blackVideoTrack());
  }

  private rebuildLocal() {
    const v = this.screenTrack ?? (this.self.cam ? this.camTrack : null);
    this.localStream = new MediaStream([...(v ? [v] : []), ...(this.micTrack ? [this.micTrack] : [])]);
    this.emitLocal();
  }

  private async replace(kind: 'audio' | 'video') {
    const track = kind === 'audio' ? this.audioOut() : this.videoOut();
    await Promise.all([...this.conns.values()].map((c) => c[kind]?.replaceTrack(track).catch(() => undefined)));
    if (kind === 'video') this.adaptBitrate();
  }

  /** Lower per-peer video bitrate as the mesh grows; boost while screen sharing. */
  private adaptBitrate() {
    const n = this.presence.size;
    const max = this.screenTrack ? 1_500_000 : n <= 1 ? 1_000_000 : n <= 3 ? 600_000 : n <= 6 ? 350_000 : 220_000;
    this.conns.forEach((c) => {
      if (!c.video) return;
      try {
        const p = c.video.getParameters();
        if (!p.encodings?.length) return;
        p.encodings[0]!.maxBitrate = max;
        void c.video.setParameters(p).catch(() => undefined);
      } catch {
        /* not negotiated yet */
      }
    });
  }

  private publish() {
    this.channel.track({ ...this.self });
  }

  async setMic(on: boolean) {
    if (on && !this.micTrack) {
      this.micTrack = await getMicTrack(this.devices.mic);
      await this.replace('audio');
      this.placeholderAudio?.stop();
      this.placeholderAudio = null;
    }
    if (this.micTrack) this.micTrack.enabled = on;
    this.self.mic = on && !!this.micTrack;
    this.rebuildLocal();
    this.publish();
  }

  async setCam(on: boolean) {
    if (on) {
      this.camTrack ??= await getCameraTrack(this.devices.cam);
    } else {
      this.camTrack?.stop(); // release the camera (privacy light off)
      this.camTrack = null;
    }
    this.self.cam = on;
    await this.replace('video');
    this.rebuildLocal();
    this.publish();
  }

  async switchDevice(kind: 'mic' | 'cam', deviceId: string) {
    this.devices[kind] = deviceId;
    if (kind === 'mic') {
      const enabled = this.self.mic;
      const old = this.micTrack;
      this.micTrack = await getMicTrack(deviceId);
      this.micTrack.enabled = enabled;
      old?.stop();
      await this.replace('audio');
    } else if (this.self.cam) {
      this.camTrack?.stop();
      this.camTrack = await getCameraTrack(deviceId);
      await this.replace('video');
    }
    this.rebuildLocal();
  }

  async startScreenShare() {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    this.screenTrack = s.getVideoTracks()[0]!;
    this.screenTrack.contentHint = 'detail';
    this.screenTrack.onended = () => void this.stopScreenShare();
    this.self.screen = true;
    await this.replace('video');
    this.rebuildLocal();
    this.publish();
  }

  async stopScreenShare() {
    if (!this.screenTrack) return;
    this.screenTrack.onended = null;
    this.screenTrack.stop();
    this.screenTrack = null;
    this.self.screen = false;
    await this.replace('video');
    this.rebuildLocal();
    this.publish();
  }

  setHand(up: boolean) {
    this.self.hand = up;
    this.publish();
  }

  setRecording(on: boolean) {
    this.self.rec = on;
    this.publish();
  }

  /** App-level message to everyone (or one user/peer via `to`). */
  broadcast(msg: EngineMessage) {
    this.send(msg);
  }
}
