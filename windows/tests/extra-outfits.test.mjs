import { test } from "node:test";
import assert from "node:assert/strict";
import { accessoryMesh, VOLUME_OUTFITS } from "../src/mochi/extra-outfits.ts";

test("every extra accessory has real depth and finite lighting normals, also in icons", () => {
  for (const outfit of VOLUME_OUTFITS) for (const small of [false, true]) {
    const { faces } = accessoryMesh(outfit, 0.5, small);
    assert.ok(faces.length > 0, outfit);
    const points = faces.flatMap(f => f.points);
    const depths = points.map(p => p[2]);
    assert.ok(Math.max(...depths) - Math.min(...depths) > 0.1, `${outfit} has thickness`);
    for (const face of faces) {
      for (const v of [...face.points, ...face.normals]) assert.ok(v.every(Number.isFinite));
      assert.match(face.color, /^#[a-f0-9]{6}$/i);
    }
  }
});

test("ear shells have front and back surfaces, recessed lining and head contact points", () => {
  for (const outfit of ["catEars", "foxEars", "bearEars"]) {
    const mesh = accessoryMesh(outfit);
    assert.equal(mesh.roots.length, 2);
    assert.ok(new Set(mesh.faces.map(f => f.color)).size >= 2);
    assert.ok(mesh.faces.some(f => f.points.every(p => p[2] < 0)));
    assert.ok(mesh.faces.some(f => f.points.every(p => p[2] > 0.1)));
    assert.ok(mesh.roots.every(p => p[1] < 0.9), "bases nestle into the head");
  }
});

test("geometry is reused between frames and follows accessory spring motion", () => {
  const rest = accessoryMesh("catEars", 0);
  assert.equal(accessoryMesh("catEars", 0), rest);
  const moving = accessoryMesh("catEars", 0.8);
  assert.notDeepEqual(moving.faces[20].points, rest.faces[20].points);
  assert.ok(accessoryMesh("catEars", 0.8, true).faces.length < moving.faces.length);
});
