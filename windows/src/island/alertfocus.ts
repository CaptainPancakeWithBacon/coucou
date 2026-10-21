// "Open for every pill's alerts" (Mac #683): a pill other than the one shown that
// finishes or fails takes the focus for its card, and the pill that was shown comes
// back when the island closes. Never over an approval, a question or a card the user
// is busy in (chat, settings…).

import { State } from "../core/state";

/** The views where an alert may take over: the user is not typing or choosing in them. */
const OPEN_FOR_ALERTS = new Set(["overview", "finished", "error", "empty"]);

let before: string | null = null;
let borrowed: string | null = null;

/** Whether a finish or an error of `pill` opens the island. The shown pill always does. */
export function showsAlert(pill: string, focused: boolean): boolean {
  if (focused) return true;
  if (!State.settings.alertsFromAllPills || State.pendingApproval) return false;
  if (State.mode === "expanded" && !OPEN_FOR_ALERTS.has(State.view)) return false;
  if (before === null) before = State.focusId;
  borrowed = pill;
  State.setFocus(pill);
  return true;
}

/** The island closed: the pill that was shown before the alert comes back. */
export function restoreAlertFocus() {
  const prev = before;
  const lent = borrowed;
  before = null;
  borrowed = null;
  if (!prev || State.pendingApproval) return;
  // Only if the alert's pill is still the one shown (the user may have picked another).
  if (State.focusId !== lent || lent === prev || !State.tasks.some((t) => t.id === prev)) return;
  State.setFocus(prev);
}
