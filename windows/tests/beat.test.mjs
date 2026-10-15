import { test } from "node:test";
import assert from "node:assert/strict";
import { beatPosition, beatDiagnostics, currentBpm, danceCalm, feedBeat, resetBeat, DEFAULT_BPM } from "../src/mochi/beat.ts";
const report = (bpm, now, offset = 1000, confidence = 5) => ({
  bpm, beatAtMs: offset + Math.floor((now - offset) * bpm / 60000) * 60000 / bpm, confidence,
});
const distance = (v) => Math.abs(v - Math.round(v));

test("Spotify audio controls tempo and phase without a database key", () => {
  resetBeat(true, 1000);
  assert.equal(danceCalm(1000), 1);
  for (let at = 1000; at <= 3000; at += 250) feedBeat(report(128, at), at);
  assert.equal(currentBpm(), 128);
  assert.equal(beatDiagnostics(3000).phaseLocked, true);
  const beatAt = 1000 + 5 * 60000 / 128;
  assert.ok(distance(beatPosition(beatAt)) < 0.01);
});

test("slow and fast audio never get folded into the fixed dance range", () => {
  for (const bpm of [70, 94, 175, 200]) {
    resetBeat(true, 1000);
    for (let at = 1000; at <= 3000; at += 250) feedBeat(report(bpm, at), at);
    assert.equal(currentBpm(), bpm);
    assert.ok(danceCalm(3000) > 0);
  }
});

test("inconsistent and low confidence estimates leave the default rhythm running", () => {
  resetBeat(true, 1000);
  for (let i = 0; i < 12; i++) {
    const now = 1000 + i * 250;
    feedBeat(report(i % 2 ? 80 : 170, now), now);
  }
  assert.equal(beatDiagnostics(4000).phaseLocked, false);
  assert.equal(danceCalm(4000), 1);
  for (let now = 5000; now < 7000; now += 250) feedBeat(report(128, now, 1000, 1.2), now);
  assert.equal(danceCalm(7000), 1);
});

test("audio timestamps compensate delayed event delivery", () => {
  resetBeat(true, 1000);
  for (let audio = 1000; audio <= 4000; audio += 250) {
    feedBeat(report(120, audio, 1100), audio + 90);
  }
  assert.ok(distance(beatPosition(4100)) < 0.01);
});

test("seek phase corrections settle on the new beats", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 3000; now += 250) feedBeat(report(120, now), now);
  for (let now = 3250; now <= 6250; now += 250) feedBeat(report(120, now, 1150), now);
  assert.ok(distance(beatPosition(6150)) < 0.04);
});

test("lost audio returns to the default rhythm without stopping", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 3000; now += 250) feedBeat(report(120, now), now);
  assert.equal(danceCalm(6000), 1);
  assert.equal(beatDiagnostics(6000).phaseLocked, false);
  resetBeat(true, 1000);
  assert.equal(danceCalm(7000), 1);
  resetBeat(false);
  assert.equal(danceCalm(7000), 1);
  assert.equal(currentBpm(), DEFAULT_BPM);
});

test("default dance keeps moving while analysis is unavailable", () => {
  resetBeat(true, 1000);
  const start = beatPosition(1000);
  assert.ok(Math.abs(beatPosition(2000) - start - DEFAULT_BPM / 60) < 1e-6);
  for (const now of [1000, 2000, 6000, 60000]) assert.ok(danceCalm(now) > 0);
});

test("fallback preserves phase instead of jumping or stopping", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 3000; now += 250) feedBeat(report(128, now), now);
  const justBefore = beatPosition(5499.999);
  const atFallback = beatPosition(5500);
  assert.ok(Math.abs(atFallback - justBefore) < 0.001);
  assert.equal(currentBpm(), DEFAULT_BPM);
  assert.ok(Math.abs(beatPosition(6500) - atFallback - DEFAULT_BPM / 60) < 1e-6);
  assert.equal(danceCalm(6500), 1);
  const beforeReset = beatPosition(6500);
  resetBeat(true, 6500);
  assert.equal(beatPosition(6500), beforeReset);
});
