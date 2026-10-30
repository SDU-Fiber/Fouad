// Client-side meeting recorder: composites every visible tile onto a canvas and mixes all audio
// (local + remote) into one WebM/MP4 file via MediaRecorder. No server infrastructure required.
import { getAudioContext } from './media';

export interface RecordSource {
  video: HTMLVideoElement | null;
  name: string;
  showVideo: boolean;
  stream: MediaStream | null;
}

const MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export const canRecord = () => typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

export class MeetingRecorder {
  private canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
  private ctx = this.canvas.getContext('2d')!;
  private timer: ReturnType<typeof setInterval> | undefined;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private dest = getAudioContext().createMediaStreamDestination();
  private audioNodes = new Map<string, MediaStreamAudioSourceNode>();
  private startedAt = 0;
  readonly mime = MIME.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

  constructor(private sources: () => RecordSource[], private title: string) {}

  start() {
    this.startedAt = Date.now();
    this.draw();
    this.timer = setInterval(() => this.draw(), 1000 / 15);
    const stream = new MediaStream([...this.canvas.captureStream(15).getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    this.rec = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 1_200_000 } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }

  private syncAudio(list: RecordSource[]) {
    const ctx = getAudioContext();
    const live = new Set<string>();
    list.forEach((s) => {
      const track = s.stream?.getAudioTracks()[0];
      if (!track) return;
      live.add(track.id);
      if (this.audioNodes.has(track.id)) return;
      const node = ctx.createMediaStreamSource(new MediaStream([track]));
      node.connect(this.dest);
      this.audioNodes.set(track.id, node);
    });
    this.audioNodes.forEach((n, id) => {
      if (!live.has(id)) {
        n.disconnect();
        this.audioNodes.delete(id);
      }
    });
  }

  private draw() {
    const list = this.sources();
    this.syncAudio(list);
    const { ctx } = this;
    const W = 1280, H = 720, gap = 8, top = 40;
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText(this.title, 16, 27);
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath();
    ctx.arc(W - 70, 21, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText('REC', W - 58, 26);

    const n = Math.max(1, list.length);
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const tw = (W - gap * (cols + 1)) / cols;
    const th = (H - top - gap * (rows + 1)) / rows;
    list.forEach((s, i) => {
      const x = gap + (i % cols) * (tw + gap);
      const y = top + gap + Math.floor(i / cols) * (th + gap);
      ctx.fillStyle = '#1a1c21';
      ctx.fillRect(x, y, tw, th);
      const v = s.video;
      if (s.showVideo && v && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.max(tw / v.videoWidth, th / v.videoHeight);
        const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, tw, th);
        ctx.clip();
        ctx.drawImage(v, x + (tw - dw) / 2, y + (th - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#e60000';
        ctx.beginPath();
        ctx.arc(x + tw / 2, y + th / 2, Math.min(tw, th) / 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(Math.min(tw, th) / 8)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(), x + tw / 2, y + th / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(x + 8, y + th - 30, Math.min(tw - 16, ctx.measureText(s.name).width + 20), 22);
      ctx.fillStyle = '#fff';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(s.name, x + 18, y + th - 14);
    });
  }

  stop(): Promise<{ blob: Blob; durationSec: number; ext: string }> {
    clearInterval(this.timer);
    return new Promise((resolve) => {
      const done = () => {
        this.audioNodes.forEach((n) => n.disconnect());
        this.audioNodes.clear();
        const type = this.rec?.mimeType || this.mime || 'video/webm';
        resolve({ blob: new Blob(this.chunks, { type }), durationSec: Math.round((Date.now() - this.startedAt) / 1000), ext: type.includes('mp4') ? 'mp4' : 'webm' });
      };
      if (!this.rec || this.rec.state === 'inactive') return done();
      this.rec.onstop = done;
      this.rec.stop();
    });
  }
}
