import type { PillState } from "../core/flow";

/** A preloaded WebView must remain empty until there is something to show. */
export function syncPillVisibility(root: HTMLElement, state: PillState): boolean {
  const visible = state.enabled || state.noteStartedAt != null ||
    state.announcement != null || state.voice != null || state.phase !== "idle";
  root.hidden = !visible;
  if (!visible) root.replaceChildren();
  return visible;
}
