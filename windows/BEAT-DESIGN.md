# Streaming beat synchronisation

The source baseline is origin/main (`fb23040`). Audio remains local and scoped to
Spotify's process tree on Windows; no microphone, song upload or Web API key is added.

The Rust tracker starts with a 2.5-second window and reviews every 0.5 seconds during
the first six seconds. It publishes an early estimate only when onset/phase confidence
passes the gate. Clear percussion can therefore be acquired in roughly 2.5–3 seconds;
quiet intros, ambiguous half-time rhythms and silence can legitimately take longer.
After acquisition it keeps at most 12 seconds of samples, analyses once per second,
and periodically compares an unbiased estimate against its tempo prior. An alternative
must be stronger and consistent for two seconds. There is no periodic reset.

The renderer confirms the initial estimate across two reports, integrates tempo and
phase corrections continuously, and keeps the current tempo until a replacement has
enough supporting observations. Pausing, seeking or restarting capture does not reset
the remembered tempo. Only changing songs or disabling beat sync clears it. The
unknown-tempo badge has a one-second initial hold per new track, independently of eyes.

## Repositories reviewed

* [DeepRhythm](https://github.com/bleugreen/deeprhythm) uses an eight-second HCQM
  representation, six modulation harmonics and a PyTorch CNN to classify **tempo**.
  The repository is AGPL-3.0. Its reported inference speed does not remove the input
  window or provide a streaming beat phase. Shipping PyTorch/weights is a poor fit
  for this small Rust app and changes distribution obligations. No code or weights
  were copied. Harmonic evidence and octave ambiguity are already addressed by the
  existing timestretch onset/beat-grid path; this update improves windowing and
  confidence-gated streaming updates around that existing implementation.
* [bpm-searcher](https://github.com/ooyamatakehisa/bpm-searcher) is MIT-licensed and
  queries Spotify audio features. It is a metadata lookup, not an audio/beat-phase
  detector. [Spotify restricts audio features and audio analysis for new use cases](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api).
  It therefore cannot be a dependable keyless fallback or align Mochi to the audible
  beats. No external service was added.

Windows playback time now anchors SMTC Position to LastUpdatedTime as specified by
[Microsoft's timeline contract](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessiontimelineproperties).
The UI ignores stale anchors and smooths small clock jitter, while real seeks still
replace the position and reacquire phase.
