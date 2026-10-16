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
