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
const NUDGE = 0.15;
/** Estimates this close to the tempo in use are blended in; farther ones replace it. */
const PHASE_TOLERANCE = 0.14;
const MIN_CONFIDENCE = 2.5;
const LOCK_REPORTS = 4;
/** After an audio dropout, the old phase is no longer a useful reference. */
const RELOCK_AFTER_MS = 1500;
/** A real song/tempo change must not spend several updates dancing off-beat. */
const NEW_TEMPO = 0.12;

let knownBpm: number | null = null;
let detectedBpm: number | null = null;
let lastAudioAt: number | null = null;
let phaseCandidate: number | null = null;
let phaseConfirmations = 0;

export function beatDiagnostics(nowMs: number = Date.now()) {
  const fresh = lastAudioAt != null && nowMs - lastAudioAt < 3500;
  const locked = fed && fresh;
  return {
    detectedBpm: fresh ? detectedBpm : null,
    databaseBpm: knownBpm,
    danceBpm: knownBpm ?? DEFAULT_BPM,
    phaseLocked: locked,
    lastAudioAt,
    waiting,
  };
}

/** A trusted track BPM governs speed; live audio only supplies beat phase. */
export function setTrackBpm(value: number | null): void {
  const next = value != null && Number.isFinite(value) && value >= 40 && value <= 220 ? value : null;
  if (next === knownBpm) return;
  knownBpm = next;
  // A new verified tempo invalidates any beat phase from the old song/tempo.
  fed = false;
  phaseCandidate = null;
  phaseConfirmations = 0;
  bpm = next ?? DEFAULT_BPM;
}

let fed = false;
let waiting = false;
let bpm = DEFAULT_BPM;
/** Beats counted at `t0` (ms). */
let phase0 = 0;
let t0 = 0;

/** Beats since the clock started, as a continuous count: whole numbers are beats. */
export function beatPosition(nowMs: number): number {
  const tempo = knownBpm ?? DEFAULT_BPM;
  // Never let unverified audio choose Mochi's speed. Use a fixed, smooth clock
  // unless beat phase was independently confirmed at the verified tempo.
  if (!fed || lastAudioAt == null || nowMs - lastAudioAt > 3500)
    return (nowMs / 60000) * tempo;
  return phase0 + ((nowMs - t0) / 60000) * tempo;
}

function wrapHalf(x: number): number {
  return x - Math.round(x);
}

/** Audio events can establish *phase*, but never set song BPM. */
export function feedBeat(msg: BeatMessage, nowMs: number = Date.now()): void {
  if (!(msg.bpm > 0) || !Number.isFinite(msg.bpm) || !Number.isFinite(msg.beatAtMs) ||
      !Number.isFinite(nowMs) || msg.beatAtMs > nowMs + 1000) return;
  detectedBpm = msg.bpm;
  lastAudioAt = nowMs;
  const tempo = knownBpm;
  // Without verified per-track BPM, the detector is diagnostic only.
  if (tempo == null || (msg.confidence ?? 0) < MIN_CONFIDENCE ||
      Math.abs(msg.bpm - tempo) / tempo > 0.03) {
    fed = false;
    phaseCandidate = null;
    phaseConfirmations = 0;
    return;
  }

  const phase = ((nowMs - msg.beatAtMs) / 60000) * tempo;
  if (phaseCandidate == null || Math.abs(wrapHalf(phase - phaseCandidate)) > PHASE_TOLERANCE) {
    phaseCandidate = phase;
    phaseConfirmations = 1;
    fed = false;
    return;
  }
  phaseCandidate += NUDGE * wrapHalf(phase - phaseCandidate);
  phaseConfirmations = Math.min(LOCK_REPORTS, phaseConfirmations + 1);
  if (phaseConfirmations < LOCK_REPORTS) return;

  if (!fed) {
    phase0 = phaseCandidate;
    t0 = nowMs;
    fed = true;
    return;
  }
  const current = beatPosition(nowMs);
  phase0 = current + NUDGE * wrapHalf(phase - current);
  t0 = nowMs;
}

/** Back to the fixed bounce: the music stopped, or the listening did. */
export function resetBeat(waitForMusic: boolean = false): void {
  fed = false;
  knownBpm = null;
  phaseCandidate = null;
  phaseConfirmations = 0;
  detectedBpm = null;
  lastAudioAt = null;
  waiting = waitForMusic;
  bpm = DEFAULT_BPM;
}

export function currentBpm(): number {
  return knownBpm ?? DEFAULT_BPM;
}

/**
 * How big the dance is at the tempo in use (0…1): a fast song gets smaller hops
 * so one hop per beat does not look frantic. The fixed bounce stays full size.
 */
export function danceCalm(nowMs: number = Date.now()): number {
  // A failed or silent capture must not freeze Mochi. Fall back to a steady
  // 112 BPM Mac-style dance, or the database tempo if one is available.
  if (!fed || lastAudioAt == null || nowMs - lastAudioAt > 3500) return 1;
  return Math.min(1, Math.max(0.55, 1 - ((knownBpm ?? DEFAULT_BPM) - 100) / 45));
}
