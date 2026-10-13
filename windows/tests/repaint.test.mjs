import { test } from "node:test";
import assert from "node:assert/strict";
import { foldedFrom } from "../src/island/repaint.ts";

test("only leaving the open island counts as a fold", () => {
  assert.equal(foldedFrom("expanded", "compact"), true);
  assert.equal(foldedFrom("expanded", "hidden"), true);
  assert.equal(foldedFrom("compact", "expanded"), false);
  assert.equal(foldedFrom("compact", "hidden"), false);
  assert.equal(foldedFrom("expanded", "expanded"), false);
});
