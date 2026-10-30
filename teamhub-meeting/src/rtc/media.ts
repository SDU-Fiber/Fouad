// Media helpers: device capture, placeholder tracks, ICE configuration.

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turn) servers.push({ urls: turn, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL });
  return servers;
}

let audioCtx: AudioContext | null = null;
/** Shared AudioContext (level meters, placeholder audio, recording mix). */
export function getAudioContext() {
  audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

export async function getCameraTrack(deviceId?: string | null) {
  const s = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: deviceId ? undefined : 'user' },
  });
  return s.getVideoTracks()[0]!;
}

export async function getMicTrack(deviceId?: string | null) {
  const s = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return s.getAudioTracks()[0]!;
}

/** Black video track used until the camera is turned on — keeps a video sender in every connection. */
export function blackVideoTrack(): MediaStreamTrack {
  const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 320, 180);
  const track = canvas.captureStream(1).getVideoTracks()[0]!;
  return track;
}

/** Silent audio track used when no microphone is available. */
export function silentAudioTrack(): MediaStreamTrack {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const dest = ctx.createMediaStreamDestination();
  osc.connect(gain).connect(dest);
  osc.start();
  return dest.stream.getAudioTracks()[0]!;
}

export interface DeviceLists {
  audioIn: MediaDeviceInfo[];
  videoIn: MediaDeviceInfo[];
  audioOut: MediaDeviceInfo[];
}

export async function listDevices(): Promise<DeviceLists> {
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  return {
    audioIn: all.filter((d) => d.kind === 'audioinput' && d.deviceId),
    videoIn: all.filter((d) => d.kind === 'videoinput' && d.deviceId),
    audioOut: all.filter((d) => d.kind === 'audiooutput' && d.deviceId),
  };
}

export const canShareScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;
export const canPickSpeaker = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

export function mediaError(e: unknown, what: string): string {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return `${what} permission was blocked. Allow it in your browser's site settings.`;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `No ${what.toLowerCase()} found on this device.`;
  if (name === 'NotReadableError') return `${what} is being used by another application.`;
  if (!window.isSecureContext) return 'Camera and microphone need HTTPS (or localhost).';
  return `Could not start ${what.toLowerCase()}.`;
}
