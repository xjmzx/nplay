<img src="docs/nplay-lockup.svg" alt="nplay" width="300">

# nplay

A simple local music/video player — the playback companion to the
**ndisc** suite ([`ndisc`](https://github.com/xjmzx/ndisc),
[`ndisc.tree`](https://github.com/xjmzx/ndisc.tree),
[`ndisc.smpl`](https://github.com/xjmzx/ndisc.smpl)).

**Stack:** Tauri 2 desktop binary + React 19 + TypeScript + Tailwind v3,
mirroring the rest of the suite (shared palette, `Section`, `cn`).
Playback uses the webview's `HTMLMediaElement` over WebKit2GTK/GStreamer
— the same proven path the suite uses for sample preview, which also
gives video playback for free. The library is indexed into SQLite
(`rusqlite`) with tags + embedded covers read via `lofty`.

> **Status: scaffold (v0.1.0-beta.1).** Audio MVP: scan `/data/music`
> into an indexed library, browse an Artist → Album → Track tree, play
> with transport + seek + volume, now-playing cover art, and a queue.
> Persistent playlists and video playback are planned next.

## Features

- **Library index** — scan a music root (default `/data/music`) into a
  local SQLite cache: artist/album/title/year/track-no, duration, codec,
  and a folder or embedded cover per album.
- **Collection tree** — Artist → Album → Track, lazy-loaded per album.
- **Transport** — play/pause, previous/next, click-to-seek, volume.
- **Now playing** — large cover art with title/artist/album.
- **Queue** — the current play order; click to jump.

### Planned

- Persistent playlists.
- Video playback for audio-visual files (already indexed + marked).
- BPM display (reuse `ndisc.smpl`'s aubio `detect_bpm`).

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
