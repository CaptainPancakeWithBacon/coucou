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
let lockedAt = -Infinity;
let confirmedBpm = DEFAULT_BPM;
let previewing = false;
// Integrate a decaying speed correction: position and speed stay continuous.
let speedOffset = 0;
let phaseOffset = 0;
const SMOOTH_MS = 250;
function positionAt(nowMs: number): number {
  const elapsed = nowMs - t0;
  const eased = 1 - Math.exp(-Math.max(0, elapsed) / SMOOTH_MS);
  return phase0 + elapsed * bpm / 60000 + speedOffset * SMOOTH_MS / 60000 * eased +
    phaseOffset * (1 - (1 + Math.max(0, elapsed) / SMOOTH_MS) * (1 - eased));
}
function retarget(nowMs: number, nextBpm: number, correction = 0): void {
  // Phase alignment may only borrow 3% of the tempo between reports.
  // Otherwise a noisy beat timestamp sounds like a sudden tempo slowdown.
  const budget = lockedAt === -Infinity ? 0.5 :
    bpm * 0.03 * Math.min(250, Math.max(0, nowMs - t0)) / 60000;
  correction = Math.max(-budget, Math.min(budget, correction));
  const decay = Math.exp(-Math.max(0, nowMs - t0) / SMOOTH_MS);
  const speed = bpm + (speedOffset + phaseOffset * 60000 / SMOOTH_MS *
    Math.max(0, nowMs - t0) / SMOOTH_MS) * decay;
  phase0 = positionAt(nowMs);
  t0 = nowMs;
  bpm = nextBpm;
  phaseOffset = correction;
  speedOffset = speed - bpm;
}
const wrap = (v: number) => v - Math.round(v);
function useFallback(nowMs: number): void {
  if (!fed || lastAudioAt == null || nowMs - lastAudioAt < 2500) return;
  // Missing analysis is not evidence that the song changed tempo.
  // Only abandon an unfinished preview; keep the last confirmed rhythm.
  candidate = null;
  if (previewing) {
    retarget(nowMs, confirmedBpm);
    previewing = false;
    if (lockedAt === -Infinity) fed = false;
  }
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
  return positionAt(nowMs);
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
    if (previewing) retarget(nowMs, confirmedBpm);
    previewing = false;
    return;
  }
  candidate = { bpm: candidate.bpm * 0.65 + msg.bpm * 0.35,
    phase: predicted + 0.45 * wrap(phase - predicted), at: nowMs, count: candidate.count + 1 };
  if (candidate.count < 2) return;
  const current = beatPosition(nowMs);
  if (!fed || previewing || Math.abs(confirmedBpm - candidate.bpm) / confirmedBpm > 0.03) {
    if (nowMs - lockedAt < 10000) return;
    const count = candidate.count;
    if (count !== 2 && count !== 4 && count < 6) return;
    const weight = count >= 6 ? 1 : count >= 4 ? 0.65 : 0.25;
    retarget(nowMs, confirmedBpm + weight * (candidate.bpm - confirmedBpm),
      weight * wrap(candidate.phase - current));
    previewing = weight < 1;
    fed = true;
    if (!previewing) {
      confirmedBpm = bpm;
      lockedAt = nowMs;
    }
  } else {
    // Small detector jitter must not keep changing the selected tempo.
    retarget(nowMs, bpm, wrap(candidate.phase - current));
  }
  anchored = true;
}
/** Keep the measured tempo for a paused track without keeping stale phase data. */
export function pauseBeat(nowMs: number = Date.now()): void {
  const current = beatPosition(nowMs);
  phase0 = current;
  speedOffset = phaseOffset = 0;
  t0 = nowMs;
  anchored = true;
  fed = false;
  waiting = false;
  lastAudioAt = null;
  detectedBpm = null;
  candidate = null;
  confirmedBpm = bpm;
  previewing = false;
}

/** Resume at the remembered tempo immediately; audio may refine phase later. */
export function resumeBeat(nowMs: number = Date.now()): void {
  phase0 = beatPosition(nowMs);
  speedOffset = phaseOffset = 0;
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
  speedOffset = phaseOffset = 0;
  lockedAt = -Infinity;
  confirmedBpm = bpm;
  previewing = false;
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
