# nplay — music & video player

> Part of the **n-suite**. Shared conventions, the Nostr wire contract, the
> design language, and the roadmap live in the hub doc:
> **[ndisc/SUITE.md](https://github.com/xjmzx/ndisc/blob/main/SUITE.md)**
> (locally: `../ndisc/SUITE.md`). This file covers **nplay** specifically.

`nplay` is a deliberately simple, suite-styled player for the same `/data/music`
library `ndisc` catalogues — a lighter alternative to Strawberry, native to the
suite's look and Nostr feed.

## What it does
- Indexes the library into SQLite (parallel `lofty` tag read; full
  wipe-and-rebuild each Scan, so the Collection exactly mirrors disk — new,
  changed, **and** removed).
- **Collection · Playlist · Stage** layout: Artist→Album→Track tree (sort +
  filter + video-only), a Playlist that *is* the play queue, and a unified
  stage showing album art or live video plus a real-time spectrum visualizer.
- Transport with shuffle, repeat (off/all/one), click-drag seek, spacebar
  play/pause, and a BPM readout (aubio, cached).
- **Sticky now-playing**: playback is decoupled from the queue, so opening a
  saved playlist, editing the queue, or rescanning never interrupts the current
  track (audio or video) — it plays to its end unless you intervene.
- Flags **unplayable** formats (APE/WMA/WavPack/TAK) and playlist entries that
  have gone **missing** from the library, with a one-click broom to clear them.

## Tech stack & build
Tauri 2 · React + Vite + TypeScript · SQLite (`rusqlite`) · **native audio via
`rodio`** (not the webview — see the hub's audio note) · mp4 video via a Rust
loopback server (needs `gstreamer1.0-libav`). `make dev` / `make install`.

## Suite integration
- **Reads** the shared `feed.v1` channel in its **Current** view (release-feed
  notes from `ndisc`).
- Shares the suite's palette, collapse-flanks layout, and leaf/foliage
  vocabulary. A near-term goal is adopting `ndisc`'s **tree-dots + track/disc
  count** styling and surfacing a release's **published-to-Nostr** status here.
- Playback complements `ndisc` (catalogue) and `ntree`/`nsmpl` (sampling) over
  the same on-disk library.

## Nostr surface
**Read-only.** Consumes the feed channel (`31239`) for the Current view via
`nostr-tools`; it holds **no keys** and publishes nothing. (Reactions/publishing
could be added later, but signing would need a key path first.)

## Styling notes
Follows the shared language. Squared UI, unified Now-Playing/video stage,
collapse-flanks columns. The spectrum visualizer uses the accent palette.

## Backlog & direction
- Adopt tree-dots + track/disc-count styling (suite integration goal).
- Surface published-to-Nostr status per release.
- More video work (formats beyond mp4/m4v; a future `ntree` normalize pass).
- **BPM** refinement — possibly emitting a value as its own `nevent` when worth
  sharing (see the hub roadmap).
- Post-track-end behaviour after opening a playlist currently rolls into the new
  list from the top; may become a user preference.
