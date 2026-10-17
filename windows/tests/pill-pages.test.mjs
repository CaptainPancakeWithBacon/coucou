import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./fakedom.mjs";
import { buildPillPages } from "../src/views/pill-pages.ts";
import { VIEW_LAYOUTS, EXPANDED_W } from "../src/core/layout.ts";

installFakeDom();
const pills = (n) => Array.from({ length: n }, (_, i) => {
  const el = document.createElement("button");
  el.textContent = String(i);
  return el;
});

function wheel(el, deltaY, ctrlKey = false) {
  const event = { deltaY, ctrlKey, prevented: false,
    preventDefault() { this.prevented = true; }, stopPropagation() {} };
  for (const listener of el.listeners.get("wheel") ?? []) listener(event);
  return event;
}

test("eight pills use two four-pill pages, with arrows and two vertical page marks", () => {
  const pager = buildPillPages();
  pager.setPills(pills(8));
  const pages = pager.el.find(".pill-page");
  assert.deepEqual(pages.map((p) => p.children.length), [4, 4]);
  assert.equal(pages[0].style.transform, "translateY(0%)");
  assert.equal(pages[1].style.transform, "translateY(100%)");
  assert.equal(pager.el.find(".pill-page-mark").length, 2);
  assert.equal(pager.el.querySelector(".previous").hidden, true);
  assert.equal(pager.el.querySelector(".next").hidden, false);
  pager.el.querySelector(".next").fire("click");
  assert.equal(pages[0].style.transform, "translateY(-100%)");
  assert.equal(pages[1].inert, false);
  assert.equal(pages[0].inert, true);
  assert.equal(pager.el.querySelector(".previous").hidden, false);
  assert.equal(pager.el.querySelector(".next").hidden, true);
  assert.equal(pager.el.find(".pill-page-mark")[1].getAttribute("aria-current"), "true");
  assert.equal(EXPANDED_W, 640);
  assert.equal(VIEW_LAYOUTS.overview.height, 160);
});

test("one wheel notch changes one page, absorbs momentum, and never wraps", () => {
  let now = 1000;
  const clock = mock.method(performance, "now", () => now);
  try {
    const pager = buildPillPages();
    pager.setPills(pills(8));
    assert.equal(wheel(pager.el, 100).prevented, true);
    assert.equal(pager.el.querySelector(".next").hidden, true);
    wheel(pager.el, -1); // momentum during the animation is ignored
    assert.equal(pager.el.querySelector(".next").hidden, true);
    now += 300;
    wheel(pager.el, 100);
    assert.equal(pager.el.querySelector(".next").hidden, true);
    now += 300;
    assert.equal(wheel(pager.el, -100, true).prevented, false);
    wheel(pager.el, -100);
    assert.equal(pager.el.querySelector(".previous").hidden, true);
  } finally { clock.mock.restore(); }
});

test("removing pills clamps the current page and hides paging controls without touching the pills", () => {
  const pager = buildPillPages();
  pager.setPills(pills(8));
  pager.el.querySelector(".next").fire("click");
  const kept = pills(4);
  pager.setPills(kept);
  assert.equal(pager.el.find(".pill-page").length, 1);
  assert.deepEqual(pager.el.querySelector(".pill-page").children, kept);
  assert.equal(pager.el.querySelector(".pill-page-indicators").hidden, true);
  assert.equal(pager.el.querySelector(".previous").hidden, true);
  assert.equal(pager.el.querySelector(".next").hidden, true);
  assert.equal(wheel(pager.el, 100).prevented, false);
});
