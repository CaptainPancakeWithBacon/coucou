import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { responsiveFrame } from "../src/core/frame-clock.ts";

test("frames keep flowing without mouse input when WebView2 withholds every rAF", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let pending = null, count = 0;
  globalThis.requestAnimationFrame = fn => { pending = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  let cancel;
  const draw = () => { count++; cancel = responsiveFrame(draw); };
  try {
    cancel = responsiveFrame(draw);
    for(let i=0;i<90;i++) mock.timers.tick(32);
    assert.equal(count,90);
    const late = pending;
    cancel(); late(3000); mock.timers.tick(1000);
    assert.equal(count,90,"cancelled and late callbacks cannot restart idle animation");
  } finally {
    globalThis.requestAnimationFrame=originalRaf; globalThis.cancelAnimationFrame=originalCancel;
    mock.timers.reset();
  }
});

test("a normal animation frame cancels its timeout instead of drawing twice", () => {
  mock.timers.enable({apis:["setTimeout"]});
  const old = [globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame];
  let raf, count=0;
  globalThis.requestAnimationFrame=fn=>{raf=fn;return 1;}; globalThis.cancelAnimationFrame=()=>{};
  try { responsiveFrame(()=>count++); raf(16); mock.timers.tick(64); assert.equal(count,1); }
  finally { [globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=old;mock.timers.reset(); }
});
