<img src="docs/nplay-lockup.svg" alt="nplay" width="300">

# nplay

A simple local music/video player — the playback companion to the
**ndisc** suite ([`ndisc`](https://github.com/xjmzx/ndisc),
[`ndisc.tree`](https://github.com/xjmzx/ndisc.tree),
[`ndisc.smpl`](https://github.com/xjmzx/ndisc.smpl)).

**Stack:** Tauri 2 desktop binary + React 19 + TypeScript + Tailwind v3,
mirroring the rest of the suite (shared palette, `Section`, `cn`). Audio
plays through a **native Rust engine** (`rodio` on a dedicated thread) —
WebKit2GTK can't play local media — while video plays in a webview
`<video>` fed by a small in-process loopback HTTP server (`tiny_http`).
The library is indexed into SQLite (`rusqlite`) with tags + embedded
covers read via `lofty`.

> **Status: beta (v0.2.0-beta.1).** Playlists, video playback, BPM, a
> spectrum visualiser and a sortable table view are all in; see the
> CHANGELOG for the running roadmap.

## Features

- **Library index** — scan a music root (default `/data/music`) into a
  local SQLite cache: artist/album/title/year/track-no, duration, codec,
  and a folder or embedded cover per album. Inline tag edits are written
  back to disk via `lofty` (`set_track_field`).
- **Two browse views** — an Artist → Album → Track **collection tree**
  (lazy-loaded per album) and a flat, sortable/virtualised **table view**
  (`list_all_tracks`).
- **Native audio playback** — `rodio`-backed play / pause / stop,
  previous / next, click-to-seek, volume; **spacebar** toggles play/pause.
  Shuffle and repeat (off / all / one).
- **Video playback** — mp4 / m4v play with picture via the loopback media
  server.
- **Now playing** — large cover art with title / artist / album, plus a
  real-time **spectrum visualiser** (`audio_spectrum`).
- **Playlists** — a working playlist that auto-persists by path, with
  Strawberry-compatible `.xspf` load / save and drag-reorder.
- **Queue** — the current play order; click to jump.
- **BPM** — per-track BPM (`track_bpm`) read from the suite-shared
  `bpm.json` store, with an aubio fallback.
- **Library health** — flags unplayable / undecodable formats with an
  acknowledge action (`library_health`).
- **Current** — a read view of the suite's Nostr `feed.v1` stream
  (`CurrentView`, `useFeed`).
- **Theming** — three-way switch (fizx → upleb → mono).

### Planned

- Responsive auto-collapse of panels at narrow widths.
- A "verify library" decode-probe pass — catch corrupt files of a
  supported format that the scan-time check can't flag.
- Further video-section work beyond current playback.

See the CHANGELOG "Roadmap" for the full list.

## Install dependencies (Debian / Ubuntu)

Tauri's [Linux prerequisites](https://tauri.app/start/prerequisites/#linux)
plus GStreamer codecs for the formats you play:

```sh
sudo apt update
sudo apt install \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  build-essential \
  curl wget file \
  gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav
```

Plus a Node toolchain (18+) and Rust (rustup).

## Quick start

```sh
make deps      # npm install + cargo fetch
make dev       # opens the Tauri window with hot reload
```

## Build / install

```sh
make install                       # user-level (default PREFIX=$HOME/.local)
sudo make install PREFIX=/usr/local
make uninstall
make check                         # tsc + vite build + cargo check
```

The desktop entry is generated from `nplay.desktop.in` with the install
paths substituted in.
