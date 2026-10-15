// The beat Mochi dances to. beat.rs sends the tempo and the moment of one beat
// about four times a second; the clock below keeps counting beats between those
// messages and eases toward each new one, so a rough estimate never makes him
// jump. Without any (the setting is off, nothing is heard) it counts 112 BPM
// from the wall clock, the Mac's fixed bounce.

export const DEFAULT_BPM = 112;

export interface BeatMessage {
  bpm: number;
  /** Unix time in ms of one beat; the others follow every 60000 / bpm. */
  beatAtMs: number;
  confidence?: number;
}

/** How much of the gap to a new estimate is closed at once. */
const NUDGE = 0.3;
/** Estimates this close to the tempo in use are blended in; farther ones replace it. */
const SAME_TEMPO = 0.06;
/** After an audio dropout, the old phase is no longer a useful reference. */
const RELOCK_AFTER_MS = 1500;
/** A real song/tempo change must not spend several updates dancing off-beat. */
const NEW_TEMPO = 0.12;

let knownBpm: number | null = null;
let detectedBpm: number | null = null;
let lastAudioAt: number | null = null;

export function beatDiagnostics(nowMs: number = Date.now()) {
  const fresh = lastAudioAt != null && nowMs - lastAudioAt < 3500;
  const locked = fed && fresh;
  return {
    detectedBpm,
    databaseBpm: knownBpm,
    danceBpm: locked ? bpm : (knownBpm ?? DEFAULT_BPM),
    phaseLocked: locked,
    lastAudioAt,
    waiting,
  };
}

/** A trusted track BPM governs speed; live audio only supplies beat phase. */
export function setTrackBpm(value: number | null): void {
  knownBpm = value != null && Number.isFinite(value) && value >= 40 && value <= 220 ? value : null;
  if (knownBpm != null && fed) {
    const at = Date.now();
    phase0 = beatPosition(at);
    t0 = at;
    bpm = knownBpm;
  }
}

let fed = false;
let waiting = false;
let bpm = DEFAULT_BPM;
/** Beats counted at `t0` (ms). */
let phase0 = 0;
let t0 = 0;

/** Beats since the clock started, as a continuous count: whole numbers are beats. */
export function beatPosition(nowMs: number): number {
  if (!fed) return (nowMs / 1000) * (knownBpm ?? DEFAULT_BPM) / 60;
  if (lastAudioAt != null && nowMs - lastAudioAt > 3500) {
    // On a lost capture stream, never keep hopping at an unverified old tempo.
    // Use the same wall-clock anchor as the Mac fallback instead.
    return (nowMs / 1000) * (knownBpm ?? DEFAULT_BPM) / 60;
  }
  return phase0 + ((nowMs - t0) / 60000) * bpm;
}

function wrapHalf(x: number): number {
  return x - Math.round(x);
}

/** A new estimate from the listener. */
export function feedBeat(msg: BeatMessage, nowMs: number = Date.now()): void {
  if (!(msg.bpm > 0) || !Number.isFinite(msg.bpm) || !Number.isFinite(msg.beatAtMs) ||
      !Number.isFinite(nowMs) || msg.beatAtMs > nowMs + 1000) return;
  detectedBpm = msg.bpm;
  lastAudioAt = nowMs;
  // A database BPM is not a beat-grid: use the audio event as a phase anchor.
  // Reject incompatible detected tempos rather than moving to a false beat.
  const chosen = knownBpm ?? msg.bpm;
  const ratios = [1, 2, 0.5];
  if (knownBpm != null && !ratios.some(r => Math.abs(msg.bpm * r - knownBpm!) / knownBpm! < 0.08)) return;
  const targetFrac = ((nowMs - msg.beatAtMs) / 60000) * chosen;
  if (!fed || nowMs - t0 > RELOCK_AFTER_MS || Math.abs(chosen - bpm) / bpm >= NEW_TEMPO) {
    fed = true;
    bpm = chosen;
    phase0 = targetFrac;
    t0 = nowMs;
    return;
  }
  const current = beatPosition(nowMs);
  const err = wrapHalf(targetFrac - current);
  bpm = knownBpm ?? (Math.abs(chosen - bpm) / bpm < SAME_TEMPO ? bpm + 0.5 * (chosen - bpm) : chosen);
  phase0 = current + NUDGE * err;
  t0 = nowMs;
}

/** Back to the fixed bounce: the music stopped, or the listening did. */
export function resetBeat(waitForMusic: boolean = false): void {
  fed = false;
  knownBpm = null;
  detectedBpm = null;
  lastAudioAt = null;
  waiting = waitForMusic;
  bpm = DEFAULT_BPM;
}

export function currentBpm(): number {
  return bpm;
}

/**
 * How big the dance is at the tempo in use (0…1): a fast song gets smaller hops
 * so one hop per beat does not look frantic. The fixed bounce stays full size.
 */
export function danceCalm(nowMs: number = Date.now()): number {
  // A failed or silent capture must not freeze Mochi. Fall back to a steady
  // 112 BPM Mac-style dance, or the database tempo if one is available.
  if (!fed || lastAudioAt == null || nowMs - lastAudioAt > 3500) return 1;
  return Math.min(1, Math.max(0.55, 1 - (bpm - 100) / 45));
}
