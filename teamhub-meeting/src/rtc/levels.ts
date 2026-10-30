import { getAudioContext } from './media';

/** Audio level meter for many streams — drives active-speaker detection and the mic meter. */
export class LevelMeter {
  private nodes = new Map<string, { src: MediaStreamAudioSourceNode; analyser: AnalyserNode; trackId: string }>();
  private buf = new Uint8Array(512);

  /** Attach / refresh the stream measured under `key` (no-op if the audio track didn't change). */
  set(key: string, stream: MediaStream | null) {
    const track = stream?.getAudioTracks()[0];
    const cur = this.nodes.get(key);
    if (cur && cur.trackId === track?.id) return;
    this.remove(key);
    if (!stream || !track) return;
    try {
      const ctx = getAudioContext();
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this.nodes.set(key, { src, analyser, trackId: track.id });
    } catch {
      /* unsupported stream — ignore */
    }
  }

  remove(key: string) {
    const n = this.nodes.get(key);
    if (!n) return;
    n.src.disconnect();
    this.nodes.delete(key);
  }

  /** RMS level 0..1 */
  level(key: string): number {
    const n = this.nodes.get(key);
    if (!n) return 0;
    n.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.buf.length);
  }

  keys() {
    return [...this.nodes.keys()];
  }

  dispose() {
    [...this.nodes.keys()].forEach((k) => this.remove(k));
  }
}
