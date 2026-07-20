# Changelog

All notable changes to **ndisc.play** (`nplay`). Unlike the publishing/consuming
siblings (ndisc / ndisc.view / glmps), nplay is a local player and **not** a
participant in the ndisc Nostr wire contract, so it tracks a single axis: this
app's own semver, below.

## 0.2.0-beta.1 — unreleased

### Filter the Collection by record label
- **Label filter** in the Collection toolbar — a dropdown of every label in the
  library with its album count; selecting one narrows the tree (and auto-expands
  matches, like the other filters).
- Labels are joined from **ndisc's `catalogue.json`** by album folder
  (`albums.dir`), not read from the files: only ~28% of the library carries a
  label tag, where ndisc has one for ~77% of the catalogue. New `label` /
  `catalog` columns, migrated in place.
- The join runs at scan-end **and on every library load**, so re-exporting the
  manifest from ndisc just needs a relaunch — no rescan. Cached by folder.
- Batched into **one transaction**: ~2.4k individual UPDATEs each committing (and
  fsyncing) separately cost seconds on every library load. Also names the current
  step next to the spinner ("syncing labels…" / "loading library…").

### Monochrome theme — and it is now the default

- **New `mono` theme**, and the title now cycles **fizx → upleb → mono**.
- **Chrome goes greyscale; MEANING keeps its colour.** Each `.theme-mono` block
  declares *only* the greyscale tokens — anything it does not redeclare keeps its
  `:root` value, so `ok` / `warn` / `alert` / `nostr` / `medium` (and ndisc's
  genre + year palettes) stay coloured with no work. **The block is a list of
  what does not mean anything.** That is the whole design.
- The brand tokens (`accent` / `mauve` / `digital` / `auburn`) were each doing two
  jobs. Hue was never their only carrier — hierarchy also lives in indent, fill,
  icons and labels — so it moves onto **luminance**: `mauve` (upper tier) sits
  brighter than `digital` (lower tier), the order the hues implied.
- **Monochrome is the DEFAULT.** No stored choice, an unrecognised one, or no
  localStorage at all → `mono`. An existing choice is respected; only a fresh
  install lands there.
- **Fixes a theme flash on every launch.** The theme class was applied in a
  `useEffect`, which runs *after* the first paint — so each launch showed the
  old default before the real theme landed, and on a fresh install that flash
  *was* the user's first impression. It is now set pre-render by an inline script
  in `index.html`, with a `catch` that falls back to mono if storage throws.

### nplay finally has a theme switch

- nplay had `.theme-upleb` in its CSS and **no switch wiring at all** — the theme
  was defined and unreachable, the only app in the suite like that. It now has
  the same three-way title toggle as its siblings.
- `auburn` stays **coloured** here, unlike the other apps: in nplay it marks
  unplayable / missing files, and in TableView's playable dot (`bg-ok` vs
  `bg-auburn`, no text beside it) **hue is the only channel**. Grey it and the
  information is gone.

## 0.1.0-beta.9 — unreleased

### Collection — ghost rows
- The space below the tree now keeps the list's rhythm going instead of falling
  away to flat panel. A hard filter (a few artists, or none at all) used to leave
  a dead rectangle; it now carries a faint trace of the rows that would come
  next. Same idea as the Playlist's ghost rows, and it covers the **"No matches"**
  state, which is the sharpest version of the case.
- It traces the **artist** row, not the release row. Collection is a tree of three
  row types (artist = mauve, release = digital, track = bare) and a ghost can only
  be one of them — at the bottom of the list, the next thing that would appear is
  an artist.
- It reproduces the artist row's **geometry**, not just its colour: the 20px
  chevron gutter, the flexible name fill, the 36px count chip. A plain full-width
  stripe would line up with nothing and read as a different element rather than a
  trace of the next one.
- Collection still has **no container background** — the crispness comes from
  never stacking translucent fills, and the ghost is a single faint layer (mauve
  at /5, below the real /10) rather than a surface.

## 0.1.0-beta.8 — unreleased

### BPM round trip — nplay now *reads* the store, not just writes it
- **Closes a hole that made the whole store pointless in practice.** nsmpl can
  now assert a BPM (see nsmpl v0.3.0-beta.7 — a bar-derived, human-asserted
  value), and the precedence rule correctly stopped aubio *overwriting* it. But
  `track_bpm` only ever consulted its own `tracks.bpm` cache, and the store was
  read at **scan** time alone. So playing a hand-corrected track made nplay run
  aubio, cache the guess, and **display the guess** — while the store quietly
  held the right answer, until the next full rescan. Protection without
  consultation is worthless.
- `track_bpm` now resolves in order: **suite store (human-asserted) → DB cache →
  detect with aubio**. A human value short-circuits aubio entirely and is folded
  back into the cache so the rest of the app agrees.

### Now playing — technical detail
- The spec line was **quieter than the release year above it**, which is
  backwards: this is what you actually interrogate a track for. Now 13px,
  `font-medium`, `text-fg/80` (was 11px at 55%), with more air and room to
  spread. Title / artist / release are unchanged.
- **BPM is set apart** from the format specs — it's a musical fact, not a
  container fact, and it's the one value here a human can assert. Mauve, matching
  nsmpl's BPM chip, so the two apps agree on what colour a tempo is.
- **A detected BPM is marked `?` and shown muted.** aubio has a known
  octave-error problem, so its number is a *guess*; a value you asserted in nsmpl
  reads in full mauve with no `?`. `track_bpm` returns the `source` alongside the
  number to make that distinction possible — showing the figure alone would
  flatten exactly the thing the store exists to track. The `?` also makes visible
  how much of the library's BPM data is still unverified.

## 0.1.0-beta.7 — unreleased

### BPM store — precedence hardened
- **Fixes a latent data-loss bug in the store shipped one version ago.** The
  precedence check was a literal, `existing.source == "tap"`, which protected a
  human value **by name**. nsmpl already derives BPM from a cut loop's bar count
  (`bars` — see below), and the moment it started writing, the next aubio run on
  that track would have silently clobbered it. Nothing had been lost yet, since
  nothing writes `bars` today; the rule was wrong before it could bite.
- **Trust is now two tiers, not a list of names.** `aubio` is *detected* (a
  guess — it has a known octave-error problem); `tap` and `bars` are
  *human-asserted* (ground truth). A detection may only overwrite another
  detection, or an absent entry. A human value may overwrite anything, newest
  winning within the tier.
- The rule is deliberately expressed as **what a detection is allowed to
  overwrite**, never as a set of protected sources, so a source a given build has
  never heard of is safe **by default** rather than by enumeration. Four unit
  tests pin this, including the unknown-source case.

### Same page on BPM across the suite
- nsmpl has had a **manual bars-based BPM** since well before nplay met the same
  problem: `BPM = (bars × 4 ÷ loopLen) × 60`, with the code stating outright that
  it is a *"workaround while aubio-based auto detection remains parked"*. It is
  currently **discarded on every file change**.
- That is not a lesser tap-tempo — it is arguably **better**. A tap is a human
  estimate; bars is a human *assertion* (the bar count) plus exact arithmetic on
  a known loop length.
- **Decided:** nsmpl writes its bars-derived BPM against the **source track under
  root `music`**, not against the clip — a clip is an excerpt of a library track,
  so it is the same music at the same tempo, and the source key is the one the
  rest of the suite already uses. Not wired yet.
- `schema/bpm-store-v1.md` gains the source table, the trust tiers, and the
  writer rule. Nostr remains out of scope (`release.v2` is frozen → a coordinated
  wave), and ndisc remains where BPM later becomes *portable* into file tags.

## 0.1.0-beta.6 — unreleased

### Suite-shared BPM store
- **BPM now has a durable home outside this app's index.** `tracks.bpm` was only
  ever a *cache*: the table is wiped and rebuilt on every scan and keyed by
  absolute path, yet a BPM costs an aubio subprocess to earn and accrues over
  months of listening. New suite-shared store at
  `~/.local/share/ndisc-suite/bpm.json`, beside ndisc's `published.json`.
  Contract: `schema/bpm-store-v1.md`.
- **Identity is `(root, relpath)`**, per the suite's terrain/roots model — never
  an absolute path, never a DB id. `roots` records the absolute path the named
  root resolved to, so a consumer whose root differs can still rebuild paths.
  A file outside the root has no stable identity and is skipped rather than
  given an invented key.
- **The store wins over the DB on scan.** Lose `library.db` entirely and BPM
  comes back on the next scan. The same pass migrates any DB-only values *out*
  to the store, so the first rescan after upgrading hands over every BPM earned
  so far (137 here), and is a no-op thereafter.
- **`tap` outranks `aubio`, and a detection can never overwrite a tap.** The
  `source` field ships now even though tap-tempo doesn't exist yet: aubio has a
  known octave-error problem, so a detection is a guess and a human tap is
  ground truth. That distinction is the reason the store is worth having, and it
  had to exist before the first value was written.
- Writes are **atomic** (temp + rename — other apps read this file),
  **batched** (per-track read-modify-write would be quadratic over a
  library-sized backfill), and **best-effort throughout**: a store failure must
  never break playback or a scan.
- Readable by **nsmpl** (BPM detection is already in its backlog) without
  coupling to nplay's schema, and by **ndisc** — which, as the app that already
  writes tags and knows publish state, is where BPM can later be made *portable*
  by folding it into the files. nplay deliberately does not write to library
  files. Publishing BPM to Nostr is explicitly **out of scope**: `release.v2` is
  frozen, so it is a contract change needing a coordinated suite wave.
- Library health gained a **BPM section** — `bpm known` / `hand-tapped`, and the
  store path.

## 0.1.0-beta.5 — unreleased

### Transport
- **Stop.** `nowPlaying` previously had no path back to `null`: once a track was
  loaded the only ways out were pausing or letting the queue run dry, so the
  idle state was unreachable after launch. The backend `audio_stop` command and
  its binding already existed — nothing in the UI called them. A Stop button now
  ejects: it halts rodio, rewinds the `<video>`, and clears the track and the
  time readouts, returning to the cold-start state.
- The queue **survives** the eject, so Stop isn't a dead end — Play re-enters the
  playlist at the cursor when nothing is loaded (it was simply disabled before),
  and Prev is gated the same way, since it already walked the queue off `index`.

### Cover art
- **Cover resolution now matches ndisc's**, which it silently diverged from.
  nplay checked six exact filename stems and then fell back to *the
  alphabetically-first image in the folder* — so a release holding
  `01-back.jpg` and `02-front.jpg` displayed the back of the sleeve. It now uses
  ndisc's `cover_name_score` verbatim: alternate art (`back`, `tray`, `inlay`,
  `booklet`, `spine`, `label`, `obi`, `disc`) is **vetoed** rather than ranked
  low, and an unnamed image is never guessed at.
- Hierarchy is **named front cover → embedded picture → lone unnamed image**.
  Embedded outranks the unnamed guess deliberately: it is stated by the release
  itself, where a filename is only inferred — and inferring is what produced the
  back-cover bug. All scan-time, so playback cost is unchanged (the cover is a
  per-release column, never polled per track). **Existing values are stale until
  a rescan.**

### Spectrum
- **Fixed a still of the audio being frozen on screen when playback stopped.** A
  race: `audioSpectrum().then(draw)` was unguarded, so a poll in flight at
  teardown resolved *after* the canvas was cleared and painted one last frame of
  real signal, with nothing left to overwrite it.
- The `active`/`synthetic` booleans collapsed three distinct states into two.
  Replaced by an explicit mode: **`live`** (rodio audio — poll the real FFT),
  **`idle`** (nothing to analyse: no track loaded, *or* an mp4 whose audio the
  webview decodes and rodio never sees — both now run the same gentle loop, and
  it is the state the panel initialises in), and **`hold`** (paused: freeze the
  last frame, since the signal is suspended rather than absent).

### Playlist + Now playing
- Playlist reads as a **list**: rows are striped bands on a continuous surface
  that runs to the bottom of the section, carrying on below the last track as
  ghost rows so an empty playlist is still visibly a list. Dimensions,
  spacing, row height and font size now match the Collection exactly (a 20px
  line in a 24px band, 4px apart), and the two panels no longer diverge.
- Now playing **cross-fades** the artwork in and out over the frame. The frame
  itself is always mounted, so stopping never collapses the layout.
- The placeholder glyph is scoped to its one honest meaning — *this release has
  no cover art* — and the "Nothing playing" caption is gone. Both were saying
  "nothing playing" a second time, on top of an already-empty frame.

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

### Next
- **Further video / Video-section work** — beyond the current mp4 loopback
  playback.
- (done: spacebar play/pause; the flat sortable library table view; BPM
  display; playlist drag-reorder; the **ntree** `normalize_videos` batch op
  — remaining nplay-side work is running it across legacy library video.)

### Later
- Responsive auto-collapse of panels at narrow widths.
- "Verify library" decode-probe pass (catch corrupt files of a supported
  format that the scan-time format check can't flag).
