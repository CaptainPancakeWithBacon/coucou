import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { tl } from "../i18n/i18n";

/** Two four-pill grids in the original card bounds. Controls are overlays. */
export function buildPillPages() {
  let page = 0;
  let count = 1;
  let wheelUntil = 0;
  const grids: HTMLElement[] = [];
  const viewport = h("div", { class: "pill-pages-viewport" });
  const previous = h("button", {
    class: "pill-page-arrow previous", "aria-label": tl("Previous"),
    onclick: () => go(page - 1),
  }, svg(ICONS.chevronUp, 10, { stroke: 2 }));
  const next = h("button", {
    class: "pill-page-arrow next", "aria-label": tl("Next"),
    onclick: () => go(page + 1),
  }, svg(ICONS.chevronUp, 10, { stroke: 2 }));
  const marks = [0, 1].map((i) => h("button", {
    class: "pill-page-mark", "aria-label": String(i + 1), onclick: () => go(i),
  }));
  const indicators = h("div", { class: "pill-page-indicators" }, ...marks);
  const el = h("div", { class: "pill-pages" }, viewport, previous, next, indicators);

  function go(target: number) {
    page = Math.max(0, Math.min(count - 1, target));
    grids.forEach((grid, i) => {
      grid.style.transform = `translateY(${(i - page) * 100}%)`;
      grid.setAttribute("aria-hidden", String(i !== page));
      grid.inert = i !== page;
    });
    previous.hidden = page === 0;
    next.hidden = page === count - 1;
    indicators.hidden = count < 2;
    marks.forEach((mark, i) => {
      mark.classList.toggle("on", i === page);
      mark.setAttribute("aria-current", String(i === page));
    });
  }

  el.addEventListener("wheel", (event) => {
    if (count < 2 || event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    // A notch changes exactly one page; absorb the gesture's momentum.
    if (now < wheelUntil) return;
    wheelUntil = now + 280;
    go(page + Math.sign(event.deltaY));
  }, { passive: false });

  go(0);
  return {
    el,
    setPills(pills: HTMLElement[]) {
      viewport.replaceChildren();
      grids.length = 0;
      count = Math.max(1, Math.ceil(Math.min(pills.length, 8) / 4));
      for (let i = 0; i < count; i++) {
        const grid = h("div", { class: "pills pill-page" }, ...pills.slice(i * 4, i * 4 + 4));
        grids.push(grid);
        viewport.append(grid);
      }
      go(page);
    },
  };
}
