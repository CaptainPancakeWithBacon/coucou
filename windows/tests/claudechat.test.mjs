// A regular Claude Desktop chat reply is ready (src/island/claudechat.ts).

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import "./tauri.mjs";
import { DEFAULT_SETTINGS, State } from "../src/core/state.ts";
import { replyReady } from "../src/island/claudechat.ts";

const ID = "agent_claude-desktop";
let emotes;
const island = { emote: (name) => emotes.push(name) };

beforeEach(() => {
  emotes = [];
  State.settings = { ...DEFAULT_SETTINGS, soundEnabled: false };
  State.tasks = [];
  State.paused = false;
});

test("a ready reply makes Mochi jump and the Claude Desktop pill says so", () => {
  State.upsertExternalAgent(ID, "Claude Desktop", "#D97757");
  replyReady(island);
  assert.deepEqual(emotes, ["happy"]);
  const task = State.tasks.find((t) => t.id === ID);
  assert.deepEqual(task.steps, ["Reply ready"]);
  assert.equal(task.pillBadge, "finished");
});

test("without the pill Mochi still jumps, and a paused Coucou stays quiet", () => {
  replyReady(island);
  assert.deepEqual(emotes, ["happy"]);
  State.paused = true;
  replyReady(island);
  assert.deepEqual(emotes, ["happy"], "nothing more while paused");
});
