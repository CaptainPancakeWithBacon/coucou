// Small, genuinely volumetric accessory meshes in head-local coordinates.
// Lighting and occlusion are shared with the Canvas outfit renderer.
import { leagueAccessory } from "./league-outfits";
import { overwatchAccessory } from "./overwatch-outfits";
export type V3 = readonly [number, number, number];
export interface AccessoryFace { points: [V3, V3, V3]; normals: [V3, V3, V3]; color: string; gloss: number }
export interface AccessoryMesh { faces: AccessoryFace[]; roots: V3[] }
export const VOLUME_OUTFITS = new Set([
  "catEars", "foxEars", "bearEars", "devilHorns", "halo",
  "headphones", "flower", "sprout", "antenna",
]);

const cache = new Map<string, { sway: number; mesh: AccessoryMesh }>();
export function accessoryMesh(outfit: string, sway = 0, small = false): AccessoryMesh {
  const key = `${outfit}:${small}`;
  sway = Math.round(sway * 20) / 20;
  const previous = cache.get(key);
  if (previous?.sway === sway) return previous.mesh;
  const mesh = buildAccessoryMesh(outfit, sway, small);
  cache.set(key, { sway, mesh });
  return mesh;
}

function buildAccessoryMesh(outfit: string, sway: number, small: boolean): AccessoryMesh {
  const faces: AccessoryFace[] = [], roots: V3[] = [];
  const n = small ? 8 : 10;
  const patch = (fn: (u: number, v: number) => V3, color: string, gloss = 0.12,
    nu = n, nv = small ? 4 : 5) => {
    const grid = Array.from({ length: nu + 1 }, (_, i) => Array.from({ length: nv + 1 }, (_, j) => {
      const u = i / nu, v = j / nv, e = 0.0001;
      const a = fn(Math.max(0, u - e), v), b = fn(Math.min(1, u + e), v);
      const c = fn(u, Math.max(0.00001, v - e)), d = fn(u, Math.min(0.99999, v + e));
      const x = b.map((q, k) => q - a[k]), y = d.map((q, k) => q - c[k]);
      const n: V3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      const length = Math.hypot(...n) || 1;
      return { p: fn(u, v), n: n.map(q => q / length) as unknown as V3 };
    }));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      for (const t of [[a, b, c], [a, c, d]]) faces.push({ points: t.map(q => q.p) as [V3, V3, V3],
        normals: t.map(q => q.n) as [V3, V3, V3], color, gloss });
    }
  };
  const ellipsoid = (c: V3, r: V3, color: string, gloss = 0.12) => {
    patch((u, v) => {
      const a = u * Math.PI * 2, b = v * Math.PI;
      return [c[0] + r[0] * Math.cos(a) * Math.sin(b), c[1] + r[1] * Math.cos(b),
        c[2] + r[2] * Math.sin(a) * Math.sin(b)];
    }, color, gloss);
  };
  const tube = (fn: (t: number) => V3, radius: number, color: string, gloss = 0.2) => {
    patch((u, v) => {
      const c = fn(u), a = v * Math.PI * 2;
      const p = fn(Math.max(0, u - 0.001)), q = fn(Math.min(1, u + 0.001));
      const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy) || 1;
      return [c[0] - dy / length * radius * Math.cos(a),
        c[1] + dx / length * radius * Math.cos(a), c[2] + radius * Math.sin(a)];
    }, color, gloss, n, 8);
  };
  const ear = (side: number, fox: boolean) => {
    const center = side * 0.63, height = fox ? 0.85 : 0.73;
    const width = fox ? 0.34 : 0.3;
    roots.push([center, 0.77, 0.22]);
    // Curved triangular shell, with a thick back and a recessed inner cup.
    const shell = (u: number, v: number, front: boolean): V3 => {
      const taper = Math.pow(1 - v, 0.8);
      const x = (u * 2 - 1) * width * taper;
      const rim = Math.pow(Math.abs(u * 2 - 1), 4);
      return [center + x + side * v * 0.12 + sway * v * v * 0.08,
        0.72 + height * v + 0.035 * Math.sin(u * Math.PI),
        front ? 0.12 + 0.13 * rim * taper + 0.06 * v : -0.17 * taper];
    };
    for (const front of [false, true]) patch((u, v) => shell(u, v, front), fox ? "#C87838" : "#454957", 0.13);
    for (const edge of [0, 1]) patch((u, v) => {
      const a = shell(edge, u, false), b = shell(edge, u, true);
      return [a[0], a[1], a[2] + (b[2] - a[2]) * v];
    }, fox ? "#C87838" : "#454957", 0.13, n, 3);
    // Inset is curved into the cup, rather than a triangle painted on top.
    patch((u, v) => {
      const t = 0.16 + v * 0.66, taper = Math.pow(1 - t, 0.8);
      const x = (u * 2 - 1) * width * taper * 0.64;
      return [center + x + side * t * 0.12 + sway * t * t * 0.08,
        0.72 + height * t + 0.035 * Math.sin(u * Math.PI),
        0.128 + 0.06 * t + 0.04 * Math.pow(Math.abs(u * 2 - 1), 3)];
    }, fox ? "#F0D8B1" : "#D894AC", 0.08);
    // Rounded base nestles into the head instead of ending in a hard edge.
    ellipsoid([center, 0.77, 0.02], [width, 0.13, 0.22], fox ? "#C87838" : "#454957");
  };
  if (outfit.startsWith("ow")) {
    overwatchAccessory(outfit, { patch, ellipsoid, tube, roots });
  } else if (outfit.startsWith("lol")) {
    leagueAccessory(outfit, { patch, ellipsoid, tube, roots }, sway, small);
  } else if (outfit === "catEars" || outfit === "foxEars") {
    for (const side of [-1, 1]) ear(side, outfit === "foxEars");
  } else if (outfit === "bearEars") {
    for (const s of [-1, 1]) {
      roots.push([s * 0.76, 0.75, 0.2]);
      ellipsoid([s * 0.76, 0.99, 0], [0.32, 0.35, 0.2], "#97684C");
      ellipsoid([s * 0.76, 1.01, 0.145], [0.205, 0.225, 0.075], "#D7AA8A", 0.05);
    }
  } else if (outfit === "devilHorns") {
    for (const s of [-1, 1]) {
      roots.push([s * 0.57, 0.83, 0.22]);
      patch((u, v) => {
        const a = u * Math.PI * 2, r = 0.22 * Math.pow(1 - v, 0.8);
        return [s * (0.57 + 0.22 * Math.sin(v * Math.PI) - v * 0.12) + r * Math.cos(a),
          0.78 + v * 0.87, 0.06 + r * Math.sin(a) - v * v * 0.12];
      }, "#CE3552", 0.3);
    }
  } else if (outfit === "halo") {
    // Torus: both the inner wall and the underside have visible thickness.
    patch((u, v) => {
      const a = u * Math.PI * 2, b = v * Math.PI * 2;
      return [(0.72 + 0.045 * Math.cos(b)) * Math.cos(a),
        1.43 + 0.045 * Math.sin(b), (0.53 + 0.045 * Math.cos(b)) * Math.sin(a)];
    }, "#F4CF70", 0.5, n * 2, 8);
  } else if (outfit === "headphones") {
    tube(t => [Math.cos(t * Math.PI) * 1.02, Math.sin(t * Math.PI) * 1.1, 0], 0.09, "#4C486F");
    for (const s of [-1, 1]) {
      roots.push([s * 0.96, 0.16, 0.22]);
      ellipsoid([s * 1.0, 0.15, 0], [0.18, 0.34, 0.28], "#292B3B", 0.1);
      ellipsoid([s * 1.10, 0.18, 0.025], [0.14, 0.27, 0.23], "#A79AE7", 0.35);
    }
  } else if (outfit === "flower") {
    const center: V3 = [0.57, 0.86, 0.53];
    roots.push(center);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ellipsoid([center[0] + Math.cos(a) * 0.2, center[1] + Math.sin(a) * 0.22, 0.57],
        [0.17, 0.18, 0.085], i % 2 ? "#F4ACC9" : "#E88CB3", 0.16);
    }
    ellipsoid([center[0], center[1], 0.66], [0.14, 0.14, 0.10], "#F1C868", 0.25);
  } else if (outfit === "sprout") {
    roots.push([0, 0.97, 0.1]);
    tube(t => [sway * t * 0.08, 0.88 + t * 0.6, 0.05], 0.035, "#5C9B4D");
    for (const s of [-1, 1]) {
      patch((u, v) => {
        const w = Math.sin(u * Math.PI) * 0.18 * (v * 2 - 1);
        return [s * u * 0.5, 1.24 + Math.sin(u * 1.5) * 0.34 + w,
          0.06 + Math.sin(u * Math.PI) * 0.13 - Math.abs(w) * 0.7];
      }, s < 0 ? "#88C96A" : "#5DAF64", 0.15);
      tube(t => [s * t * 0.48, 1.24 + Math.sin(t * 1.5) * 0.34, 0.075 + Math.sin(t * Math.PI) * 0.13],
        0.012, "#BAD98C");
    }
  } else if (outfit === "antenna") {
    for (const s of [-1, 1]) {
      roots.push([s * 0.4, 0.88, 0.14]);
      tube(t => [s * (0.4 + t * 0.21) + sway * t * t * 0.12, 0.86 + t * 0.62, 0.04],
        0.035, "#8B9AB0", 0.5);
      ellipsoid([s * 0.61 + sway * 0.12, 1.48, 0.04], [0.15, 0.15, 0.15],
        s < 0 ? "#7AD5DF" : "#C799E1", 0.5);
    }
  }
  return { faces, roots };
}
