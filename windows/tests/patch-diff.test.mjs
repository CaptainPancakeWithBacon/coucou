import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFileDiffs } from "../src/core/diff.ts";

const patch = `*** Begin Patch
*** Update File: src/a.ts
@@
 context
-old
+new
+extra
*** Add File: src/b.ts
+hello
*** Update File: old.ts
*** Move to: new.ts
@@
-before
+after
*** Delete File: gone.ts
*** End Patch`;

test("Codex multi-file patches retain paths, moves, additions, deletions and changed lines", () => {
  const files = buildFileDiffs("apply_patch", { command: patch });
  assert.deepEqual(files.map(f => f.path), ["src/a.ts", "src/b.ts", "new.ts", "gone.ts"]);
  assert.deepEqual(files.map(f => [f.added, f.removed]), [[2, 1], [1, 0], [1, 1], [0, 0]]);
  assert.equal(files[1].isNewFile, true);
  assert.equal(files[3].unavailable, true);
  assert.deepEqual(files[0].hunks[0].lines.map(l => [l.kind, l.text]),
    [["context", "context"], ["removed", "old"], ["added", "new"], ["added", "extra"]]);
  assert.equal(buildFileDiffs("functions.apply_patch", { patch }).length, 4);
});

test("truncated and malformed patches never create believable partial diffs", () => {
  for (const input of [patch.slice(0, -15), patch.replace("+new", "invalid"), "ordinary command"]) {
    assert.deepEqual(buildFileDiffs("apply_patch", { command: input }), []);
  }
});

test("large valid patches keep counts without rendering oversized diffs", () => {
  const command = `*** Begin Patch\n*** Add File: big.txt\n${"+line\n".repeat(4100)}*** End Patch`;
  const [diff] = buildFileDiffs("apply_patch", { command });
  assert.equal(diff.added, 4100);
  assert.equal(diff.tooLarge, true);
  assert.deepEqual(diff.hunks, []);
});
