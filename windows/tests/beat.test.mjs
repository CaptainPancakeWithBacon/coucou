import { test } from "node:test";
import assert from "node:assert/strict";
import { beatPosition, beatDiagnostics, currentBpm, danceCalm, feedBeat, pauseBeat, resumeBeat, resetBeat, reacquireBeat, beatPresentation, DEFAULT_BPM } from "../src/mochi/beat.ts";
const report = (bpm, now, offset = 1000, confidence = 5) => ({
  bpm, beatAtMs: offset + Math.floor((now - offset) * bpm / 60000) * 60000 / bpm, confidence,
});
const distance = (v) => Math.abs(v - Math.round(v));

test("a 30-second analysis gap and reacquisition cannot slow a confirmed beat", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 12000; now += 250) feedBeat(report(150, now), now);
  const calm = danceCalm(12000);
  for (let now = 12250; now <= 42000; now += 250) {
    feedBeat(report(75, now, 1000, 1.2), now); // rejected, uncertain analysis
    assert.equal(beatDiagnostics(now).danceBpm, 150);
    assert.equal(danceCalm(now), calm);
    const speed = (beatPosition(now + 10) - beatPosition(now)) * 6000;
    assert.ok(Math.abs(speed - 150) < 1, `keeps its beat: ${speed}`);
  }
  for (let now = 42250; now <= 45000; now += 250) {
    feedBeat(report(150, now), now);
    assert.equal(currentBpm(), 150);
  }
});

test("phase realignment cannot cause a large slowdown or speedup", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 12000; now += 250) feedBeat(report(120, now), now);
  for (let now = 12250; now <= 30000; now += 250) {
    feedBeat(report(120, now, 1150), now);
    for (let delta = 0; delta < 250; delta += 10) {
      const speed = (beatPosition(now + delta + 1) - beatPosition(now + delta)) * 60000;
      assert.ok(speed >= 114 && speed <= 126, `phase correction stays subtle: ${speed}`);
    }
  }
});

test("the confirmed tempo keeps playing until six replacement reports agree", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 12000; now += 250) feedBeat(report(120, now), now);
  const expected = [120, 120, 120, 120, 120, 160];
  for (let i = 0; i < 6; i++) {
    const now = 12250 + i * 250;
    const before = beatPosition(now);
    feedBeat(report(160, now), now);
    assert.equal(currentBpm(), expected[i]);
    assert.ok(Math.abs(beatPosition(now) - before) < 1e-8);
  }
  for (let now = 13750; now < 23500; now += 250) {
    feedBeat(report(90, now), now);
    assert.equal(currentBpm(), 160, "hold starts after the sixth report");
  }
});

test("30 seconds of tempo changes respect the hold and keep position and speed continuous", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 31000; now += 250) {
    const measured = now <= 3000 ? 120 : now < 18000 ? 150 : 90;
    const before = beatPosition(now);
    const speedBefore = (before - beatPosition(now - 0.01)) / 0.01;
    feedBeat(report(measured, now), now);
    assert.ok(Math.abs(beatPosition(now) - before) < 1e-8, "no position jump");
    const speedAfter = (beatPosition(now + 0.01) - beatPosition(now)) / 0.01;
    assert.ok(Math.abs(speedAfter - speedBefore) < 0.00001, "no speed jump");
    if (now >= 1250 && now < 11250) assert.equal(currentBpm(), 120);
    if (now >= 11250 && now < 21250) assert.equal(currentBpm(), 150);
    if (now >= 21250) assert.equal(currentBpm(), 90);
  }
});

test("jitter and brief false tempo estimates do not replace a confirmed tempo", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 3000; now += 250) feedBeat(report(120, now), now);
  for (let now = 3250; now <= 31000; now += 250) {
    const measured = now % 4000 < 250 ? 160 : now % 500 === 0 ? 119 : 121;
    feedBeat(report(measured, now), now);
    assert.equal(currentBpm(), 120);
  }
});

test("Spotify audio controls tempo and phase without a database key", () => {
  resetBeat(true, 1000);
  assert.equal(danceCalm(1000), 1);
  for (let at = 1000; at <= 12000; at += 250) feedBeat(report(128, at), at);
  assert.equal(currentBpm(), 128);
  assert.equal(beatDiagnostics(12000).phaseLocked, true);
  const beatAt = 1000 + 24 * 60000 / 128;
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
  for (let audio = 1000; audio <= 12000; audio += 250) {
    feedBeat(report(120, audio, 1100), audio + 90);
  }
  assert.ok(distance(beatPosition(12100)) < 0.01);
});

test("seek phase corrections settle on the new beats", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 3000; now += 250) feedBeat(report(120, now), now);
  for (let now = 3250; now <= 12250; now += 250) feedBeat(report(120, now, 1150), now);
  assert.ok(distance(beatPosition(12650)) < 0.04);
});

test("lost audio keeps the confirmed rhythm without stopping", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 3000; now += 250) feedBeat(report(120, now), now);
  assert.equal(danceCalm(6000), 0.8);
  assert.equal(currentBpm(), 120);
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

test("missing reports preserve tempo and phase instead of falling back", () => {
  resetBeat(true, 1000);
  for (let now = 1000; now <= 3000; now += 250) feedBeat(report(128, now), now);
  const justBefore = beatPosition(5499.999);
  const atFallback = beatPosition(5500);
  assert.ok(Math.abs(atFallback - justBefore) < 0.001);
  assert.equal(currentBpm(), 128);
  assert.ok(Math.abs(beatPosition(6500) - atFallback - 128 / 60) < 0.001);
  assert.equal(danceCalm(6500), 0.72);
  const beforeReset = beatPosition(6500);
  resetBeat(true, 6500);
  assert.equal(beatPosition(6500), beforeReset);
});

test("pausing and resuming the same Spotify song preserves its last BPM", () => {
  resetBeat(true, 1000);
  for (let at = 1000; at <= 3000; at += 250) feedBeat(report(108, at), at);
  assert.equal(currentBpm(), 108);
  pauseBeat(3100);
  assert.equal(currentBpm(), 108);
  resumeBeat(20000);
  assert.equal(currentBpm(), 108, "resume uses the remembered tempo immediately");
  assert.equal(beatDiagnostics(20000).danceBpm, 108);
  resetBeat(true, 21000); // Different song: existing reset behavior
  assert.equal(currentBpm(), DEFAULT_BPM);
});


test("unknown tempo is a lifecycle state independent of the renderer hold", () => {
  resetBeat(true, 1000);
  assert.deepEqual(beatPresentation(true, 1000), { unknown: true });
  assert.deepEqual(beatPresentation(true, 1999), { unknown: true });
  assert.deepEqual(beatPresentation(true, 2000), { unknown: true });
  assert.deepEqual(beatPresentation(true, 12000), { unknown: true });
  assert.deepEqual(beatPresentation(false, 12000), { unknown: false });
  feedBeat(report(128, 12000), 12000); feedBeat(report(128, 12500), 12500);
  assert.deepEqual(beatPresentation(true, 12500), { unknown: false });
  pauseBeat(13000); resumeBeat(20000);
  assert.equal(currentBpm(), 128);
  assert.deepEqual(beatPresentation(true, 20000), { unknown: false });
  reacquireBeat();
  assert.equal(currentBpm(), 128);
  assert.deepEqual(beatPresentation(true, 22000), { unknown: false });
  resetBeat(true, 23000);
  assert.deepEqual(beatPresentation(true, 23000), { unknown: true });
});

test("seeking and reanalysing the same song never inserts a default-tempo step", () => {
  resetBeat(true, 1000);
  for(let now=1000;now<=12000;now+=250) feedBeat(report(150,now),now);
  reacquireBeat();
  const at = beatPosition(13000);
  assert.equal(currentBpm(),150);
  assert.ok(Math.abs(beatPosition(14000)-at-2.5)<0.001);
  for(let now=14000;now<=14750;now+=250) feedBeat(report(90,now),now);
  assert.equal(currentBpm(),150,"unconfirmed replacement cannot change the established rhythm");
  assert.equal(beatPresentation(true,14750).unknown,false);
});
