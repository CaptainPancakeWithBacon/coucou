// Desktop notifications (notifications.rs, Linux) → the island. They arrive as
// one "Notifications" pill: each one is a step on it, the island opens its card
// with the newest, and the pill you were on comes back a few seconds later.

import { Bridge, onEvent } from "../core/bridge";
import { toOneLine } from "../core/diff";
import { Sound } from "../core/sound";
import { State, type AgentTask } from "../core/state";
import type { Island } from "./island";

export const NOTIFICATIONS_ID = "agent_notifications";
const COLOR = "#5AC8FA";
/** How long the pill stays on screen before the previous one returns. */
const SHOWN_MS = 8000;

interface DesktopNotification {
  app: string;
  summary: string;
  body: string;
  target?: string | null;
}

/** The notification card's button: the app that sent the newest one. */
export function openNoticeTarget(task: AgentTask | null | undefined): boolean {
  if (task?.id !== NOTIFICATIONS_ID || !task.noticeTarget) return false;
  void Bridge.openNotificationTarget(task.noticeTarget);
  return true;
}

let restoreTimer: number | null = null;
let before: string | null = null;

/** "Discord: Anna — hey!" on one line. */
export function noticeLine(n: DesktopNotification): string {
  const head = n.app ? `${n.app}: ` : "";
  const text = n.summary && n.body ? `${n.summary} — ${n.body}` : n.summary || n.body;
  return toOneLine(`${head}${text}`);
}

export function registerNotificationHandlers(island: Island) {
  void onEvent<DesktopNotification>("desktop-notification", (n) => handle(island, n));
}

function handle(island: Island, n: DesktopNotification) {
  if (State.paused || !State.settings.showNotifications) return;
  const line = noticeLine(n);
  if (!line) return;
  State.upsertExternalAgent(NOTIFICATIONS_ID, "Notifications", COLOR);
  State.appendStep(NOTIFICATIONS_ID, line);
  const task = State.tasks.find((t) => t.id === NOTIFICATIONS_ID);
  if (task) {
    task.finalLine = line;
    task.noticeApp = n.app || null;
    task.noticeTarget = n.target || null;
  }
  State.updateTask(NOTIFICATIONS_ID, "finished");

  // A card waiting for an answer is never covered: the badge says it came.
  if (State.pendingApproval) {
    State.setPillBadge(NOTIFICATIONS_ID, "finished");
    return;
  }
  if (State.focusId !== NOTIFICATIONS_ID) before = State.focusId;
  State.setFocus(NOTIFICATIONS_ID);
  Sound.play("peek");
  // The compact island has no text: the card with the message opens, as it does
  // when Claude Code finishes.
  if (State.mode !== "expanded") island.alert("finished");

  if (restoreTimer != null) window.clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => {
    restoreTimer = null;
    State.updateTask(NOTIFICATIONS_ID, "idle");
    if (State.focusId === NOTIFICATIONS_ID && before && State.tasks.some((t) => t.id === before)) {
      State.setFocus(before);
    }
  }, SHOWN_MS);
}
