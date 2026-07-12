# Changelog

All notable changes to **ndisc.play** (`nplay`). Unlike the publishing/consuming
siblings (ndisc / ndisc.view / glmps), nplay is a local player and **not** a
participant in the ndisc Nostr wire contract, so it tracks a single axis: this
app's own semver, below.

## 0.1.0-beta.4 — unreleased

### Library health
- **New "Library health" dialog**, opened from the library summary in the
  header. Two jobs: show how far the index has drifted from disk, and explain
  what nplay can't play — and why.
- **Index vs disk.** Walks the music root and diffs it against the index:
  indexed / on disk / last scanned, plus the exact files that are on disk but
  unindexed, or indexed but gone. A **Rescan** button sits in the drift warning
  itself. Read-only — it touches nothing.
- **Problem files, grouped by cause, each with its fix stated.** *No decoder*
  (APE/WavPack/TAK/WMA — lossless formats rodio can't read; the files are not
  damaged, and transcoding to FLAC is lossless→lossless). *No picture*
  (non-mp4/m4v containers — these still play, audio-only; the fix is to remux
  to H.264/AAC faststart mp4, which is ntree's "Normalize videos" job).
- **Acknowledgement.** Files can be marked seen-and-accepted; they dim out, stop
  being counted, and the header's `unplayable` warning goes from auburn to
  muted, reading `N unplayable (acknowledged)`. The count *stays* — the fact
  hasn't gone away — but it stops shouting. Keyed by **path, not track id**:
  ids are reassigned on every wipe-and-rebuild, so an id-keyed acknowledgement
  would silently detach at the next scan, which defeats the point.
- **nplay never deletes library files.** Both problems above are fixable rather
  than disposable, and anything already published to Nostr is tracked by ndisc —
  which is where a destructive operation would have to live, so it could refuse
  to touch a published release.

### Fixed
- **A rescan no longer discards cached BPM.** `scan_library` is wipe-and-rebuild,
  and it was throwing away every BPM it had. Each one costs an aubio subprocess,
  so they accrue slowly over months of listening — silently binning them on every
  scan meant they could never accumulate. Now carried across by path (the file at
  a given path is the same file; its tempo did not change because we re-indexed).

### Added
- `last_scanned_at` is recorded on every successful scan (in a new `meta` table
  that scans deliberately do not wipe) and surfaced in the header as
  `scanned N ago`. It rides on the cheap `library_stats` call, not on
  `library_health`, so the header never triggers an 18,000-file disk walk.

## 0.1.0-beta.3 — 2026-07-07

### BPM readout
- The now-playing meta line shows the track's **BPM**, detected via
  `aubio tempo` off the UI thread and **cached in the library DB** (whole
  number) so replays are instant. Degrades silently when aubio isn't present;
  the Linux bundle now depends on **aubio-tools**.

### Now-playing / Collection polish
- **Drag a release (or track) from the Collection onto the Playlist** to
  append it — the panel highlights while a drag is over it. (Internal
  row-reorder is unaffected.)
- Fixed the Spectrum vanishing for **audio** tracks — the widened stage let
  the square cover art squeeze the visualiser to zero height (video's 16:9
  art didn't, which is why only video kept its idle loop). Cover art is now
  size-capped; the Spectrum header no longer collapses the whole stage.
- Brighter release info; the release **year** now matches the title's blue;
  row action buttons (play / add / reveal / remove) sit at a dim, always-
  visible default instead of appearing only on hover.
- Video sits on the grey panel tone (centred, height-capped), so a
  sub-desktop-resolution or non-16:9 clip fills the letterbox with the
  surface colour rather than hard black.

## 0.1.0-beta.2 — 2026-07-07

### Square UI + Collection rework — 2026-07-07
- **90° corners everywhere but the Section panels.** Suite style pass: the
  Collection artist/release pills become square highlights that fill the row
  and put the release/track counts in their own matching, fixed-width boxes
  (so 1- and 2-digit counts stay aligned). Track rows, codec badges, the
  playlist toolbar, table inputs, the transport progress bar + volume knob,
  the version chip and the Current-feed topic pills are all squared too.
  Default box tint dropped a touch (/15 → /10), hover brightens to /25.

### Unified media stage — 2026-07-07
- **Now Playing + Video are one stage.** The media square shows album art for
  audio and swaps to the live `<video>` for a picture-playable mp4/m4v (hover
  fullscreen button), so there's no dead art panel during video nor an empty
  video panel during audio. The separate Video column is retired — layout is
  now Collection · Playlist · Stage. Non-mp4 video stays audio-only with a note.
- **Spectrum idle loop.** While an mp4 video plays (its audio is decoded by the
  webview, never touching rodio), the spectrum shows a subtle looping pattern
  instead of sitting flat; audio and non-mp4 video keep the real FFT.

### Playlist — 2026-07-01
- **Cleanup quick wins**: remove-unavailable, remove-duplicates, and
  show-in-file-browser (per row).
- **Sort + drag-reorder**: one-shot sort by artist/album/title/duration and
  HTML5 drag-reorder; clearing keeps the current track playing.

### Status footer + seek — 2026-07-01
- Thin suite-standard status footer (stack · db path) below the transport, and
  the progress bar is now **drag-scrubbable** (commits the seek on release).

### Current feed view — 2026-06-30
- A read-only **`current`** view consuming the suite's Nostr feed (kind 31239),
  reached from a header Player · Table · Current view cluster. No keys, no
  publishing — consumer only.

### Video — 2026-06-30
- **.m4v plays with picture** (not audio-only) over the loopback media server.

### Keyboard — 2026-06-30
- **Spacebar toggles play/pause** app-wide — ignored while typing in a field
  (the Collection / table filters, inline tag-edit cells) and on key-repeat or
  modifier combos.

### Library table view
- A flat, sortable, **virtualized** Tracks table (header view toggle) — the
  hierarchically-flat counterpart to the Collection. In-table filter over
  artist/album/title; double-click a row to play; inline tag-editing of title
  and track # written back to the file via lofty.

### Performance
- The spectrum animates only while playing (+ a Rust FFT idle back-off); the
  250ms transport poll no longer re-renders the Collection/Playlist (those
  panels are memoized — only the footer updates per tick); the table renders
  only its visible rows.

## 0.1.0-beta.1 — 2026-06-29

### Header version chip — 2026-06-29
- The app version (`getVersion()` → `tauri.conf.json`) is pinned in the header
  beside the title as a `v0.1.0-beta.1` chip, matching the suite's mauve mono
  chip (ndisc / smpl / tree).

### Unplayable-format detection at scan — 2026-06-29
- **Scan-time `playable` flag.** Formats the audio backend has no decoder for
  (APE, WMA, WavPack, TAK) are now flagged during the scan from the file
  extension — no probing needed — so the UI can warn before you click. (A
  corrupt-but-valid file of a supported format is still caught by the existing
  play-time skip.)
- **Visual treatment.** Unplayable tracks are dimmed + struck through in the
  Collection and Playlist, with a small format badge (e.g. `APE`) and a
  "can't be decoded — will be skipped" tooltip.
- **Skipped by playback.** Prev/next, auto-advance and shuffle all walk only
  the playable tracks, so playback never lands on a dead format (manual
  double-click still attempts it, with the skip as backstop).
- **Library summary** in the header — `N albums · M tracks · K unplayable` —
  so you can see what a scan brought in. Requires a re-scan to populate the
  flag for an existing library.

### Shuffle + repeat — 2026-06-29
- **Repeat** button in the header transport cycles **Off → All → One**
  (`Repeat`/`Repeat1` glyphs). With the unified playlist this covers every
  loop scope: loop a release (play the album + Repeat All), loop the playlist
  (Repeat All), or loop the current track (Repeat One).
- **Shuffle** toggle plays the list in a random order. Proper play-through
  shuffle — a Fisher–Yates permutation keeping the current track first — so
  every track plays once before any repeats (not naive re-rolling). Prev/next
  walk the shuffled order; Repeat All reshuffles at the end of a pass.
- Both modes persist across launches; a user skip never traps on a track under
  Repeat One, and an undecodable track still skips forward rather than looping.

### Now-playing spectrum + queue/playlist unification — 2026-06-29
- **Playlist is now the play queue.** Removed the separate Queue panel: the
  playlist is the single live list, with `index` marking the playing track.
  Playing an album from the Collection replaces the list and starts there;
  the `＋` buttons remain the non-destructive append. Removing/clearing keeps
  the highlight sane and stops playback when the list is emptied.
- **Real-time spectrum visualiser** fills the freed Now-playing space. Audio
  is decoded by rodio in Rust (outside the webview, where Web Audio is muted),
  so a `SpectrumTap` mirrors the sample stream into a ring buffer; a dedicated
  thread runs a Hann-windowed FFT (`rustfft`) ~30×/s and folds it into 28
  log-spaced bars (40Hz–16kHz, dB-scaled, fast-attack/slow-decay). The
  frontend polls the bars onto a canvas on a rAF loop — no per-frame React
  render — and they settle to rest when paused/stopped.

### VIDEO section — picture playback — 2026-06-28
- **4th section: Video** (right-most, collapsible). mp4 now plays with picture
  in a webview `<video>` element.
- **Loopback media server.** WebKit2GTK can't play local media over the asset
  protocol (confirmed `MediaError 4`), so a small Rust `tiny_http` server on
  `127.0.0.1` streams library files with full HTTP **Range** support; `<video>`
  points at it. mp4 tracks bypass rodio; non-mp4 video stays audio-only.
- **Unified transport.** The header/footer transport (play/pause, seek, prev,
  volume, auto-advance) drives the `<video>` element for mp4, rodio otherwise;
  the Video panel auto-expands when a video starts.
- **Collection video filter.** A `Video` toggle in the Collection controls
  restricts the tree to video-bearing albums (only their video tracks shown);
  playable mp4 tracks are tinted in the vibrant `digital` hue.
- **Requires `gstreamer1.0-libav`** (provides `avdec_h264`/`avdec_aac`) for
  H.264 playback — a packaging dependency for the eventual `.deb`. Non-mp4
  containers and non-faststart mp4s need conversion (planned ntree batch op).

### Scan feedback + playlist polish — 2026-06-28
- **Persistent header scan meter.** Replaced the terse "%/scanning…" header
  text with a permanent compact progress meter in the header's right cluster:
  a muted track at rest that fills with the accent on scan and settles back,
  in a fixed-width slot so it never shifts the layout. Covers both first import
  and manual re-scan.
- **Smoother, readable progress.** `scan-progress` now carries the current
  file path; an `index` phase flags the (previously silent) album-build + DB
  write; progress emits on a fine cadence (~200 ticks) so the fill sweeps
  rather than jumping. A green "done" bar is held ~900ms after a fast scan so
  completion actually registers.
- **Steady Scan button.** Pinned width so it no longer reflows between
  "Scan"/"Scanning", and its rollover tint latches on (pressed look) for the
  whole scan instead of dimming.
- **Playlist: double-click to play.** Matches the Collection tree's gesture;
  single-click no longer starts playback. Toolbar Play button unchanged.

### Initial player
- **Native local playback (rodio + symphonia).** WebKit2GTK can't play
  app-scheme local media on this stack, so audio is decoded in Rust on a
  dedicated thread and driven over IPC; the frontend polls position/finished.
  Uniform seeking across FLAC/MP3 (+AIFF and video-audio).
- **Indexed SQLite library** of `/data/music` (walkdir + rayon + lofty),
  full wipe-and-rebuild scan; tracks resolved by file path.
- **Collapsible 3-pane layout** — Collection · Playlist · (Now playing +
  Queue) — with sort + filter, collapse-flanks, and a header master transport.
- **Playlists** — working playlist auto-persists by path; Load/Save
  Strawberry-compatible `.xspf`.
- **Video files play audio-only** via an ffmpeg-extracted cached WAV;
  undecodable files flag an error and auto-skip.

## Roadmap

### Next (v0.1.0-beta.2)
- **Further video / Video-section work** — beyond the current mp4 loopback
  playback.
- (done: spacebar play/pause; the flat sortable library table view.)

### Later
- **Library video normalization** — a batch "Normalize videos" op in **ntree**
  to remux/transcode legacy library videos (mpg/avi/mov, non-faststart mp4) to
  playable H.264/AAC faststart mp4, so nplay plays the whole set with picture.
- BPM display (aubio, ported from the smpl detector).
- Responsive auto-collapse of panels at narrow widths.
- Playlist reorder (drag / up-down).
- "Verify library" decode-probe pass (catch corrupt files of a supported
  format that the scan-time format check can't flag).
