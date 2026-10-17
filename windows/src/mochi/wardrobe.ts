// Mochi's wardrobe — the pure logic, port of NotchBuddy/Sources/CoucouKit/MochiWardrobe.swift.
// What Mochi wears is picked in the wardrobe view (right-click on Mochi, or the
// tray menu) and stored in the preferences as `mochiOutfit`. The drawing lives
// in ./outfits.ts.

import { N_, labels, t } from "../i18n/i18n";

/** Every outfit, plus "auto" (dress for the season) and "none". Order of the wardrobe. */
export const CLASSIC_OUTFITS = [
  "auto", "none", "partyHat", "beanie", "crown", "sunglasses", "roundGlasses",
  "bow", "scarf", "witchHat", "pumpkin", "santaHat", "bunnyEars",
] as const;

export const EXTRA_OUTFITS = [
  "catEars", "blueWitchHat", "foxEars", "bearEars", "devilHorns",
  "halo", "headphones", "flower", "sprout", "antenna",
] as const;
export const LEAGUE_OUTFITS = ["lolAhri", "lolJinx", "lolEkko", "lolYasuo", "lolVi",
  "lolTeemo", "lolDarius", "lolBraum", "lolIllaoi", "lolWarwick"] as const;
export const OVERWATCH_OUTFITS = ["owKiriko", "owReinhardt", "owDva", "owMercy", "owJunkrat", "owTracer"] as const;
export const OUTFIT_SELECTIONS = [...CLASSIC_OUTFITS, ...EXTRA_OUTFITS, ...LEAGUE_OUTFITS, ...OVERWATCH_OUTFITS] as const;
export const OUTFIT_STYLES = {
  rose: { name: N_("Rose"), color: "#e694bc", filter: "sepia(0.65) saturate(2.2) hue-rotate(285deg)" },
  ice: { name: N_("Ice"), color: "#8ccff3", filter: "sepia(0.6) saturate(2.4) hue-rotate(155deg)" },
  forest: { name: N_("Forest"), color: "#8fc997", filter: "sepia(0.65) saturate(1.8) hue-rotate(65deg)" },
  gold: { name: N_("Gold"), color: "#e1bd72", filter: "sepia(0.85) saturate(2)" },
  arcane: { name: "Arcane", color: "#bd8be4", filter: "hue-rotate(25deg) saturate(1.25)" },
  spirit: { name: "Spirit", color: "#c4daee", filter: "saturate(0.3) brightness(1.3)" },
} as const;
export type OutfitStyle = keyof typeof OUTFIT_STYLES;
export type BaseSelection = (typeof OUTFIT_SELECTIONS)[number];
export type BaseOutfit = Exclude<BaseSelection, "auto">;

/** What can be stored in the preferences. The raw values are the Mac's, keep them stable. */
export type OutfitSelection = BaseSelection | `${BaseOutfit}:${OutfitStyle}`;

/** What Mochi actually wears: a selection with "auto" resolved. */
export type Outfit = Exclude<OutfitSelection, "auto">;

export const DEFAULT_OUTFIT: OutfitSelection = "auto";

// ── User-visible strings ──────────────────────────────────────────────────────

/** The English names, the keys of their translations (src/i18n). */
export const OUTFIT_KEYS: Record<BaseSelection, string> = {
  auto: N_("Auto (seasons)"),
  none: N_("None"),
  partyHat: N_("Party hat"),
  beanie: N_("Beanie"),
  crown: N_("Crown"),
  sunglasses: N_("Sunglasses"),
  roundGlasses: N_("Round glasses"),
  bow: N_("Bow"),
  scarf: N_("Scarf"),
  witchHat: N_("Witch hat"),
  pumpkin: N_("Pumpkin"),
  santaHat: N_("Santa hat"),
  bunnyEars: N_("Bunny ears"),
  catEars: N_("Cat ears"),
  blueWitchHat: N_("Midnight witch hat"),
  foxEars: N_("Fox ears"),
  bearEars: N_("Bear ears"),
  devilHorns: N_("Devil horns"),
  halo: N_("Halo"),
  headphones: N_("Headphones"),
  flower: N_("Flower"),
  sprout: N_("Sprout"),
  antenna: N_("Antenna"),
  lolAhri: "Ahri", lolJinx: "Jinx", lolEkko: "Ekko", lolYasuo: "Yasuo", lolVi: "Vi",
  lolTeemo: "Teemo", lolDarius: "Darius", lolBraum: "Braum", lolIllaoi: "Illaoi", lolWarwick: "Warwick",
  owKiriko: "Kiriko", owReinhardt: "Reinhardt", owDva: "D.Va", owMercy: "Mercy", owJunkrat: "Junkrat", owTracer: "Tracer",
};

/** In the current language: every read goes through `t()`. */
export const OUTFIT_LABELS: Record<BaseSelection, string> = labels(OUTFIT_KEYS);

export function outfitAppearance(selection: OutfitSelection): { base: BaseSelection; style: OutfitStyle | null; filter: string } {
  const [base, rawStyle] = selection.split(":");
  const style = rawStyle && Object.hasOwn(OUTFIT_STYLES, rawStyle) ? rawStyle as OutfitStyle : null;
  return { base: base as BaseSelection, style, filter: style ? OUTFIT_STYLES[style].filter : "none" };
}

export function outfitLabel(selection: OutfitSelection): string {
  const { base, style } = outfitAppearance(selection);
  return `${OUTFIT_LABELS[base]}${style ? ` · ${t(OUTFIT_STYLES[style].name)}` : ""}`;
}

export function outfitVariants(base: BaseSelection): OutfitSelection[] {
  if (base === "auto" || base === "none") return [base];
  const styles: OutfitStyle[] = base.startsWith("lol") ? ["arcane", "spirit"] : ["rose", "ice", "forest", "gold"];
  return [base, ...(base === "witchHat" ? ["blueWitchHat" as const] : []),
    ...styles.map(style => `${base}:${style}` as OutfitSelection)];
}

export const WARDROBE_COLLECTIONS = [
  { name: N_("Wardrobe"), items: CLASSIC_OUTFITS },
  { name: "Extra", items: EXTRA_OUTFITS.filter(id => id !== "blueWitchHat") },
  { name: "League of Legends", items: LEAGUE_OUTFITS },
  { name: "Overwatch", items: OVERWATCH_OUTFITS },
] as const;

export function outfitFamily(selection: OutfitSelection): BaseSelection {
  const { base } = outfitAppearance(selection);
  return base === "blueWitchHat" ? "witchHat" : base;
}

export const WARDROBE_STRINGS = {
  get title() { return t("Wardrobe"); },
  get autoBadge() { return t("AUTO"); },
  autoNow: (current: string) => t("Auto · {outfit}", { outfit: current }),
  autoHover: (current: string) => t("Auto · follows the seasons (now: {outfit})", { outfit: current }),
};

// ── Logic ─────────────────────────────────────────────────────────────────────

const SELECTION_SET: ReadonlySet<string> = new Set(OUTFIT_SELECTIONS);

/**
 * A stored preference → a selection. Anything unknown (a value from a newer or
 * older build, such as the Mac's removed "topHat", or garbage) means "auto",
 * exactly like `Outfit.stored` on macOS.
 */
export function parseOutfit(raw: unknown): OutfitSelection {
  if (typeof raw !== "string") return DEFAULT_OUTFIT;
  if (raw === "owGenji" || raw.startsWith("owGenji:")) return parseOutfit("owJunkrat" + raw.slice(7));
  if (SELECTION_SET.has(raw)) return raw as BaseSelection;
  const [base, style, extra] = raw.split(":");
  if (style && !extra && SELECTION_SET.has(base) && base !== "auto" && base !== "none" &&
      outfitVariants(base as BaseSelection).includes(raw as OutfitSelection)) return raw as OutfitSelection;
  return DEFAULT_OUTFIT;
}

/** Easter Sunday of `year` (Meeus/Jones/Butcher), as [month 1–12, day]. */
export function easterDate(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const DAY_MS = 86_400_000;

/**
 * The seasonal outfit for `date`, read in the user's local calendar.
 * Priority: party hat > Santa hat > witch hat > bunny ears > sunglasses > none.
 */
export function seasonalOutfit(date: Date): BaseOutfit {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  // Dec 31 – Jan 2
  if ((month === 12 && day === 31) || (month === 1 && day <= 2)) return "partyHat";
  // Dec 1–26
  if (month === 12 && day <= 26) return "santaHat";
  // Oct 1 – Nov 1
  if (month === 10 || (month === 11 && day === 1)) return "witchHat";
  // Two days before Easter to the day after. Calendar days counted in UTC so a
  // daylight-saving change in between can't shift the count.
  const [em, ed] = easterDate(year);
  const delta = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, em - 1, ed)) / DAY_MS);
  if (delta >= -2 && delta <= 1) return "bunnyEars";
  // Jun 21 – Aug 31
  if ((month === 6 && day >= 21) || month === 7 || month === 8) return "sunglasses";
  return "none";
}

/** "auto" → the season's outfit; anything else is worn as chosen. */
export function resolveOutfit(selection: OutfitSelection, date: Date): Outfit {
  return selection === "auto" ? seasonalOutfit(date) : selection;
}

/**
 * The grey text at the right of the wardrobe header: the hovered outfit,
 * otherwise the current choice — WardrobeView.headerRight on macOS.
 */
export function wardrobeHeader(
  hovered: OutfitSelection | null,
  selection: OutfitSelection,
  date: Date,
): string {
  const season = OUTFIT_LABELS[seasonalOutfit(date)];
  if (hovered) return hovered === "auto" ? WARDROBE_STRINGS.autoHover(season) : outfitLabel(hovered);
  return selection === "auto" ? WARDROBE_STRINGS.autoNow(season) : outfitLabel(selection);
}

/** Same as resolveOutfit, remembered for the day — it is asked every frame. */
export class SeasonCache {
  private key = "";
  private value: Outfit = "none";

  get(selection: OutfitSelection, date = new Date()): Outfit {
    if (selection !== "auto") return selection;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (key !== this.key) {
      this.key = key;
      this.value = seasonalOutfit(date);
    }
    return this.value;
  }
}
