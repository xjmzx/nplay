# nplay — notes for Claude

Music and video player. Tauri 2 · React · SQLite · rodio. See
[`nplay-introduction.md`](nplay-introduction.md).

## Read SUITE.md first

[`../ndisc/SUITE.md`](https://github.com/xjmzx/ndisc/blob/main/SUITE.md) is
authoritative for anything shared across the suite. Read it **before making a
platform-sensitive choice** — audio and media especially, which is most of what
this app does. It records constraints invisible on the machine you are working
on: `nchat` shipped Web Audio tones that worked on macOS and were silent on
Linux, a constraint SUITE.md had already recorded.

## Build and verify

```
make dev      # hot reload
make check    # npm run build (tsc + vite) + cargo check
make build    # release
```

Release path is `tauri build`, which runs Vite. **Never `cargo build --release`**
— it skips the frontend.

## Traps specific to this repo

- **Playback lives in Rust, not the webview, and must stay there.** WebKit2GTK
  on the target Linux stack cannot play media from any app URL scheme, so audio
  goes through `rodio` (`symphonia-all`). Moving playback into the webview to
  simplify something will produce a player that is silent on Linux while working
  on macOS. Web Audio is broken on the same stack; short clips elsewhere in the
  suite use an `HTMLMediaElement`.
- **No keys.** This app reads the feed channel and publishes nothing — there is
  no signing path to reach for.
- SQLite (`rusqlite`, bundled) backs the local library index; the shared suite
  directory holds what the *other* apps read.

## Not here

Machine-local paths, server addresses, credentials and per-box ops belong in a
machine-local `CLAUDE.md`, never in this file. **This repo is public.**
