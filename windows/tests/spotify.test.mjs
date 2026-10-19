// The Spotify pill (Linux) and Mochi's dance: the page's rules in
// src/core/spotify.ts, the dance in src/mochi/engine.ts, the report handling in
// src/island/spotify.ts and the views in src/views/spotify.ts. The MPRIS side —
// metadata, position, the bus itself — is tested in src-tauri/src/spotify.rs.

import { beforeEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { emit, sent } from "./tauri.mjs";
import { installFakeDom } from "./fakedom.mjs";
import {
  IDLE_SPOTIFY, SPOTIFY_ID, Spotify, currentArtwork, desktopDances, formatTime, isAd, islandDances,
  musicPlaying, spotifyPosition, volumeLevel, withPlaying, reconcileSpotify,
} from "../src/core/spotify.ts";
import { BotEngine, danceTransform, stepDanceLevel, danceEase } from "../src/mochi/engine.ts";
import { resetBeat, feedBeat, pauseBeat, resumeBeat } from "../src/mochi/beat.ts";
import { applySpotify, registerSpotifyHandlers } from "../src/island/spotify.ts";
import { buildSpotifyCard, buildSpotifyPill, resetVolumeThrottle } from "../src/views/spotify.ts";
import { DEFAULT_SETTINGS, State } from "../src/core/state.ts";
import { lookup, setLanguage } from "../src/i18n/i18n.ts";

installFakeDom();

const track = (over = {}) => ({
  id: "spotify:track:abc", title: "Get Lucky", artist: "Daft Punk", album: "Random Access Memories",
  duration: 180, artUrl: "https://i.scdn.co/image/abc", ...over,
});

const playing = (over = {}) => ({
  ...IDLE_SPOTIFY, running: true, installed: true, track: track(), playing: true,
  position: 10, positionAt: 1_000, volume: 70, ...over,
});

test("a seek invalidates beat history; normal playback progress does not", () => {
  Spotify.state = playing({ position: 10, positionAt: 1000 });
  const revision = Spotify.beatRevision;
  const host = { revealSilently() {} };
  applySpotify(host, playing({ position: 11, positionAt: 2000 }));
  assert.equal(Spotify.beatRevision, revision);
  applySpotify(host, playing({ position: 45, positionAt: 3000 }));
  assert.equal(Spotify.beatRevision, revision + 1);
});

// ── Position ──────────────────────────────────────────────────────────────────

test("the position runs on from its timestamp while playing, and stops at the end", () => {
  const s = playing();
  assert.equal(spotifyPosition(s, 1_000), 10);
  assert.equal(spotifyPosition(s, 3_500), 12.5);
  assert.equal(spotifyPosition(s, 0), 10, "a clock behind the anchor never moves it back");
  assert.equal(spotifyPosition(s, 1_000_000), 180, "capped at the track's length");
  assert.equal(spotifyPosition({ ...s, playing: false }, 60_000), 10, "paused, it stays put");
  assert.equal(spotifyPosition({ ...s, track: null }, 3_000), 12, "no length, no cap");
});

test("a play/pause click freezes or restarts the clock where it is", () => {
  const paused = withPlaying(playing(), false, 5_000);
  assert.equal(paused.playing, false);
  assert.equal(paused.position, 14);
  assert.equal(paused.positionAt, 5_000);
  assert.equal(spotifyPosition(paused, 9_000), 14);
  const again = withPlaying(paused, true, 9_000);
  assert.equal(spotifyPosition(again, 10_000), 15);
  const same = playing();
  assert.equal(withPlaying(same, true, 99), same, "no change, same object");
});

test("times read like the Mac's player", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(599), "9:59");
  assert.equal(formatTime(3725), "1:02:05");
  assert.equal(formatTime(-3), "0:00");
  assert.equal(formatTime(Number.NaN), "0:00");
});

test("the volume icon has the Mac's thresholds", () => {
  assert.deepEqual([0, 1, 33, 34, 66, 67, 100].map(volumeLevel), [0, 1, 1, 2, 2, 3, 3]);
});

test("ads are told by their id", () => {
  assert.ok(isAd(track({ id: "spotify:ad:123" })));
  assert.ok(!isAd(track()));
  assert.ok(!isAd(null));
});

test("a cover shows only on the track it belongs to", () => {
  Spotify.artwork = { artUrl: "https://i.scdn.co/image/abc", dataUrl: "data:image/jpeg;base64,AA" };
  assert.equal(currentArtwork(playing()), "data:image/jpeg;base64,AA");
  assert.equal(currentArtwork(playing({ track: track({ artUrl: "https://i.scdn.co/image/zzz" }) })), null);
  assert.equal(currentArtwork(playing({ track: null })), null);
  Spotify.artwork = null;
});

// ── When Mochi dances ─────────────────────────────────────────────────────────

test("music counts only when it plays on a declared Spotify pill", () => {
  assert.ok(musicPlaying(playing(), [SPOTIFY_ID]));
  assert.ok(!musicPlaying(playing(), ["integration_n8n"]));
  assert.ok(!musicPlaying(playing({ playing: false }), [SPOTIFY_ID]));
  assert.ok(!musicPlaying(playing({ track: null }), [SPOTIFY_ID]));
});

test("the island's Mochi dances by the Mac's rules", () => {
  const base = { music: true, state: "idle", mode: "compact", view: "overview", focusId: "integration_claude" };
  // Compact: whenever music plays, in the calm and busy states.
  for (const state of ["idle", "working", "thinking", "searching", "finished"]) {
    assert.ok(islandDances({ ...base, state }), state);
  }
  // An alert, an error, sleep or a daze win.
  for (const state of ["approval", "question", "error", "ratelimit", "sleeping", "dizzy"]) {
    assert.ok(!islandDances({ ...base, state }), state);
  }
  assert.ok(!islandDances({ ...base, music: false }));
  assert.ok(!islandDances({ ...base, mode: "hidden" }));
  // Expanded: only on the overview, with the music pill in front.
  assert.ok(!islandDances({ ...base, mode: "expanded" }));
  assert.ok(islandDances({ ...base, mode: "expanded", focusId: SPOTIFY_ID }));
  assert.ok(!islandDances({ ...base, mode: "expanded", focusId: SPOTIFY_ID, view: "prompt" }));
});

test("Mochi on the desktop dances by the compact island's rules", () => {
  assert.ok(desktopDances(true, "working"));
  assert.ok(!desktopDances(true, "approval"));
  assert.ok(!desktopDances(false, "idle"));
});

// ── The dance itself (BotEngine.applyDance) ───────────────────────────────────

test("the dance fades in over 0.3 s and out over 0.5 s", () => {
  assert.equal(stepDanceLevel(0, true, 0.15), 0.5);
  assert.equal(stepDanceLevel(0.9, true, 0.15), 1);
  assert.equal(stepDanceLevel(1, false, 0.25), 0.5);
  assert.equal(stepDanceLevel(0.1, false, 0.25), 0);
  assert.equal(stepDanceLevel(1, true, 0.05), 1);
});

test("112 BPM: still on the beat, highest half a beat later, nothing at level 0", () => {
  const R = 10;
  const onBeat = danceTransform(0, 1, R);
  assert.equal(onBeat.dx, 0);
  assert.equal(onBeat.dy, -0);
  assert.equal(onBeat.rotate, 0);
  assert.ok(Math.abs(onBeat.sx - 1.045) < 1e-9 && Math.abs(onBeat.sy - 0.94) < 1e-9, "squashed on landing");
  const top = danceTransform(0.5 * 60 / 112, 1, R);
  assert.ok(Math.abs(top.dy + 2) < 1e-9, "hops 0.2 R");
  assert.ok(Math.abs(top.dx - 0.8) < 1e-9 && Math.abs(top.rotate - 0.1) < 1e-9);
  assert.ok(Math.abs(top.sx - 1) < 1e-9 && Math.abs(top.sy - 1) < 1e-9);
  const off = danceTransform(0.3, 0, R);
  assert.deepEqual([off.dx, off.dy, off.rotate, off.sx, off.sy].map((v) => Math.abs(v)), [0, 0, 0, 1, 1]);
});

test("the unknown-beat badge coexists with dancing without changing expression state", () => {
  mock.timers.enable({ apis: ["Date"], now: 10000 });
  try {
    const engine = new BotEngine();
    resetBeat(true);
    engine.setDancing(true, true);
    assert.equal(engine.isDancing, false);
    assert.equal(engine.beatQuestion, true);
    mock.timers.tick(1000);
    for (let i = 0; i < 21; i++) engine.update(0.05);
    engine.setDancing(true, true);
    assert.equal(engine.isDancing, true);
    assert.equal(engine.beatQuestion, true);
    assert.equal(engine.state, "idle");
    assert.equal(engine.eyeOverride, null);
    feedBeat({ bpm: 112, beatAtMs: 11000 });
    mock.timers.tick(500);
    feedBeat({ bpm: 112, beatAtMs: 11000 + 60000 / 112 });
    engine.setDancing(true, true);
    assert.equal(engine.beatQuestion, false, "a measured default-valued BPM is known");
    pauseBeat(); resumeBeat(); engine.setDancing(true, true);
    assert.equal(engine.isDancing, true);
    assert.equal(engine.beatQuestion, false);
    resetBeat(true); engine.setDancing(true, false);
    assert.equal(engine.isDancing, true);
    assert.equal(engine.beatQuestion, false, "option off leaves normal dance intact");
  } finally { mock.timers.reset(); resetBeat(); }
});

test("unknown BPM rolls out, waits a full still second, eases in once and fades the badge independently", () => {
  resetBeat();
  const engine = new BotEngine();
  engine.setDancing(true);
  for (let i = 0; i < 40; i++) engine.update(0.01);
  assert.equal(engine.dancingLevel, 1);
  resetBeat(true);
  engine.setDancing(true, true);
  engine.update(0.01);
  assert.ok(engine.dancingLevel > 0.95 && engine.dancingLevel < 1, "no abrupt stop");
  for (let i = 0; i < 49; i++) { engine.setDancing(true, true); engine.update(0.01); }
  assert.equal(engine.dancingLevel, 0);
  for (let i = 0; i < 98; i++) { engine.setDancing(true, true); engine.update(0.01); }
  assert.equal(engine.isDancing, false, "the second starts after reaching zero");
  assert.ok(engine.beatConfusedLevel > 0.99);
  for (let i = 0; i < 4; i++) { engine.setDancing(true, true); engine.update(0.01); }
  assert.equal(engine.isDancing, true);
  assert.ok(engine.dancingLevel > 0 && engine.dancingLevel < 0.2, "gradual restart");
  for (let i = 0; i < 150; i++) { engine.setDancing(true, true); engine.update(0.01); }
  assert.equal(engine.dancingLevel, 1, "same unknown state never repeats the stop");
  const eyes = [];
  engine.drawEyeShape = (_ctx, shape) => eyes.push(shape);
  const ctx = { save() {}, restore() {}, clip() {}, translate() {}, scale() {} };
  engine.drawEyes(ctx, {}, 30, 34, 26);
  assert.deepEqual(eyes, ["happy", "happy"], "question badge preserves cheerful closed eyes");
  const at = Date.now();
  feedBeat({ bpm: 120, beatAtMs: at }, at);
  feedBeat({ bpm: 120, beatAtMs: at + 500 }, at + 500);
  engine.setDancing(true, true);
  const before = engine.beatQuestionLevel;
  engine.update(0.05);
  assert.ok(engine.beatQuestionLevel > 0 && engine.beatQuestionLevel < before);
  assert.equal(engine.dancingLevel, 1, "badge fade never interrupts dance");
  for (let i = 0; i < 8; i++) engine.update(0.05);
  assert.equal(engine.beatQuestionLevel, 0);
  resetBeat(true); engine.setDancing(true, true);
  for (let i = 0; i < 170; i++) { engine.setDancing(true, true); engine.update(0.01); }
  assert.equal(engine.isDancing, true);
  resetBeat(true); engine.setDancing(true, true);
  assert.equal(engine.isDancing, false, "another unknown track gets its own single transition");
  assert.ok(danceEase(0.001) < 0.000004);
  assert.ok(1 - danceEase(0.999) < 0.000004);
  resetBeat();
});

test("the engine dances only once asked, and keeps its frames going meanwhile", () => {
  const ops = [];
  const ctx = {
    translate: (x, y) => ops.push(["translate", x, y]),
    rotate: (a) => ops.push(["rotate", a]),
    scale: (x, y) => ops.push(["scale", x, y]),
  };
  const engine = new BotEngine();
  engine.applyDance(ctx, 100, 100);
  assert.deepEqual(ops, [], "not dancing: the context is left alone");
  engine.setDancing(true);
  engine.update(0.05);
  assert.ok(engine.dancingLevel > 0 && engine.busy);
  engine.applyDance(ctx, 100, 100);
  assert.deepEqual(ops.map((o) => o[0]), ["translate", "rotate", "scale", "translate"]);
  // Around the bottom of the body: back where it started.
  assert.equal(ops[3][1], -(50 + engine.ox * 30));
  engine.setDancing(false);
  for (let i = 0; i < 20; i++) engine.update(0.05);
  assert.equal(engine.dancingLevel, 0);
});

// ── Reports from Rust ─────────────────────────────────────────────────────────

const island = { reveals: 0, revealSilently() { this.reveals += 1; } };
registerSpotifyHandlers(island);

test("small position jitter and stale polls cannot send playback time backwards", () => {
  const previous = playing({ position: 20, positionAt: 1000 });
  const jitter = reconcileSpotify(previous, playing({ position: 20.8, positionAt: 2000 }));
  assert.equal(jitter.position, 21);
  assert.equal(spotifyPosition(jitter, 2500), 21.5);
  const stale = reconcileSpotify(jitter, playing({ position: 20.6, positionAt: 1500 }));
  assert.equal(stale.position, 21);
  assert.equal(stale.positionAt, 2000);
  const seek = reconcileSpotify(jitter, playing({ position: 5, positionAt: 3000 }));
  assert.equal(seek.position, 5, "real backwards seeking still works");
});

beforeEach(() => {
  resetVolumeThrottle();
  setLanguage("en");
  State.settings = { ...DEFAULT_SETTINGS, activeIntegrations: [SPOTIFY_ID] };
  State.os = "linux";
  State.tasks = [];
  State.focusId = null;
  State.mode = "hidden";
  State.view = "overview";
  State.paused = false;
  State.loadIntegrationTasks();
  Spotify.state = { ...IDLE_SPOTIFY };
  Spotify.artwork = null;
  island.reveals = 0;
});

const spotifyTask = () => State.tasks.find((t) => t.id === SPOTIFY_ID);

test("the pill wears the track's title, and its own name when nothing plays", () => {
  assert.equal(spotifyTask().name, "Spotify");
  emit("spotify", playing());
  assert.equal(Spotify.state.track.title, "Get Lucky");
  assert.equal(spotifyTask().name, "Get Lucky");
  emit("spotify", playing({ track: track({ id: "spotify:ad:1", title: "" }) }));
  assert.equal(spotifyTask().name, "Advertisement");
  emit("spotify", { ...IDLE_SPOTIFY, running: true });
  assert.equal(spotifyTask().name, "Spotify");
});

test("music starting shows the hidden island once, silently; nothing on Windows-like setups", () => {
  emit("spotify", playing({ playing: false }));
  assert.equal(island.reveals, 0);
  emit("spotify", playing());
  assert.equal(island.reveals, 1);
  emit("spotify", playing({ position: 30 }));
  assert.equal(island.reveals, 1, "only on not playing → playing");
  assert.ok(State.spotifyPlaying);

  // Not declared: nothing dances, nothing shows.
  emit("spotify", { ...IDLE_SPOTIFY });
  State.settings.activeIntegrations = [];
  emit("spotify", playing());
  assert.equal(island.reveals, 1);
  assert.ok(!State.spotifyPlaying);
});

test("the cover arrives on its own event", () => {
  emit("spotify", playing());
  emit("spotify-artwork", { artUrl: "https://i.scdn.co/image/abc", dataUrl: "data:image/png;base64,AA" });
  assert.equal(currentArtwork(), "data:image/png;base64,AA");
});

test("the card reads the player again each time it comes on screen", () => {
  const before = sent("spotify_refresh").length;
  State.mode = "expanded";
  State.view = "overview";
  State.setFocus(SPOTIFY_ID);
  assert.equal(sent("spotify_refresh").length, before + 1);
  State.notify();
  assert.equal(sent("spotify_refresh").length, before + 1, "not again while it stays");
  State.mode = "compact";
  State.notify();
  State.mode = "expanded";
  State.notify();
  assert.equal(sent("spotify_refresh").length, before + 2);
});

// ── Views ─────────────────────────────────────────────────────────────────────

test("the idle card: not playing, or not installed with a way to get it", () => {
  const card = buildSpotifyCard();
  Spotify.state = { ...IDLE_SPOTIFY, installed: true };
  card.sync();
  assert.match(card.el.textContent, /Spotify.*Integration.*Not playing.*Open Spotify/);
  // A player that runs but has no track is named in the header.
  Spotify.state = { ...IDLE_SPOTIFY, running: true, player: "Firefox" };
  card.sync();
  assert.match(card.el.textContent, /Firefox.*Integration.*Not playing/);
  Spotify.state = { ...IDLE_SPOTIFY, installed: true };
  card.sync();
  Spotify.state = { ...IDLE_SPOTIFY };
  card.sync();
  assert.match(card.el.textContent, /Spotify not installed.*Get Spotify/);
  card.el.find("BUTTON")[0].fire("click");
  assert.ok(sent("spotify_open").length > 0);

  setLanguage("fr");
  card.sync();
  assert.ok(card.el.textContent.includes(lookup("Get Spotify", "fr")));
});

test("the playing card: title, artist · album, times, and the controls", () => {
  const card = buildSpotifyCard();
  Spotify.state = playing({ playing: false, shuffle: true });
  card.sync();
  const text = card.el.textContent;
  assert.ok(text.includes("Get Lucky"));
  assert.ok(text.includes("Daft Punk · Random Access Memories"));
  assert.ok(text.includes("0:10") && text.includes("-2:50"));

  const [shuffle, prev, play, next, repeat] = card.el.querySelector("np-buttons").children;
  assert.equal(shuffle.title, "Shuffle on");
  assert.equal(repeat.title, "Repeat off");
  assert.equal(play.title, "Play");
  const before = sent("spotify_control").length;
  shuffle.fire("click");
  repeat.fire("click");
  prev.fire("click");
  next.fire("click");
  play.fire("click");
  assert.deepEqual(sent("spotify_control").slice(before), [
    { action: "shuffle", value: 0 },
    { action: "repeat", value: 1 },
    { action: "previous", value: null },
    { action: "next", value: null },
    { action: "playPause", value: null },
  ]);
  // The page shows the clicks at once.
  assert.equal(Spotify.state.shuffle, false);
  assert.equal(Spotify.state.repeat, true);
  assert.equal(Spotify.state.playing, true);

  Spotify.state = playing({ track: track({ id: "spotify:ad:9", title: "x", artist: "", album: "" }) });
  card.sync();
  assert.ok(card.el.textContent.includes("Advertisement"));
});

test("the pill shows play/pause and next on hover, only with a track", () => {
  const task = spotifyTask();
  const pill = buildSpotifyPill(task, () => {});
  pill.el.fire("mouseenter");
  assert.ok(!pill.el.classList.contains("controls"), "nothing loaded: no controls");
  Spotify.state = playing();
  pill.sync();
  assert.ok(pill.el.classList.contains("controls"));
  const [playBtn] = pill.el.querySelector("np-pill-controls").children;
  assert.equal(playBtn.title, "Pause");
  const before = sent("spotify_control").length;
  playBtn.fire("click");
  assert.deepEqual(sent("spotify_control").slice(before), [{ action: "playPause", value: null }]);
  assert.equal(Spotify.state.playing, false);
  pill.el.fire("mouseleave");
  assert.ok(!pill.el.classList.contains("controls"));
});


test("the volume bar follows Spotify reports instead of retaining an independent value", () => {
  Spotify.state = playing({ volume: 24, volumeAvailable: true });
  const card = buildSpotifyCard();
  card.sync();
  const volumeBox = card.el.querySelector("np-volume");
  assert.equal(volumeBox.querySelector("np-fill").style.width, "24%");
  Spotify.state = playing({ volume: 83, volumeAvailable: true });
  card.sync();
  assert.equal(volumeBox.querySelector("np-fill").style.width, "83%");
  assert.equal(volumeBox.title, "Volume 83%");
});

test("an unavailable Spotify volume cannot silently control the Windows mixer", () => {
  Spotify.state = playing({ volume: 65, volumeAvailable: false });
  const card = buildSpotifyCard();
  card.sync();
  const volumeBox = card.el.querySelector("np-volume");
  const bar = volumeBox.querySelector("np-bar");
  const before = sent("spotify_control").length;
  const event = { button: 0, pointerId: 1, clientX: 90, stopPropagation() {} };
  for (const fn of bar.listeners.get("pointerdown")) fn(event);
  for (const fn of bar.listeners.get("pointerup")) fn(event);
  assert.equal(Spotify.state.volume, 65);
  assert.equal(volumeBox.style.opacity, "0.4");
  assert.equal(sent("spotify_control").length, before);
});

test("dragging sends the final volume in order and remote readbacks do not move the held thumb", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    Spotify.state = playing({ volume: 50, volumeAvailable: true });
    const card = buildSpotifyCard();
    card.sync();
    const bar = card.el.querySelector("np-volume").querySelector("np-bar");
    bar.getBoundingClientRect = () => ({ left: 0, width: 100 });
    const fire = (type, clientX) => {
      for (const fn of bar.listeners.get(type) ?? []) fn({ button: 0, pointerId: 1, clientX, stopPropagation() {} });
      card.sync();
    };
    const before = sent("spotify_control").length;
    fire("pointerdown", 20);
    mock.timers.tick(0);
    await new Promise((resolve) => setImmediate(resolve));
    fire("pointermove", 80);
    Spotify.state = { ...Spotify.state, volume: 20 }; // an older confirmed readback
    card.sync();
    assert.equal(bar.querySelector("np-fill").style.width, "80%");
    fire("pointerup", 80);
    mock.timers.tick(120);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent("spotify_control").slice(before), [
      { action: "volume", value: 20 }, { action: "volume", value: 80 },
    ]);
    mock.timers.tick(120);
  } finally { mock.timers.reset(); }
});
