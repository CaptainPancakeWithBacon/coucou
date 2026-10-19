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
