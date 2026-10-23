// The island's background colour: black by default, a dark tint of the accent
// colour, or a custom pick, never light enough to hide Mochi or the text.

import { test } from "node:test";
import assert from "node:assert/strict";

const { islandPalette, parseHex, brightness } = await import("../src/core/islandcolor.ts");

test("black, or no colour to go on, is the plain island", () => {
  assert.equal(islandPalette("black", "#ffffff", "#ff0000"), null);
  assert.equal(islandPalette(undefined, "#ffffff", "#ff0000"), null);
  assert.equal(islandPalette("system", "#ffffff", null), null);
  assert.equal(islandPalette("system", "#ffffff", "not a colour"), null);
  assert.equal(islandPalette("custom", "red", null), null);
});

test("match system gives a dark tint of the accent", () => {
  const p = islandPalette("system", "", "#3584e4");
  assert.ok(brightness(p.island) < 0.15);
  const [r, , b] = parseHex(p.island);
  assert.ok(b > r, "a blue accent tints blue");
});

test("a bright custom colour is held dark; a dark one stays as picked", () => {
  for (const c of ["#ffffff", "#ffff00", "#f4505e"]) {
    assert.ok(brightness(islandPalette("custom", c, null).island) < 0.2, c);
  }
  assert.equal(islandPalette("custom", "#101828", null).island, "#101828");
});

test("the cards sit a little lighter than the island, and stay below the text", () => {
  const p = islandPalette("custom", "#ffffff", null);
  assert.ok(brightness(p.cardFlat) > brightness(p.island));
  assert.ok(brightness(p.tabOn) > brightness(p.card));
  assert.ok(brightness(p.tabOn) < 0.45);
});
