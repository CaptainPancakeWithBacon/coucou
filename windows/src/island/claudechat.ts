// A regular Claude Desktop chat runs no hook: the Windows watcher (claude_chat.rs)
// tells the island when a reply it was waiting for is ready (Mac #686). Mochi jumps,
// the finish sound plays and the Claude Desktop pill says so.

import { onEvent } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { t } from "../i18n/i18n";
import type { Island } from "./island";

const CLAUDE_DESKTOP_ID = "agent_claude-desktop";

export function registerClaudeChatHandlers(island: Island) {
  void onEvent<null>("claude-reply-ready", () => replyReady(island));
}

export function replyReady(island: Pick<Island, "emote">) {
  if (State.paused) return;
  island.emote("happy");
  if (State.settings.soundEnabled) Sound.play("finish");
  const task = State.tasks.find((x) => x.id === CLAUDE_DESKTOP_ID);
  if (!task) return;
  task.steps = [t("Reply ready")];
  State.setPillBadge(CLAUDE_DESKTOP_ID, "finished");
}
