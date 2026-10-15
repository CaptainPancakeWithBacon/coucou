import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beatPosition, beatDiagnostics, currentBpm, danceCalm, feedBeat, resetBeat,
  setTrackBpm, DEFAULT_BPM,
} from "../src/mochi/beat.ts";

test("unverified audio cannot choose or change Mochi's tempo", () => {
  resetBeat(true);
  for (let i = 0; i < 30; i++) {
    feedBeat({ bpm: i % 2 ? 172 : 127.2, beatAtMs: 1000 + i * 250, confidence: 20 }, 1100 + i * 250);
    assert.equal(currentBpm(), DEFAULT_BPM);
    assert.equal(beatDiagnostics(1100 + i * 250).phaseLocked, false);
  }
  assert.equal(danceCalm(9000), 1);
  assert.equal(beatDiagnostics(9000).danceBpm, DEFAULT_BPM);
});

test("a verified BPM is applied once and never nudged by differing audio estimates", () => {
  resetBeat(true);
  setTrackBpm(108);
  for (let i = 0; i < 12; i++) feedBeat({
    bpm: 127.2, beatAtMs: 10000 + 250 * i, confidence: 9,
  }, 10100 + 250 * i);
  assert.equal(currentBpm(), 108);
  assert.equal(beatDiagnostics(13000).danceBpm, 108);
  assert.equal(beatDiagnostics(13000).phaseLocked, false);
});

test("only repeated phase-consistent confident reports lock to verified tempo", () => {
  resetBeat(true);
  setTrackBpm(120);
  for (let i = 0; i < 3; i++) {
    feedBeat({ bpm: 120, beatAtMs: 10000, confidence: 4 }, 10100 + 100 * i);
    assert.equal(beatDiagnostics(10100 + 100 * i).phaseLocked, false);
  }
  feedBeat({ bpm: 120, beatAtMs: 10000, confidence: 4 }, 10400);
  assert.equal(beatDiagnostics(10400).phaseLocked, true);
  assert.equal(currentBpm(), 120);
  assert.ok(Math.abs(beatPosition(11000) - Math.round(beatPosition(11000))) < 0.1);
  assert.equal(beatDiagnostics(15000).phaseLocked, false);
});

test("poor-confidence reports never acquire phase lock", () => {
  resetBeat(true);
  setTrackBpm(108);
  for (let i = 0; i < 15; i++) {
    feedBeat({ bpm: 108, beatAtMs: 10000, confidence: 1.2 }, 10100 + 100 * i);
  }
  assert.equal(beatDiagnostics(11500).phaseLocked, false);
  assert.equal(currentBpm(), 108);
});

test("reset returns to stable Mac-style fallback", () => {
  resetBeat(true);
  setTrackBpm(108);
  assert.equal(currentBpm(), 108);
  resetBeat(true);
  assert.equal(currentBpm(), DEFAULT_BPM);
  assert.equal(danceCalm(10000), 1);
  assert.ok(Math.abs(beatPosition(60000) - DEFAULT_BPM) < 1e-9);
  feedBeat({ bpm: 150, beatAtMs: NaN, confidence: 20 }, 10000);
  assert.equal(currentBpm(), DEFAULT_BPM);
});
