import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { tl } from "../i18n/i18n";

/** Vertical collections using the pill pager's rail and motion. */
export function buildCollectionPages(pages: { name: string; el: HTMLElement }[], onChange: (page: number) => void) {
  let page = 0, wheelUntil = 0;
  const viewport = h("div", { class: "collection-viewport" }, ...pages.map(p => p.el));
  const marks = pages.map((p, i) => h("button", { class: "pill-page-mark", role: "tab",
    "aria-label": p.name, onclick: () => go(i) }));
  const previous = h("button", { class: "pill-page-arrow previous", "aria-label": tl("Previous"),
    onclick: () => go(page - 1) }, svg(ICONS.chevronUp, 10, { stroke: 2 }));
  const next = h("button", { class: "pill-page-arrow next", "aria-label": tl("Next"),
    onclick: () => go(page + 1) }, svg(ICONS.chevronUp, 10, { stroke: 2 }));
  const rail = h("div", { class: "pill-page-indicators", role: "tablist", "aria-orientation": "vertical" }, ...marks);
  const el = h("div", { class: "collection-pages" }, viewport, previous, next, rail);
  function go(target: number) {
    const nextPage = Math.max(0, Math.min(pages.length - 1, target)), changed = nextPage !== page;
    page = nextPage;
    pages.forEach((p, i) => {
      p.el.style.transform = `translateY(${(i-page)*100}%)`;
      p.el.setAttribute("aria-hidden", String(i !== page)); p.el.inert = i !== page;
      p.el.setAttribute("role", "tabpanel");
      marks[i].classList.toggle("on", i === page);
      marks[i].setAttribute("aria-selected", String(i === page));
      marks[i].setAttribute("aria-current", String(i === page)); marks[i].tabIndex = i === page ? 0 : -1;
    });
    previous.hidden = page === 0; next.hidden = page === pages.length - 1;
    if (changed) onChange(page);
  }
  el.addEventListener("wheel", event => {
    if (event.ctrlKey || !event.deltaY) return;
    event.preventDefault(); event.stopPropagation();
    if (performance.now() < wheelUntil) return;
    wheelUntil = performance.now() + 280; go(page + Math.sign(event.deltaY));
  }, { passive: false });
  rail.addEventListener("keydown", event => {
    const target = event.key === "ArrowDown" ? page + 1 : event.key === "ArrowUp" ? page - 1 :
      event.key === "Home" ? 0 : event.key === "End" ? pages.length - 1 : null;
    if (target == null) return;
    event.preventDefault(); event.stopPropagation(); go(target); marks[page].focus();
  });
  go(0);
  return { el, go, get page() { return page; } };
}
