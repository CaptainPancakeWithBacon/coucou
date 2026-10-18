import type { DiffHunk, FileDiff } from "./diff";

/** Codex apply_patch format, without reading files or guessing their contents. */
export function patchDiffs(patch: string): FileDiff[] {
  if (patch.length > 512 * 1024) return [];
  const lines = patch.replace(/\r\n/g, "\n").trimEnd().split("\n");
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") return [];
  const result: FileDiff[] = [];
  let file: FileDiff | null = null, hunk: DiffHunk | null = null;
  let oldLine = 1, newLine = 1;
  for (const line of lines.slice(1, -1)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header) {
      file = { id: 0, path: header[2], added: 0, removed: 0, hunks: [],
        tooLarge: false, isNewFile: header[1] === "Add", unavailable: header[1] === "Delete" };
      result.push(file);
      hunk = null;
      oldLine = newLine = 1;
    } else if (!file) {
      return [];
    } else if (line.startsWith("*** Move to: ")) {
      file.path = line.slice(13);
    } else if (line === "@@" || line.startsWith("@@ ")) {
      hunk = null;
    } else if (line === "*** End of File") {
      continue;
    } else if (/^[ +\-]/.test(line)) {
      hunk ??= { origStart: oldLine, newStart: newLine, lines: [] };
      if (!file.hunks.includes(hunk)) file.hunks.push(hunk);
      const kind = line[0] === "+" ? "added" : line[0] === "-" ? "removed" : "context";
      hunk.lines.push({ kind, text: line.slice(1), origLine: kind === "added" ? -1 : oldLine++,
        newLine: kind === "removed" ? -1 : newLine++ });
      if (kind === "added") file.added++;
      if (kind === "removed") file.removed++;
    } else {
      return []; // Never display partial/malformed patches as successful changes.
    }
  }
  for (const file of result) {
    if (file.hunks.reduce((n, h) => n + h.lines.length, 0) > 4000 ||
        new TextEncoder().encode(file.hunks.flatMap(h => h.lines.map(l => l.text)).join("\n")).length > 200 * 1024) {
      file.tooLarge = true;
      file.hunks = [];
    }
  }
  return result.filter(f => f.added || f.removed || f.unavailable);
}
