import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./fakedom.mjs";
import { buildSessionDetail } from "../src/views/session-detail.ts";
installFakeDom();

test("session history preserves exact text and opens even files no longer present in steps", () => {
  const command = 'Runs · npm test -- --run "src/long path/<script>.test.ts"';
  let opened = null, backed = false;
  const view = buildSessionDetail({ steps: [command] },
    [{ id: 42, path: "src/a.ts", added: 2, removed: 1 }], () => { backed = true; }, id => { opened = id; });
  assert.ok(view.textContent.includes(command));
  assert.ok(view.textContent.includes("src/a.ts"));
  view.querySelector(".session-history-file").fire("click");
  assert.equal(opened, 42);
  view.querySelector(".diff-back").fire("click");
  assert.equal(backed, true);
});

test("Codex and Claude use the same detail content, file actions and full command history", () => {
  const steps = ["Runs · cargo test --all", "Edits · src/mochi/accessory-parts.ts", "Done"];
  const files = [{ id: 8, path: "C:/Projects/Coucou/windows/src/mochi/accessory-parts.ts", added: 6, removed: 2 }];
  const views = ["agent_codex", "integration_claude"].map(id => buildSessionDetail({ id, steps }, files, () => {}, () => {}));
  assert.equal(views[0].textContent, views[1].textContent);
  for (const view of views) {
    const file = view.querySelector(".session-history-file");
    assert.equal(file.getAttribute("title"), files[0].path);
    assert.equal(file.getAttribute("aria-label"), files[0].path);
    assert.ok(file.textContent.startsWith("accessory-parts.ts"));
    assert.ok(view.textContent.includes(steps[0]));
  }
});
