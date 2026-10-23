// The island's background colour: black, a dark tint of the system's accent
// colour, or one the user picks. The text and Mochi are drawn for a dark
// background, so every colour is held below a lightness cap: a bright pick
// becomes its dark version instead of hiding them.

export type IslandColorMode = "black" | "system" | "custom";

export interface IslandPalette {
  island: string;
  cardFlat: string;
  card: string;
  tabOn: string;
}

/** The brightest an island background may look (0..1), by how the eye weighs red, green and blue. */
const MAX_BRIGHTNESS = 0.16;
/** How dark the "match system" tint is. */
const SYSTEM_LIGHTNESS = 0.11;
const MAX_SATURATION = 0.65;

export function parseHex(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function brightness(hex: string): number {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function paletteOf(h: number, s: number, l: number): IslandPalette {
  // Yellow at the same HSL lightness as blue looks far brighter: darken until it does not.
  while (l > 0.02 && brightness(fromHsl(h, s, l)) > MAX_BRIGHTNESS) l *= 0.92;
  const up = (by: number) => fromHsl(h, s, Math.min(1, l + by));
  return { island: fromHsl(h, s, l), cardFlat: up(0.03), card: up(0.05), tabOn: up(0.08) };
}

/** The palette for the chosen mode, or null for the plain black island. */
export function islandPalette(
  mode: IslandColorMode | undefined,
  custom: string | undefined,
  accent: string | null,
): IslandPalette | null {
  if (mode === "system") {
    const rgb = parseHex(accent);
    if (!rgb) return null;
    const [h, s] = toHsl(rgb);
    return paletteOf(h, Math.min(s, MAX_SATURATION), SYSTEM_LIGHTNESS);
  }
  if (mode === "custom") {
    const rgb = parseHex(custom);
    if (!rgb) return null;
    const [h, s, l] = toHsl(rgb);
    return paletteOf(h, s, l);
  }
  return null;
}
