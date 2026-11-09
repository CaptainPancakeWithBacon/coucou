/** rAF can be withheld by transparent non-activating WebView2 windows.
 * Race it against a bounded fallback; exactly one callback owns each frame. */
export function responsiveFrame(callback: (now: number) => void): () => void {
  let done = false;
  const run = (now: number) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    callback(now);
  };
  const raf = requestAnimationFrame(run);
  const timer = window.setTimeout(() => run(performance.now()), 32);
  return () => { done = true; cancelAnimationFrame(raf); window.clearTimeout(timer); };
}

// ── How often to draw ──────────────────────────────────────────────────────────
// The island is a window WebKit paints in software, and it stays visible. Drawing it at the display rate for ever, because Mochi
// breathes or dances, costs about half a core. Motion that is on its way somewhere needs every frame; a loop does not.

/** What a loop needs: every frame ("full"), about 30 a second ("smooth": dancing, bounces, scrolling text), about 15 ("ambient": breathing,
 * sleeping z's), about 8 ("slow": a loop while the laptop is in power-saver) or none at all ("none"). */
export type Pace = "full" | "smooth" | "ambient" | "slow" | "none";

/** Milliseconds between frames; full speed has no wait of its own. */
export const PACE_MS = { full: 0, smooth: 33, ambient: 66, slow: 125 } as const;

const RANK: Record<Pace, number> = { none: 0, slow: 1, ambient: 2, smooth: 3, full: 4 };

/** The most demanding of several paces: the loop runs at the speed of whatever needs it most. */
export function fastest(...paces: Pace[]): Pace {
  return paces.reduce<Pace>((best, pace) => (RANK[pace] > RANK[best] ? pace : best), "none");
}

/** Power-saver: a loop (dancing, breathing) draws about 8 frames a second. Motion on its way somewhere keeps every frame, or it would stutter. */
export function saverPace(pace: Pace, saver: boolean): Pace {
  return saver && (pace === "smooth" || pace === "ambient") ? "slow" : pace;
}

/** The longest time step a frame may simulate. A slower loop has longer gaps between frames; the old 50 ms limit would turn them into slow motion. */
export function maxDt(pace: Pace): number {
  const gap = pace === "full" || pace === "none" ? 0 : PACE_MS[pace];
  return Math.max(0.05, (gap * 1.5) / 1000);
}

/**
 * The next frame, no sooner than the pace allows after `lastFrameMs`. Full speed is `responsiveFrame`. A throttled loop is a plain
 * timer: it never waits for requestAnimationFrame (which a hidden or non-activating window may withhold) and it draws as soon as it is late.
 */
export function pacedFrame(callback: (now: number) => void, pace: Pace, lastFrameMs: number): () => void {
  if (pace === "full" || pace === "none") return responsiveFrame(callback);
  let done = false;
  const wait = Math.max(0, PACE_MS[pace] - (performance.now() - lastFrameMs));
  const timer = window.setTimeout(() => {
    if (done) return;
    done = true;
    callback(performance.now());
  }, wait);
  return () => { done = true; window.clearTimeout(timer); };
}
