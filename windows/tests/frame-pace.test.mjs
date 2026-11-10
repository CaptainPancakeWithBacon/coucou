import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PACE_MS, fastest, maxDt, pacedFrame, saverPace } from "../src/core/frame-clock.ts";
import { BotEngine } from "../src/mochi/engine.ts";

// ── How often a loop draws, by how much it needs to ────────────────────────────

test("the paces are ordered: full speed, then 30 fps, then 15 fps", () => {
  assert.equal(PACE_MS.full, 0);
  assert.ok(PACE_MS.smooth >= 30 && PACE_MS.smooth <= 40, "smooth is about 30 fps");
  assert.ok(PACE_MS.ambient >= 60 && PACE_MS.ambient <= 80, "ambient is about 15 fps");
});

test("the most demanding pace wins, and nothing means nothing", () => {
  assert.equal(fastest("ambient", "smooth"), "smooth");
  assert.equal(fastest("ambient", "full", "smooth"), "full");
  assert.equal(fastest("none", "ambient"), "ambient");
  assert.equal(fastest(), "none");
  assert.equal(fastest("none", "none"), "none");
});

test("a slower pace may take a longer time step, so the animation keeps its speed", () => {
  assert.equal(maxDt("full"), 0.05, "the old limit is untouched at full speed");
  assert.ok(maxDt("smooth") >= 0.05);
  assert.ok(maxDt("ambient") >= PACE_MS.ambient * 1.5 / 1000, "a 15 fps frame fits in one step");
});

test("power-saver slows a loop to about 8 fps and leaves everything else alone", () => {
  assert.ok(PACE_MS.slow >= 110 && PACE_MS.slow <= 140, "slow is about 8 fps");
  assert.equal(saverPace("smooth", true), "slow");
  assert.equal(saverPace("ambient", true), "slow");
  assert.equal(saverPace("full", true), "full", "a state change or a tween still gets every frame");
  assert.equal(saverPace("none", true), "none");
  for (const pace of ["full", "smooth", "ambient", "slow", "none"]) assert.equal(saverPace(pace, false), pace, `${pace} off power-saver`);
  assert.equal(fastest("slow", "none"), "slow");
  assert.equal(fastest("slow", "ambient"), "ambient");
  assert.ok(maxDt("slow") >= PACE_MS.slow * 1.5 / 1000, "an 8 fps frame fits in one step");
});

function withTimers(fn) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const old = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame, globalThis.performance];
  let rafCalls = 0, now = 0;
  globalThis.requestAnimationFrame = () => { rafCalls++; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const clock = { now: () => now };
  Object.defineProperty(globalThis, "performance", { value: clock, configurable: true });
  try { fn({ tick(ms) { now += ms; mock.timers.tick(ms); }, rafCalls: () => rafCalls }); }
  finally {
    [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = old;
    Object.defineProperty(globalThis, "performance", { value: old[2], configurable: true });
    mock.timers.reset();
  }
}

test("an ambient loop draws about 15 times a second, a smooth one about 30, and neither waits for requestAnimationFrame", () => {
  for (const [pace, expected] of [["ambient", 15], ["smooth", 30]]) {
    withTimers((t) => {
      let draws = 0, cancel;
      const frame = (now) => { draws++; cancel = pacedFrame(frame, pace, now); };
      cancel = pacedFrame(frame, pace, 0);
      for (let i = 0; i < 1000; i++) t.tick(1);
      assert.ok(Math.abs(draws - expected) <= 2, `${pace}: ${draws} draws in a second`);
      assert.equal(t.rafCalls(), 0, "a throttled loop does not ask for animation frames");
      cancel();
    });
  }
});

test("at full speed the loop is the old one: it asks for animation frames", () => {
  withTimers((t) => {
    const cancel = pacedFrame(() => {}, "full", 0);
    assert.equal(t.rafCalls(), 1);
    cancel();
  });
});

test("a frame that is already late is drawn at once, not delayed a whole interval more", () => {
  withTimers((t) => {
    let draws = 0;
    const cancel = pacedFrame(() => { draws++; }, "ambient", -500);   // the last frame was half a second ago
    t.tick(1);
    assert.equal(draws, 1);
    cancel();
  });
});

test("a cancelled paced frame never draws", () => {
  withTimers((t) => {
    let draws = 0;
    const cancel = pacedFrame(() => { draws++; }, "smooth", 0);
    cancel();
    t.tick(500);
    assert.equal(draws, 0);
  });
});

// ── What the engine says it needs ──────────────────────────────────────────────

// The engine's tweens run on the real clock, so a test that steps it faster than real time needs a clock that moves with each step.
let fakeNow = 1000;
const realNow = globalThis.performance.now.bind(globalThis.performance);
const withClock = (fn) => {
  mock.method(globalThis.performance, "now", () => fakeNow);
  // The engine rolls dice for blinks, sparkle drift and the like; a fixed roll keeps these tests from depending on luck.
  mock.method(Math, "random", () => 0.5);
  try { fn(); } finally { mock.restoreAll(); }
};
const settle = (engine, seconds = 6) => { for (let i = 0; i < seconds * 60; i++) { fakeNow += 1000 / 60; engine.update(1 / 60); } };

test("a settled idle Mochi needs no frames at all", () => withClock(() => {
  const engine = new BotEngine();
  settle(engine);
  assert.equal(engine.activity, "none");
  assert.equal(engine.busy, false);
}));

test("a sleeping Mochi only breathes: it needs a slow, ambient pace", () => withClock(() => {
  const engine = new BotEngine();
  engine.setState("sleeping", true);
  settle(engine);
  assert.equal(engine.activity, "ambient");
}));

test("a dancing Mochi needs a smooth pace", () => withClock(() => {
  const engine = new BotEngine();
  settle(engine);
  engine.setDancing(true);
  settle(engine, 2);
  assert.equal(engine.activity, "smooth");
}));

test("a scanning (searching) Mochi needs a smooth pace, not full speed", () => withClock(() => {
  const engine = new BotEngine();
  engine.setState("searching", true);
  settle(engine);
  assert.equal(engine.activity, "smooth");
}));

test("a worried, sweating Mochi is ambient once it has settled", () => withClock(() => {
  const engine = new BotEngine();
  engine.setState("ratelimit", true);
  settle(engine);
  assert.equal(engine.activity, "ambient");
}));

test("anything in motion on the way needs full speed: a state change, a tween", () => withClock(() => {
  const engine = new BotEngine();
  settle(engine);
  engine.setState("working");
  assert.equal(engine.activity, "full", "right after a change, springs and tweens are running");
  const asleep = new BotEngine();
  asleep.setState("sleeping", true);
  settle(asleep);
  asleep.setState("working");
  assert.equal(asleep.activity, "full", "waking up is not ambient");
}));

test("sparkles and hearts from an emote keep full speed until they are gone, then the loop slows or stops", () => withClock(() => {
  const engine = new BotEngine();
  settle(engine);
  engine.emit("spark", 3);
  assert.equal(engine.activity, "full");
  settle(engine, 4);
  assert.equal(engine.activity, "none");
}));

test("busy and activity always agree: busy exactly when the activity is not none", () => withClock(() => {
  const engine = new BotEngine();
  for (const state of ["idle", "working", "thinking", "searching", "approval", "question", "error", "finished", "ratelimit", "sleeping", "dizzy"]) {
    engine.setState(state, true);
    for (let i = 0; i < 240; i++) {
      fakeNow += 1000 / 60;
      engine.update(1 / 60);
      assert.equal(engine.busy, engine.activity !== "none", `${state} at step ${i}`);
    }
  }
}));
