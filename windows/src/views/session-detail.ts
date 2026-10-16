import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { parseDiffStep, type FileDiff } from "../core/diff";
import type { AgentTask } from "../core/state";
import { tl } from "../i18n/i18n";

/** Scrollable history; complete commands and every retained file change. */
export function buildSessionDetail(task: AgentTask, files: FileDiff[], back: () => void,
  openDiff: (id: number) => void): HTMLElement {
  const rows = h("div", { class: "session-history-rows" });
  for (const file of [...files].reverse()) {
    rows.append(h("button", { class: "session-history-file", title: file.path,
      onclick: () => openDiff(file.id) },
    h("span", { text: file.path }),
    h("span", { class: "tick-count plus", text: `+${file.added}` }),
    h("span", { class: "tick-count minus", text: `−${file.removed}` })));
  }
  for (const step of [...task.steps].reverse()) {
    if (parseDiffStep(step)) continue; // Files above remain accessible after their step scrolls out.
    rows.append(h("div", { class: "session-history-step", text: step }));
  }
  return h("div", { class: "session-history" },
    h("div", { class: "diff-head" }, h("button", { class: "diff-back", title: tl("Back"), onclick: back },
      svg(ICONS.chevronLeft, 9, { stroke: 2.4 }), h("b", { text: tl("Details") }))), rows);
}
