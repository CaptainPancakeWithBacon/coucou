// A playback clock locked to Spotify's isolated audio, including beat phase.
export const DEFAULT_BPM = 112;
export interface BeatMessage { bpm: number; beatAtMs: number; confidence?: number }
let waiting = false;
let fed = false;
let bpm = DEFAULT_BPM;
let phase0 = 0;
let t0 = 0;
let lastAudioAt: number | null = null;
let detectedBpm: number | null = null;
let candidate: { bpm: number; phase: number; at: number; count: number } | null = null;
let anchored = false;
const wrap = (v: number) => v - Math.round(v);
function useFallback(nowMs: number): void {
  if (!fed || lastAudioAt == null || nowMs - lastAudioAt < 2500) return;
  const at = lastAudioAt + 2500;
  phase0 += (at - t0) * bpm / 60000;
  t0 = at;
  bpm = DEFAULT_BPM;
  fed = false;
  anchored = true;
}
export function beatDiagnostics(nowMs: number = Date.now()) {
  useFallback(nowMs);
  const locked = fed && lastAudioAt != null && nowMs - lastAudioAt < 2500;
  return { detectedBpm, databaseBpm: null, danceBpm: bpm,
    phaseLocked: locked, lastAudioAt, waiting };
}
export function beatPosition(nowMs: number): number {
  useFallback(nowMs);
  if (!anchored) return nowMs * DEFAULT_BPM / 60000;
  return phase0 + (nowMs - t0) * bpm / 60000;
}
export function feedBeat(msg: BeatMessage, nowMs: number = Date.now()): void {
  if (!Number.isFinite(msg.bpm) || msg.bpm < 45 || msg.bpm > 240 ||
      !Number.isFinite(msg.beatAtMs) || !Number.isFinite(nowMs) ||
      msg.beatAtMs > nowMs + 100 || nowMs - msg.beatAtMs > 2500 ||
      (msg.confidence ?? 3) < 1.8) return;
  useFallback(nowMs);
  if (lastAudioAt != null && nowMs - lastAudioAt > 1500) candidate = null;
  detectedBpm = msg.bpm;
  lastAudioAt = nowMs;
  const phase = (nowMs - msg.beatAtMs) * msg.bpm / 60000;
  const predicted = candidate && candidate.phase + (nowMs - candidate.at) * candidate.bpm / 60000;
  if (!candidate || Math.abs(msg.bpm - candidate.bpm) / candidate.bpm > 0.05 ||
      predicted == null || Math.abs(wrap(phase - predicted)) > 0.18) {
    candidate = { bpm: msg.bpm, phase, at: nowMs, count: 1 };
    return;
  }
  candidate = { bpm: candidate.bpm * 0.65 + msg.bpm * 0.35,
    phase: predicted + 0.45 * wrap(phase - predicted), at: nowMs, count: candidate.count + 1 };
  if (candidate.count < 3) return;
  const current = beatPosition(nowMs);
  if (!fed || Math.abs(bpm - candidate.bpm) / bpm > 0.05) {
    bpm = candidate.bpm;
    phase0 = current + 0.45 * wrap(candidate.phase - current);
    fed = true;
  } else {
    phase0 = current + 0.45 * wrap(candidate.phase - current);
    bpm += 0.35 * (candidate.bpm - bpm);
  }
  t0 = nowMs;
  anchored = true;
}
/** Keep the measured tempo for a paused track without keeping stale phase data. */
export function pauseBeat(nowMs: number = Date.now()): void {
  const current = beatPosition(nowMs);
  phase0 = current;
  t0 = nowMs;
  anchored = true;
  fed = false;
  waiting = false;
  lastAudioAt = null;
  detectedBpm = null;
  candidate = null;
}

/** Resume at the remembered tempo immediately; audio may refine phase later. */
export function resumeBeat(nowMs: number = Date.now()): void {
  phase0 = beatPosition(nowMs);
  t0 = nowMs;
  anchored = true;
  fed = false;
  waiting = true;
  lastAudioAt = null;
  candidate = null;
}

export function resetBeat(waitForMusic = false, nowMs: number = Date.now()): void {
  const current = beatPosition(nowMs);
  waiting = waitForMusic;
  fed = false;
  bpm = DEFAULT_BPM;
  candidate = null;
  detectedBpm = null;
  lastAudioAt = null;
  phase0 = current;
  t0 = nowMs;
  anchored = true;
}
export function currentBpm(): number { return bpm; }
export function danceCalm(nowMs: number = Date.now()): number {
  useFallback(nowMs);
  if (!fed) return 1;
  return Math.min(1, Math.max(0.45, 1 - (bpm - 100) / 100));
}
