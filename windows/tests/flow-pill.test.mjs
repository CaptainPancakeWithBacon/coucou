import { test } from "node:test";
import assert from "node:assert/strict";
import { syncPillVisibility } from "../src/pill/visibility.ts";

const idle = { phase: "idle", enabled: false, edge: "left", key: "right_ctrl",
  noteStartedAt: null, announcement: null, voice: null };
const root = () => ({ hidden: false, children: ["stale toolbar"],
  replaceChildren(...children) { this.children = children; } });

test("disabled dictation removes the toolbar even when its native window is on screen", () => {
  const el = root();
  assert.equal(syncPillVisibility(el, idle), false);
  assert.equal(el.hidden, true);
  assert.deepEqual(el.children, []);
});

test("turning dictation off hides an already visible toolbar", () => {
  const el = root();
  assert.equal(syncPillVisibility(el, { ...idle, enabled: true }), true);
  assert.equal(el.hidden, false);
  assert.equal(syncPillVisibility(el, idle), false);
  assert.equal(el.hidden, true);
});

test("explicit recording and voice activity can still display their controls", () => {
  for (const activity of [{ noteStartedAt: 123 }, { voice: { phase: "listening" } },
    { announcement: { text: "Done" } }, { phase: "thinking" }]) {
    const el = root();
    assert.equal(syncPillVisibility(el, { ...idle, ...activity }), true);
    assert.equal(el.hidden, false);
  }
});
