// Spotify's reports → the page (src-tauri/src/spotify.rs). The parts of
// SpotifyController.swift that touch the app: the pill wears the track's
// title, music starting shows the compact island without a sound, and the
// card reads the player again whenever it comes on screen (seeks made in
// Spotify's own window are never signalled).

import { Bridge, onEvent } from "../core/bridge";
import { pillDefinition } from "../core/pills";
import { SPOTIFY_ID, Spotify, isAd, type SpotifyState } from "../core/spotify";
import { State } from "../core/state";
import { setTrackBpm } from "../mochi/beat";
import { t } from "../i18n/i18n";

export interface SpotifyHost {
  /** Compact island from hidden, no peek sound. */
  revealSilently(): void;
}

export function registerSpotifyHandlers(island: SpotifyHost) {
  void onEvent<SpotifyState>("spotify", (s) => applySpotify(island, s));
  void onEvent<{ artUrl: string; dataUrl: string }>("spotify-artwork", (art) => {
    Spotify.artwork = art;
    State.notify();
  });
  State.subscribe(() => {
    syncPillName();
    refreshWhenShown();
  });
}

// Cache lookup results (including misses) per recording within the running app.
// Never request credentials from Spotify; the optional provider runs in Rust.
const tempoCache = new Map<string, number | null>();
let tempoRevision = 0;

async function lookupTrackBpm(id: string, title: string, artist: string, revision: number) {
  let value = tempoCache.get(id);
  if (value === undefined) {
    const result = await Bridge.bpmLookup(title, artist);
    value = result != null && Number.isFinite(result) && result >= 40 && result <= 220 ? result : null;
    tempoCache.set(id, value);
  }
  if (revision !== tempoRevision || Spotify.state.track?.id !== id) return;
  Spotify.trackBpm = value;
  setTrackBpm(value);
}

/** A report from Rust (or the answer to a refresh). */
export function applySpotify(island: SpotifyHost, next: SpotifyState) {
  const wasPlaying = State.spotifyPlaying;
  const oldId = Spotify.state.track?.id;
  Spotify.state = next;
  const track = next.track;
  if (oldId !== track?.id) {
    const revision = ++tempoRevision;
    Spotify.trackBpm = null;
    setTrackBpm(null);
    if (track && next.playing && !isAd(track) && track.title && track.artist) {
      void lookupTrackBpm(track.id, track.title, track.artist, revision);
    }
  } else if (track && next.playing && Spotify.trackBpm == null && tempoCache.has(track.id)) {
    Spotify.trackBpm = tempoCache.get(track.id) ?? null;
  }
  syncPillName();
  // Only on not playing → playing (SpotifyController.setPlaying).
  if (!wasPlaying && State.spotifyPlaying && !State.paused && State.mode === "hidden") {
    island.revealSilently();
  }
  State.notify();
}

/** SpotifyController.syncTaskName: the track's title, else the pill's name. */
export function syncPillName() {
  const task = State.tasks.find((x) => x.id === SPOTIFY_ID);
  if (!task) return;
  const track = Spotify.state.track;
  const title = isAd(track) ? t("Advertisement") : (track?.title ?? "");
  const name = title || (pillDefinition(SPOTIFY_ID)?.name ?? "Spotify");
  if (task.name !== name) task.name = name;
}

let shown = false;

function refreshWhenShown() {
  const now = State.mode === "expanded" && State.view === "overview" && State.focusTask?.id === SPOTIFY_ID;
  if (now && !shown) void Bridge.spotifyRefresh();
  shown = now;
}
