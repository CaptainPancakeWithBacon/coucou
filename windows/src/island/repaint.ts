// A transparent window can keep pixels of the open island after it folds (the
// bigger Mochi stays painted at the left of the compact one). Touching the root's
// opacity makes the web view repaint the whole page, which clears them.

import type { IslandMode } from "../core/layout";

/** The island just stopped being fully open. */
export function foldedFrom(before: IslandMode, now: IslandMode): boolean {
  return before === "expanded" && now !== "expanded";
}

export function forceRepaint(): void {
  const root = document.documentElement;
  root.style.opacity = "0.999";
  requestAnimationFrame(() => { root.style.opacity = ""; });
}

/** Repaints twice after a fold: once as it settles, once when the animation is surely over. */
export function repaintAfterFold(): void {
  window.setTimeout(forceRepaint, 350);
  window.setTimeout(forceRepaint, 1000);
}
