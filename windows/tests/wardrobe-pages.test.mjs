import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./fakedom.mjs";
import { State, DEFAULT_SETTINGS } from "../src/core/state.ts";
import { buildWardrobe } from "../src/views/wardrobe.ts";
import { LEAGUE_OUTFITS, OVERWATCH_OUTFITS, outfitVariants, parseOutfit, outfitAppearance } from "../src/mochi/wardrobe.ts";
import { accessoryParts } from "../src/mochi/accessory-parts.ts";
installFakeDom();

test("collections arrive centered without styles; choosing reveals them and scrolling clears them", () => {
  State.settings = { ...DEFAULT_SETTINGS, mochiOutfit: "witchHat" };
  State.wardrobePreview = null;
  const actions = { chooseOutfit: value => { State.settings.mochiOutfit = value; },
    previewOutfit: value => { State.wardrobePreview = value; } };
  const view = buildWardrobe(actions); view.sync();
  const panels = view.el.find(".wardrobe-collection"), marks = view.el.find(".pill-page-mark");
  assert.equal(panels.length,4);
  assert.ok(panels.every(p => !p.classList.contains("styles-open")));
  marks[1].fire("click");
  const cat = panels[1].find(".wardrobe-item").find(b => b.getAttribute("aria-label") === "Cat ears");
  cat.fire("click");
  assert.equal(State.settings.mochiOutfit,"catEars");
  assert.ok(panels[1].classList.contains("styles-open"));
  const ice = panels[1].find(".wardrobe-variant").find(b => b.getAttribute("aria-label").endsWith("Ice"));
  ice.fire("click");
  assert.equal(State.settings.mochiOutfit,"catEars:ice");
  marks[2].fire("click");
  assert.ok(panels.every(p => !p.classList.contains("styles-open")));
  assert.equal(view.el.find(".wardrobe-variant").length,0);
  const jinx = panels[2].find(".wardrobe-item").find(b => b.getAttribute("aria-label") === "Jinx");
  jinx.fire("click");
  assert.equal(panels[2].find(".wardrobe-variant").length,3);
  marks[3].fire("click");
  const kiriko = panels[3].find(".wardrobe-item").find(b => b.getAttribute("aria-label") === "Kiriko");
  kiriko.fire("click");
  assert.equal(State.settings.mochiOutfit,"owKiriko");
  marks[0].fire("click"); marks[3].fire("click");
  assert.ok(!panels[3].classList.contains("styles-open"),"returning does not resurrect styles");
});

test("every champion has bounded lit geometry and valid persistent color choices", () => {
  assert.equal(LEAGUE_OUTFITS.length,10);
  assert.ok(OVERWATCH_OUTFITS.includes("owKiriko") && OVERWATCH_OUTFITS.includes("owReinhardt"));
  for (const base of [...LEAGUE_OUTFITS,...OVERWATCH_OUTFITS]) {
    const parts=accessoryParts(base);
    assert.ok(parts.length>0 && parts.length<=20,`${base}: ${parts.length} surfaces`);
    assert.ok(parts.every(p=>p.points.flat().every(Number.isFinite)));
    for(const variant of outfitVariants(base)) {
      assert.equal(parseOutfit(variant),variant);
      assert.equal(outfitAppearance(variant).base,base);
    }
  }
  assert.equal(parseOutfit("owKiriko:invalid"),"auto");
});
