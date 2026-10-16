import { h } from "./dom";
import { State } from "../core/state";
import { drawWardrobeIcon } from "../mochi/outfits";
import { buildCollectionPages } from "./collection-pages";
import {
  WARDROBE_COLLECTIONS, OUTFIT_STYLES, WARDROBE_STRINGS, parseOutfit, resolveOutfit, seasonalOutfit,
  outfitFamily, outfitVariants, outfitAppearance, outfitLabel, wardrobeHeader, type OutfitSelection,
} from "../mochi/wardrobe";
import type { ViewActions, ViewHost } from "./views";
import { language, t, tl } from "../i18n/i18n";

export function buildWardrobe(actions: ViewActions): ViewHost {
  const initial = parseOutfit(State.settings.mochiOutfit);
  let hovered: OutfitSelection | null = null;
  let items: { selection: OutfitSelection; button: HTMLButtonElement; canvas: HTMLCanvasElement; page: number }[] = [];
  const drawn = new WeakSet<HTMLCanvasElement>();
  let season = seasonalOutfit(new Date()), lang = language(), activePage = 0;
  const notes: HTMLElement[] = [];
  const families = WARDROBE_COLLECTIONS.map(c => c.items.includes(outfitFamily(initial) as never) ? outfitFamily(initial) : c.items[0]);
  const variantRows: HTMLElement[] = [];

  function makeItem(selection: OutfitSelection, page: number, variant = false) {
    const canvas = h("canvas"), a = outfitAppearance(selection);
    const label = a.style ? t(OUTFIT_STYLES[a.style].name) : a.base === "blueWitchHat" ? t("Midnight witch hat") : t("Default");
    const button = h("button", { class: variant ? "wardrobe-variant" : "wardrobe-item",
      title: outfitLabel(selection), "aria-label": outfitLabel(selection) }, canvas,
      variant ? h("span", { text: label }) : null);
    button.addEventListener("mouseenter", () => {
      hovered = selection; actions.previewOutfit(resolveOutfit(selection, new Date())); update();
    });
    button.addEventListener("mouseleave", () => {
      if (hovered !== selection) return;
      hovered = null; actions.previewOutfit(null); update();
    });
    button.addEventListener("click", () => {
      if (!variant) { families[page] = outfitFamily(selection); renderVariants(page); }
      hovered = null; actions.chooseOutfit(selection); actions.previewOutfit(null); update(); drawIcons();
    });
    items.push({ selection, button, canvas, page });
    return button;
  }
  function renderVariants(page: number) {
    const row = variantRows[page];
    items = items.filter(item => item.page !== page || !item.button.classList.contains("wardrobe-variant"));
    row.replaceChildren(...outfitVariants(families[page]).map(sel => makeItem(sel, page, true)));
    row.style.visibility = families[page] === "auto" || families[page] === "none" ? "hidden" : "";
  }
  const pages = WARDROBE_COLLECTIONS.map((collection, page) => {
    const note = h("span", { class: "wardrobe-note" }); notes.push(note);
    const variants = h("div", { class: "wardrobe-variants" }); variantRows.push(variants);
    const panel = h("div", { class: "wardrobe-collection" },
      h("div", { class: "wardrobe-head" }, h("span", { class: "wardrobe-title", text: tl(collection.name) }), note),
      h("div", { class: "wardrobe-grid" }, ...collection.items.map(sel => makeItem(sel, page))),
      h("div", { class: "wardrobe-styles-label", text: tl("Styles") }), variants);
    renderVariants(page);
    return { name: t(collection.name), el: panel };
  });
  const pager = buildCollectionPages(pages, page => {
    activePage = page; hovered = null; actions.previewOutfit(null); update(); drawIcons();
  });
  const el = h("div", { class: "view wardrobe" }, h("div", { class: "card" }, pager.el));
  function update() {
    const current = parseOutfit(State.settings.mochiOutfit);
    for (const note of notes) note.textContent = wardrobeHeader(hovered, current, new Date());
    for (const item of items) {
      const selected = item.button.classList.contains("wardrobe-variant") ? item.selection === current :
        outfitFamily(item.selection) === outfitFamily(current);
      item.button.classList.toggle("on", selected); item.button.setAttribute("aria-pressed", String(selected));
    }
  }
  function drawIcons() {
    const nextSeason = seasonalOutfit(new Date()), nextLanguage = language();
    const changed = nextSeason !== season || nextLanguage !== lang;
    season = nextSeason; lang = nextLanguage;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const item of items) {
      if (item.page !== activePage || (drawn.has(item.canvas) && !(changed && item.selection === "auto"))) continue;
      item.canvas.width = item.canvas.height = Math.round(28*dpr);
      const ctx = item.canvas.getContext?.("2d");
      if (ctx) { ctx.setTransform(dpr,0,0,dpr,0,0); drawWardrobeIcon(ctx,28,item.selection,season,WARDROBE_STRINGS.autoBadge); }
      drawn.add(item.canvas);
    }
  }
  const initialPage = WARDROBE_COLLECTIONS.findIndex(c => c.items.includes(outfitFamily(initial) as never));
  pager.go(Math.max(0, initialPage));
  return { el, sync() {
    if (State.wardrobePreview == null) hovered = null;
    update(); drawIcons();
  } };
}
