import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  AudioLines,
  ChevronDown,
  Film,
  FolderOpen,
  Home,
  ListMusic,
  ListPlus,
  Loader2,
  Music,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Table,
} from "lucide-react";
import { cn } from "./lib/cn";
import { Section } from "./components/Section";
import { CollapsedStrip } from "./components/CollapsedStrip";
import { CurrentView } from "./components/CurrentView";
import { LibraryTree, type SortKey } from "./components/LibraryTree";
import { NowPlaying } from "./components/NowPlaying";
import { PlayerBar } from "./components/PlayerBar";
import { Playlist, type PlaylistSortKey } from "./components/Playlist";
import { ScanProgressBar, scanStatusText } from "./components/ScanProgressBar";
import { Health, fmtAgo } from "./components/Health";
import { Spectrum, type SpectrumMode } from "./components/Spectrum";
import { TableView } from "./components/TableView";
import { ToolbarIconButton } from "./components/ToolbarIconButton";
import {
  audioPause,
  audioPlay,
  audioResume,
  audioSeek,
  audioSetVolume,
  audioStatus,
  audioStop,
  defaultPlaylistDir,
  getConfig,
  libraryDbPath,
  libraryStats,
  listAlbums,
  listLabels,
  refreshCatalogue,
  type LabelCount,
  mediaBase,
  onScanProgress,
  readTextFile,
  scanLibrary,
  setMusicRoot,
  trackBpm,
  type TrackBpm,
  tracksByPaths,
  writeTextFile,
  type Album,
  type LibraryStats,
  type ScanProgress,
  type Track,
} from "./lib/tauri";
import { buildXspf, parseXspf, type XspfItem } from "./lib/xspf";

const VOLUME_KEY = "nplay.volume";
const THEME_KEY = "nplay.theme";

/** nplay had `.theme-upleb` in its CSS and NO switch — the theme was defined and
 *  unreachable, the only app in the suite like that. Adds the switch, and a
 *  third theme: monochrome, where chrome goes greyscale and the semantic colours
 *  (ok / warn / alert / auburn) deliberately do not. */
type Theme = "fizx" | "upleb" | "mono";

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  // Default = mono, like the rest of the suite. An existing choice is
  // respected; only a fresh install lands here.
  return v === "upleb" || v === "fizx" ? v : "mono";
}
const PLAYLIST_KEY = "nplay.playlist";
const PLAYLIST_SORT_KEY = "nplay.playlist.sort";
const REPEAT_KEY = "nplay.repeat";
const SHUFFLE_KEY = "nplay.shuffle";

type RepeatMode = "off" | "all" | "one";

/** A shuffled permutation of [0..len), with `first` (the current track) moved
 *  to the front so shuffle continues from what's playing. Fisher–Yates, so
 *  every track appears once — no track repeats until the list is exhausted. */
function makeShuffleOrder(len: number, first: number): number[] {
  const order = Array.from({ length: len }, (_, i) => i);
  for (let i = len - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (first >= 0) {
    const k = order.indexOf(first);
    if (k > 0) {
      order.splice(k, 1);
      order.unshift(first);
    }
  }
  return order;
}

/** Minimal persisted playlist entry (path is the stable key). */
interface SavedEntry {
  path: string;
  title: string;
  duration: number | null;
}

/** Build a Track from an entry the library couldn't resolve (file moved, or
 *  an .xspf pointing outside the library) so it still shows + plays by path. */
function synthTrack(e: SavedEntry | XspfItem, i: number): Track {
  return {
    id: -(i + 1),
    albumId: -1,
    path: e.path,
    title: e.title || e.path.split("/").pop() || e.path,
    trackNo: null,
    discNo: null,
    duration: e.duration ?? null,
    codec: null,
    sampleRate: null,
    bitDepth: null,
    isVideo: false,
    playable: true,
  };
}

/** Resolve persisted/imported entries to library Tracks (preserving order),
 *  synthesizing any the library doesn't know. */
async function resolveEntries(
  entries: Array<SavedEntry | XspfItem>,
): Promise<Track[]> {
  if (!entries.length) return [];
  const found = await tracksByPaths(entries.map((e) => e.path));
  const byPath = new Map(found.map((t) => [t.path, t]));
  return entries.map((e, i) => byPath.get(e.path) ?? synthTrack(e, i));
}

/** Comparator for a playlist sort view. Album metadata (artist, album,
 *  disc/track no) is resolved through albumById; ties fall through to a
 *  disc/track/title order so an album sort reads in play order. */
function makePlaylistCmp(
  key: PlaylistSortKey,
  albumById: Map<number, Album>,
): (a: Track, b: Track) => number {
  const meta = (t: Track) => albumById.get(t.albumId);
  const byAlbumTrack = (a: Track, b: Track) =>
    (a.discNo ?? 0) - (b.discNo ?? 0) ||
    (a.trackNo ?? 0) - (b.trackNo ?? 0) ||
    a.title.localeCompare(b.title);
  return (a, b) => {
    switch (key) {
      case "title":
        return a.title.localeCompare(b.title);
      case "duration":
        return (a.duration ?? 0) - (b.duration ?? 0);
      case "artist":
        return (
          (meta(a)?.artist ?? "").localeCompare(meta(b)?.artist ?? "") ||
          (meta(a)?.album ?? "").localeCompare(meta(b)?.album ?? "") ||
          byAlbumTrack(a, b)
        );
      case "album":
        return (
          (meta(a)?.album ?? "").localeCompare(meta(b)?.album ?? "") ||
          byAlbumTrack(a, b)
        );
    }
  };
}

/** Present the canonical manual order through an optional sort view. Returns
 *  the display tracks plus `toManual`, mapping each display row back to its
 *  index in `manual` — so a per-row edit (remove) under an active sort targets
 *  the right manual entry even with duplicate tracks. `key === null` is the
 *  Manual view: the manual order verbatim. The sort is stable (ties keep manual
 *  order) so it never scrambles equal keys. */
function derivePlaylistView(
  manual: Track[],
  key: PlaylistSortKey | null,
  albumById: Map<number, Album>,
): { tracks: Track[]; toManual: number[] } {
  if (!key) return { tracks: manual, toManual: manual.map((_, i) => i) };
  const cmp = makePlaylistCmp(key, albumById);
  const decorated = manual.map((t, i) => ({ t, i }));
  decorated.sort((a, b) => cmp(a.t, b.t) || a.i - b.i);
  return {
    tracks: decorated.map((d) => d.t),
    toManual: decorated.map((d) => d.i),
  };
}

/** A boolean persisted to localStorage (panel collapse states). */
function usePersistedBool(key: string, def = false) {
  const [v, setV] = useState(() => {
    const s = localStorage.getItem(key);
    return s === "1" ? true : s === "0" ? false : def;
  });
  useEffect(() => {
    localStorage.setItem(key, v ? "1" : "0");
  }, [key, v]);
  return [v, setV] as const;
}

// Suite rule (n-suite headers): the version chip shows only
// major.minor.patch; any pre-release/build suffix (…-beta.2, +build) drops
// to the tooltip so the chip keeps a fixed, consistent width as releases
// move from 0.2.0-beta.2 toward 1.3.1.
function shortVersion(v: string): string {
  return v.split(/[-+]/)[0];
}

export default function App() {
  const [musicRoot, setRoot] = useState("");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [mediaBaseUrl, setMediaBaseUrl] = useState("");
  const [albums, setAlbums] = useState<Album[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  // Main work area: the column layout, or the flat sortable table view.
  const [view, setView] = useState<"library" | "table" | "current">(
    "library",
  );
  // Bumped on each library refresh so the table view reloads after a scan.
  const [libVersion, setLibVersion] = useState(0);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  // What the library load is currently doing — surfaced next to the spinner so
  // a slow step (e.g. re-joining a freshly exported catalogue) says so.
  const [loadPhase, setLoadPhase] = useState("loading library…");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const lastScannedAt = stats?.lastScannedAt ?? null;

  // The playlist IS the play queue: `index` points at the track playing
  // within it. Building a list (add / load) and playing it are the same list,
  // so there's no separate ephemeral queue to mirror.
  //
  // `manualOrder` is the canonical, drag-curated, persisted sequence.
  // `sortKey` selects a transient sort *view* over it (null = Manual, the raw
  // curated order). Sorting never mutates `manualOrder`, so switching back to
  // Manual always restores exactly what the user arranged. The played/shown
  // `playlist` is derived from the two just below, once `albumById` exists.
  const [manualOrder, setManualOrder] = useState<Track[]>([]);
  const [sortKey, setSortKey] = useState<PlaylistSortKey | null>(null);
  const [index, setIndex] = useState(-1);
  const [repeat, setRepeat] = useState<RepeatMode>(() => {
    const s = localStorage.getItem(REPEAT_KEY);
    return s === "all" || s === "one" ? s : "off";
  });
  const [shuffle, setShuffle] = useState(
    () => localStorage.getItem(SHUFFLE_KEY) === "1",
  );
  // Shuffle play order: a permutation of playlist indices walked by next/prev
  // while shuffle is on. Regenerated when shuffle turns on or the list resizes.
  const [order, setOrder] = useState<number[]>([]);
  const [playlistDir, setPlaylistDir] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("artist");
  const [filter, setFilter] = useState("");
  const [videoOnly, setVideoOnly] = useState(false);
  // Record-label filter over the Collection. Labels are joined from ndisc's
  // catalogue export, so the list is empty until that manifest exists.
  const [labelFilter, setLabelFilter] = useState("");
  const [labels, setLabels] = useState<LabelCount[]>([]);
  const [colCollapsed, setColCollapsed] = usePersistedBool("nplay.col.collapsed");
  const [plCollapsed, setPlCollapsed] = usePersistedBool("nplay.playlist.collapsed");
  const [npCollapsed, setNpCollapsed] = usePersistedBool("nplay.nowplaying.collapsed");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  useEffect(() => {
    const root = document.documentElement.classList;
    root.toggle("theme-upleb", theme === "upleb");
    root.toggle("theme-mono", theme === "mono");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const [volume, setVolume] = useState(() => {
    const s = localStorage.getItem(VOLUME_KEY);
    const v = s != null ? parseFloat(s) : NaN;
    return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  });

  // The authoritative now-playing track — a first-class state, deliberately
  // NOT derived from playlist[index]. Playback is decoupled from the queue so
  // that replacing the queue (opening a saved playlist), pruning it, or a
  // library rescan never interrupts the current track: it plays to the end
  // unless the user intervenes (audio and video alike). The playlist + `index`
  // are the up-next cursor that prev/next/auto-advance walk once it ends.
  const [nowPlaying, setNowPlaying] = useState<Track | null>(null);
  const current = nowPlaying;
  // Picture-playable video = an mp4/m4v container (h264/aac/ac3 all play via
  // WebKit2GTK+libav over the loopback server); these route to the <video>
  // element. Other containers (mkv/avi/mpg/…) stay rodio audio-only until a
  // future ntree normalize pass remuxes them to mp4.
  const currentIsPlayableVideo =
    !!current?.isVideo && /\.(mp4|m4v)$/i.test(current.path);

  const albumById = useMemo(() => {
    const m = new Map<number, Album>();
    for (const a of albums) m.set(a.id, a);
    return m;
  }, [albums]);
  const currentAlbum = current ? albumById.get(current.albumId) ?? null : null;

  // The played + displayed queue: the manual order seen through the active
  // sort view. `plToManual[displayIndex]` is the row's slot in `manualOrder`,
  // so a per-row edit under a sort still targets the right manual entry. All
  // playback reads (advance, playableSeq, index) run against this derived
  // order, so playback follows what the user sees.
  const { tracks: playlist, toManual: plToManual } = useMemo(
    () => derivePlaylistView(manualOrder, sortKey, albumById),
    [manualOrder, sortKey, albumById],
  );

  // BPM for the current track — reset on track change, then filled in lazily.
  // Carries its `source`, so the UI can tell a machine guess (aubio) from a
  // tempo a human asserted in nsmpl.
  const [bpm, setBpm] = useState<TrackBpm | null>(null);
  useEffect(() => {
    setBpm(null);
    const id = current?.id;
    if (id == null) return;
    let alive = true;
    trackBpm(id)
      .then((v) => {
        if (alive) setBpm(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [current?.id]);

  // --- data loading ---------------------------------------------------------
  async function refreshAlbums() {
    setLoadingAlbums(true);
    try {
      // Re-join ndisc's catalogue before listing, so labels are current on every
      // library load — no rescan needed after re-exporting the manifest from
      // ndisc. Cheap (indexed UPDATE by dir) and a no-op if the export is absent.
      setLoadPhase("syncing labels…");
      await refreshCatalogue().catch(() => 0);
      setLoadPhase("loading library…");
      setAlbums(await listAlbums());
      setLibVersion((v) => v + 1);
      libraryStats()
        .then(setStats)
        .catch(() => {});
      // Label vocabulary follows the library — a scan re-joins ndisc's
      // catalogue, so the filter's options refresh with it.
      listLabels()
        .then(setLabels)
        .catch(() => setLabels([]));
    } finally {
      setLoadingAlbums(false);
    }
  }

  useEffect(() => {
    getConfig().then((c) => setRoot(c.musicRoot));
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
    mediaBase().then(setMediaBaseUrl).catch(() => {});
    libraryDbPath().then(setDbPath).catch(() => {});
    refreshAlbums();
    const un = onScanProgress(setProgress);
    return () => {
      un.then((f) => f());
    };
  }, []);

  async function doScan() {
    setScanning(true);
    setProgress({ phase: "walk", done: 0, total: 0, path: "" });
    try {
      await scanLibrary();
      await refreshAlbums();
      // Re-resolve the queue against the rebuilt index: entries whose files
      // vanished fall back to synthesized tracks (negative id → shown muted +
      // swept by the broom), and any that reappeared re-link to real tracks.
      // Order/length are preserved, so the play position stays valid.
      if (manualOrder.length) {
        const reresolved = await resolveEntries(
          manualOrder.map((t) => ({
            path: t.path,
            title: t.title,
            duration: t.duration,
          })),
        );
        setManualOrder(reresolved);
        // Keep the up-next cursor on the playing track across the rebuild
        // (matched by path — ids may be reassigned), through the active sort
        // view. nowPlaying is left as-is so the track is never interrupted.
        if (nowPlaying) {
          const view = derivePlaylistView(reresolved, sortKey, albumById).tracks;
          setIndex(view.findIndex((t) => t.path === nowPlaying.path));
        }
      }
      // The scan can finish in a second or two; hold a full "done" bar briefly
      // so the user actually sees it complete instead of a flicker.
      setProgress({ phase: "done", done: 1, total: 1, path: "" });
      await new Promise((r) => setTimeout(r, 900));
    } catch (e) {
      console.error("scan failed", e);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  async function chooseRoot() {
    const picked = await open({ directory: true, defaultPath: musicRoot });
    if (typeof picked === "string" && picked) {
      await setMusicRoot(picked);
      setRoot(picked);
      await doScan();
    }
  }

  // --- playback (Rust rodio backend over IPC) -------------------------------
  // Video files play audio-only (Rust extracts the track via ffmpeg). A file
  // that genuinely can't be decoded flags `error` in the status poll and is
  // skipped to the next track. Latest next handler held in a ref so the poll
  // never closes over stale queue/index state.
  // The webview <video> element (mounted in the Now-playing stage for mp4
  // tracks); the app transport drives it directly for video, rodio otherwise.
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // Replay the current track from the top (Repeat One, and the wrap-to-self
  // case). The play effect keys on track id, so a same-index replay won't
  // retrigger it — we kick playback directly.
  function restartCurrent() {
    setCurrentTime(0);
    setIsPlaying(true);
    if (currentIsPlayableVideo) {
      const el = videoElRef.current;
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    } else if (current) {
      audioPlay(current.path).catch(() => {});
    }
  }

  // The playable tracks in play order (shuffled when shuffle is on), with
  // undecodable formats (APE/WMA/…) dropped so prev/next/auto-advance never
  // target them. Manual selection can still land on one (the play-time skip
  // is the backstop). `playable !== false` so synthesized tracks count.
  function playableSeq(): number[] {
    const len = playlist.length;
    const base =
      shuffle && order.length === len ? order : playlist.map((_, i) => i);
    return base.filter((i) => playlist[i]?.playable !== false);
  }

  // Advance handler, held in a ref so the 250ms poll never closes over stale
  // index/playlist/mode state. `auto` = the track ended on its own (honours
  // Repeat One); a user skip or an error-skip passes false so it never traps
  // on one track. Honours Shuffle and Repeat All, over the playable sequence.
  const advanceRef = useRef<(auto: boolean) => void>(() => {});
  advanceRef.current = (auto: boolean) => {
    if (playlist.length === 0) return;
    if (auto && repeat === "one") {
      restartCurrent();
      return;
    }
    const seq = playableSeq();
    if (seq.length === 0) {
      setIsPlaying(false);
      audioStop().catch(() => {});
      return;
    }
    const pos = seq.indexOf(index);
    let next: number | null = null;
    if (pos === -1) {
      next = seq[0]; // current isn't a playable target → first playable
    } else if (pos < seq.length - 1) {
      next = seq[pos + 1];
    } else if (repeat === "all") {
      if (shuffle) {
        const fresh = makeShuffleOrder(playlist.length, -1);
        setOrder(fresh);
        next = fresh.find((i) => playlist[i]?.playable !== false) ?? null;
      } else {
        next = seq[0];
      }
    }
    if (next === null) {
      setIsPlaying(false);
      audioStop().catch(() => {});
    } else if (nowPlaying && playlist[next]?.id === nowPlaying.id) {
      // Wrapping to the same track (repeat-all over a single entry).
      restartCurrent();
    } else {
      setIndex(next);
      setNowPlaying(playlist[next]);
    }
  };

  // Play a fresh selection (e.g. an album from the Collection): it replaces
  // the playlist and starts at `startIndex`. The `＋` buttons are the
  // non-destructive path (append without disturbing what's playing).
  // These handlers are passed to the memoized Collection/Playlist panels, so
  // they're useCallback-stable — otherwise a new identity each render would
  // defeat the memo and re-render those panels on every position tick.
  const play = useCallback((tracks: Track[], startIndex: number) => {
    if (!tracks.length) return;
    const i = Math.max(0, Math.min(startIndex, tracks.length - 1));
    setManualOrder(tracks);
    setSortKey(null); // a fresh selection defines its own manual order
    setIndex(i);
    setNowPlaying(tracks[i]);
  }, []);

  // --- playlist (the live play queue) --------------------------------------
  const addToPlaylist = useCallback((tracks: Track[]) => {
    // Append to the canonical manual order. Under an active sort the new rows
    // slot into their sorted place in the derived view; the up-next cursor is
    // refreshed by the next view-changing edit (in Manual view it's unmoved).
    setManualOrder((m) => [...m, ...tracks]);
  }, []);
  const playPlaylistAt = useCallback(
    (i: number) => {
      if (!playlist.length) return;
      const clamped = Math.max(0, Math.min(i, playlist.length - 1));
      setIndex(clamped);
      setNowPlaying(playlist[clamped]);
    },
    [playlist],
  );
  const removeFromPlaylist = useCallback(
    (i: number) => {
      // `i` indexes the displayed order; map it back to the manual slot so the
      // right entry is removed even under a sort (and with duplicate tracks).
      const manualIdx = plToManual[i];
      if (manualIdx == null) return;
      const nextManual = manualOrder.filter((_, j) => j !== manualIdx);
      setManualOrder(nextManual);
      // The cursor follows the playing track to its new slot in the view (or
      // detaches to -1 if its row was the one removed) — playback is untouched.
      const view = derivePlaylistView(nextManual, sortKey, albumById).tracks;
      setIndex(nowPlaying ? view.findIndex((t) => t.id === nowPlaying.id) : -1);
    },
    [manualOrder, plToManual, sortKey, albumById, nowPlaying],
  );
  const clearPlaylist = useCallback(() => {
    // Playback is independent of the queue: Clear empties the up-next list but
    // never interrupts the current track. Keep the playing track as the sole
    // remaining row (it still shows + anchors prev/next); fully empty + stop
    // only when nothing is playing. Either way, drop back to the Manual view.
    setSortKey(null);
    if (nowPlaying) {
      setManualOrder([nowPlaying]);
      setIndex(0);
      return;
    }
    setManualOrder([]);
    setIndex(-1);
    audioStop().catch(() => {});
    if (videoElRef.current) videoElRef.current.pause();
  }, [nowPlaying]);

  // Bulk-prune the playlist by a keep-predicate. The predicate is value-based,
  // so it filters the canonical manual order directly; the sort view and the
  // shuffle `order` re-derive. Backs the toolbar cleanup actions.
  const prunePlaylist = useCallback(
    (keep: (t: Track) => boolean) => {
      const nextManual = manualOrder.filter(keep);
      setManualOrder(nextManual);
      // Re-point the cursor at the playing track's new slot in the view (-1 if
      // it was itself pruned); playback continues regardless.
      const view = derivePlaylistView(nextManual, sortKey, albumById).tracks;
      setIndex(nowPlaying ? view.findIndex((t) => t.id === nowPlaying.id) : -1);
    },
    [manualOrder, sortKey, albumById, nowPlaying],
  );
  // "Unavailable" = can't contribute real playback from the library: either an
  // undecodable format (playable === false) or an entry that no longer matches
  // the collection (synthesized fallback → negative id; file moved/removed).
  const removeUnavailableFromPlaylist = useCallback(
    () => prunePlaylist((t) => t.playable !== false && t.id >= 0),
    [prunePlaylist],
  );
  const removeDuplicatesFromPlaylist = useCallback(() => {
    const seen = new Set<string>();
    prunePlaylist((t) => {
      if (seen.has(t.path)) return false;
      seen.add(t.path);
      return true;
    });
  }, [prunePlaylist]);

  // Drag-drop reorder: the move is expressed over the displayed rows, and the
  // result becomes the new manual order — so dragging while a sort is active
  // commits that exact arrangement and drops back to the Manual view. The
  // shuffle `order` re-derives via the [shuffle, playlist] effect below.
  const reorderPlaylist = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = playlist.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setManualOrder(next);
      setSortKey(null);
      setIndex(nowPlaying ? next.findIndex((t) => t.id === nowPlaying.id) : -1);
    },
    [playlist, nowPlaying],
  );
  // Sort is a non-destructive view over the manual order: `null` restores the
  // curated Manual order, any key sorts for display without touching
  // `manualOrder`, so switching back to Manual is always exact.
  const sortPlaylist = useCallback(
    (key: PlaylistSortKey | null) => {
      setSortKey(key);
      const view = derivePlaylistView(manualOrder, key, albumById).tracks;
      setIndex(nowPlaying ? view.findIndex((t) => t.id === nowPlaying.id) : -1);
    },
    [manualOrder, albumById, nowPlaying],
  );

  // Auto-persist the working playlist by path, and restore it on launch
  // (resolving paths back to fresh library tracks). `hydrated` gates the
  // save effect so the initial empty render doesn't clobber saved data.
  const hydratedRef = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(PLAYLIST_KEY);
        const entries = raw ? (JSON.parse(raw) as SavedEntry[]) : [];
        if (Array.isArray(entries) && entries.length) {
          setManualOrder(await resolveEntries(entries));
        }
        // Restore the sort view too, so a relaunch reopens on the same order.
        const savedSort = localStorage.getItem(PLAYLIST_SORT_KEY);
        if (
          savedSort === "title" ||
          savedSort === "artist" ||
          savedSort === "album" ||
          savedSort === "duration"
        ) {
          setSortKey(savedSort);
        }
      } catch (e) {
        console.error("playlist restore failed", e);
      }
      hydratedRef.current = true;
    })();
    defaultPlaylistDir()
      .then(setPlaylistDir)
      .catch(() => {});
  }, []);

  // Persist the canonical manual order (never the transient sort view) so the
  // curated arrangement always comes back on launch.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const entries: SavedEntry[] = manualOrder.map((t) => ({
      path: t.path,
      title: t.title,
      duration: t.duration,
    }));
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(entries));
  }, [manualOrder]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    localStorage.setItem(PLAYLIST_SORT_KEY, sortKey ?? "");
  }, [sortKey]);

  // Persist the play modes.
  useEffect(() => {
    localStorage.setItem(REPEAT_KEY, repeat);
  }, [repeat]);
  useEffect(() => {
    localStorage.setItem(SHUFFLE_KEY, shuffle ? "1" : "0");
  }, [shuffle]);

  // (Re)build the shuffle order when shuffle turns on or the displayed order
  // changes (resize, sort, reorder, manual restore), keeping the current track
  // at the front. Keyed on `playlist` (not just its length) so a same-length
  // re-sort still refreshes the permutation. Deliberately not keyed on `index`
  // (a track change shouldn't reshuffle); reading it here is fine.
  useEffect(() => {
    if (shuffle) setOrder(makeShuffleOrder(playlist.length, index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, playlist]);

  function cycleRepeat() {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }
  function toggleShuffle() {
    setShuffle((s) => !s);
  }

  // Import a Strawberry/XSPF playlist into the working list.
  const loadPlaylistFile = useCallback(async () => {
    const picked = await open({
      defaultPath: playlistDir ?? undefined,
      filters: [{ name: "XSPF playlist", extensions: ["xspf"] }],
    });
    if (typeof picked !== "string" || !picked) return;
    try {
      const items = parseXspf(await readTextFile(picked));
      setManualOrder(await resolveEntries(items));
      setSortKey(null); // an opened file is its own fresh manual order
      // Opening a playlist replaces the up-next queue but must NOT interrupt
      // what's playing (audio or video). Detach the cursor (index → -1) and
      // leave nowPlaying untouched, so the current track plays to its end; when
      // it finishes, auto-advance rolls into this freshly-opened list from the
      // top. (If nothing is playing, the first Play/Next starts it there.)
      setIndex(-1);
    } catch (e) {
      console.error("playlist load failed", e);
    }
  }, [playlistDir]);

  // Export the working list as an .xspf (Strawberry-compatible).
  const savePlaylistFile = useCallback(async () => {
    if (!playlist.length) return;
    const dest = await save({
      defaultPath: `${playlistDir ? playlistDir + "/" : ""}nplay.xspf`,
      filters: [{ name: "XSPF playlist", extensions: ["xspf"] }],
    });
    if (!dest) return;
    const items: XspfItem[] = playlist.map((t) => ({
      path: t.path,
      title: t.title,
      artist: albumById.get(t.albumId)?.artist ?? "",
      duration: t.duration ?? null,
    }));
    try {
      await writeTextFile(dest, buildXspf(items));
    } catch (e) {
      console.error("playlist save failed", e);
    }
  }, [playlist, playlistDir, albumById]);

  // Stop = eject. Unloads the track and returns to the "Nothing playing" state
  // the app opens in — the only other way out of playback is letting the queue
  // run dry. The queue and its cursor survive, so Play picks up where it left
  // off (from the cursor, or the top if it was detached).
  function stop() {
    const el = videoElRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    audioStop().catch(() => {});
    setNowPlaying(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }

  function toggle() {
    // Nothing loaded (fresh start, or just stopped) — Play re-enters the queue
    // at the cursor rather than being a dead button.
    if (!current) {
      if (playlist.length) playPlaylistAt(index >= 0 ? index : 0);
      return;
    }
    if (currentIsPlayableVideo) {
      const el = videoElRef.current;
      if (!el) return;
      if (el.paused) el.play().catch(() => {});
      else el.pause();
      setIsPlaying(!el.paused);
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
      audioPause().catch(() => {});
    } else {
      setIsPlaying(true);
      audioResume().catch(() => {});
    }
  }

  // Spacebar = play/pause, app-wide — but never while typing in a field (the
  // Collection / table filters, inline tag-edit cells). Held in a ref so the
  // mount-once listener always calls the latest toggle.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      )
        return;
      // Stop the page scroll and any focused-button Space activation.
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function prev() {
    const restart = () => {
      if (currentIsPlayableVideo) {
        if (videoElRef.current) videoElRef.current.currentTime = 0;
      } else {
        audioSeek(0).catch(() => {});
      }
      setCurrentTime(0);
    };
    // Past the first few seconds, "previous" restarts the track (familiar
    // transport behaviour) rather than stepping back.
    if (currentTime > 3) return restart();
    const seq = playableSeq();
    const pos = seq.indexOf(index);
    let p: number | null = null;
    if (pos === -1) p = seq[0] ?? null;
    else if (pos > 0) p = seq[pos - 1];
    else if (repeat === "all") p = seq[seq.length - 1];
    if (p === null) restart();
    else if (nowPlaying && playlist[p]?.id === nowPlaying.id) restart();
    else {
      setIndex(p);
      setNowPlaying(playlist[p]);
    }
  }

  function seek(t: number) {
    if (currentIsPlayableVideo) {
      if (videoElRef.current) videoElRef.current.currentTime = t;
    } else {
      audioSeek(t).catch(() => {});
    }
    setCurrentTime(t);
  }

  function changeVolume(v: number) {
    setVolume(v);
    localStorage.setItem(VOLUME_KEY, String(v));
    audioSetVolume(v).catch(() => {});
    if (videoElRef.current) videoElRef.current.volume = v;
  }

  // Push the restored volume to the audio engine once on startup so the
  // backend matches the slider before the first track plays.
  useEffect(() => {
    audioSetVolume(volume).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start playback whenever the current track changes (videos included —
  // Rust extracts their audio; the first play of a video transcodes, so it
  // may take a second or two to start).
  useEffect(() => {
    if (!current) return;
    setCurrentTime(0);
    setDuration(current.duration ?? 0);
    setIsPlaying(true);
    // mp4 → the <video> element owns playback (picture + sound); stop rodio,
    // and make sure the stage is open so the element actually exists.
    if (currentIsPlayableVideo) {
      audioStop().catch(() => {});
      setNpCollapsed(false);
      if (videoElRef.current) videoElRef.current.volume = volume;
      return;
    }
    audioPlay(current.path).catch((e) => console.error("play failed", e));
    audioSetVolume(volume).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Poll the backend for position / finished while a track is loaded.
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const id = setInterval(async () => {
      // Video tracks: read position/duration straight off the <video> element
      // (it owns playback). It may not exist yet if the panel is mid-mount.
      if (currentIsPlayableVideo) {
        const el = videoElRef.current;
        if (!el || !alive) return;
        setCurrentTime(el.currentTime || 0);
        if (el.duration && isFinite(el.duration)) setDuration(el.duration);
        setIsPlaying(!el.paused && !el.ended);
        if (el.ended) advanceRef.current(true);
        return;
      }
      try {
        const s = await audioStatus();
        if (!alive) return;
        // A failed load (undecodable / audioless video) — skip to next.
        // `false` so a broken track can't trap us under Repeat One.
        if (s.error) {
          advanceRef.current(false);
          return;
        }
        setCurrentTime(s.positionMs / 1000);
        if (s.durationMs > 0) setDuration(s.durationMs / 1000);
        setIsPlaying(s.playing);
        if (s.finished) advanceRef.current(true);
      } catch {
        /* transient */
      }
    }, 250);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Next is meaningful unless we're on the last track with no wrap (sequential,
  // repeat off); shuffle/repeat-all always have somewhere to go.
  // A detached cursor (index < 0, e.g. right after opening a playlist while a
  // track plays) still has somewhere to go — Next rolls into the queue's top.
  const canNext =
    playlist.length > 0 &&
    (index < 0 || repeat === "all" || shuffle || index < playlist.length - 1);

  // Idle (nothing loaded — including at launch) runs the same gentle loop as a
  // playing mp4: in both cases there is no rodio signal to read, so the panel
  // idles rather than sitting dead. Paused holds the last frame.
  const spectrumMode: SpectrumMode = !current
    ? "idle"
    : !isPlaying
      ? "hold"
      : currentIsPlayableVideo
        ? "idle"
        : "live";

  // Header master-transport button — matches ndisc.smpl's MasterStrip
  // styling (h-8 square, surface fill, accent glyph) for suite consistency.
  const hdrBtn =
    "h-8 w-8 bg-surface text-accent hover:bg-accent/15 transition-colors " +
    "flex items-center justify-center shrink-0 disabled:opacity-40 disabled:hover:bg-surface";
  // Mode-toggle variant: same footprint, but tinted when active and muted
  // when off (it's a state indicator, not a one-shot action).
  const modeBtn = (on: boolean) =>
    cn(
      "h-8 w-8 flex items-center justify-center shrink-0 transition-colors",
      on
        ? "bg-accent/20 text-accent hover:bg-accent/25"
        : "bg-surface text-muted hover:text-fg/80 hover:bg-accent/10",
    );

  // Collapse-flanks: each column is its content width or a 2.5rem sliver.
  // Collection + Playlist share the same 1fr default so they're equal width;
  // both grow equally when a neighbour collapses.
  const mainCols = [
    colCollapsed ? "2.5rem" : "minmax(0, 1fr)",
    plCollapsed ? "2.5rem" : "minmax(0, 1fr)",
    npCollapsed ? "2.5rem" : "minmax(300px, 0.55fr)",
  ].join(" ");

  const albumCount = albums.length;

  return (
    <div className="h-full flex flex-col bg-bg text-fg">
      {/* Header — suite top-bar grammar (SUITE.md § Top-bar grammar): rounded
          panel card, three-column grid [ title + folder | transport | scan +
          view-switch ]. The m-4/mb-0 sits the card in the same p-4 rhythm as
          the main content below it. */}
      <header className="m-4 mb-0 shrink-0 rounded-lg bg-panel shadow-md grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight leading-none shrink-0">
            <button
              type="button"
              onClick={() =>
                setTheme((t) =>
                  t === "fizx" ? "upleb" : t === "upleb" ? "mono" : "fizx",
                )
              }
              title={
                theme === "fizx"
                  ? "Theme: fizx.uk — click to switch to upleb.uk"
                  : theme === "upleb"
                    ? "Theme: upleb.uk — click to switch to monochrome"
                    : "Theme: monochrome — click to switch to fizx.uk"
              }
              aria-label="Switch colour theme"
              className="cursor-pointer transition-opacity hover:opacity-70"
            >
              <span className="text-accent">n</span>
              <span className="text-mauve">play</span>
            </button>
          </h1>
          {appVersion && (
            <span
              className="hidden md:inline-flex items-center px-2.5 py-2 rounded-md bg-surface text-mauve font-mono text-xs shrink-0"
              title={`v${appVersion}`}
            >
              v{shortVersion(appVersion)}
            </span>
          )}
          <button
            onClick={chooseRoot}
            title="Choose music folder"
            className="flex items-center gap-1.5 min-w-0 text-[12px] text-muted hover:text-fg/90 transition-colors"
          >
            <FolderOpen size={14} className="shrink-0" />
            <span className="truncate max-w-[280px]">{musicRoot || "…"}</span>
          </button>
          {/* Library search, promoted out of the Collection panel into the
              header so it gets the full left-column width. Only the split
              (library) view is filtered by `filter`, so it only shows there —
              the table/current views have their own surfaces. `flex-1 min-w-0`
              lets it grow into the leftover width without pushing the centred
              transport (its min-content stays near zero). */}
          {view === "library" && (
            <div className="relative flex-1 min-w-0">
              <Search
                size={13}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search library…"
                aria-label="Search the collection"
                className="w-full min-w-0 pl-7 pr-2 py-1 bg-surface/60 text-[12px] placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
            </div>
          )}
        </div>

        {/* Master transport — mirrors the bottom bar; matches smpl's header. */}
        <div className="inline-flex gap-1 justify-self-center">
          <button
            onClick={toggleShuffle}
            title={shuffle ? "Shuffle: on" : "Shuffle: off"}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={modeBtn(shuffle)}
          >
            <Shuffle size={14} />
          </button>
          <button
            onClick={prev}
            disabled={!current && !playlist.length}
            title="Previous"
            aria-label="Previous"
            className={hdrBtn}
          >
            <SkipBack size={15} fill="currentColor" />
          </button>
          <button
            onClick={toggle}
            disabled={!current && !playlist.length}
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
            aria-pressed={isPlaying}
            className={hdrBtn}
          >
            {isPlaying ? (
              <Pause size={15} fill="currentColor" />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
          </button>
          <button
            onClick={stop}
            disabled={!current}
            title="Stop"
            aria-label="Stop"
            className={hdrBtn}
          >
            <Square size={13} fill="currentColor" />
          </button>
          <button
            onClick={() => advanceRef.current(false)}
            disabled={!canNext}
            title="Next"
            aria-label="Next"
            className={hdrBtn}
          >
            <SkipForward size={15} fill="currentColor" />
          </button>
          <button
            onClick={cycleRepeat}
            title={
              repeat === "off"
                ? "Repeat: off"
                : repeat === "all"
                  ? "Repeat: all"
                  : "Repeat: one"
            }
            aria-label="Repeat"
            aria-pressed={repeat !== "off"}
            className={modeBtn(repeat !== "off")}
          >
            {repeat === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />}
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0 justify-self-end">
          {/* Scan feedback: status text on top, the progress bar stacked
              directly beneath it at the same width — so the meter costs no
              horizontal room at rest (it's a thin muted line under the text,
              well inside the header's row height).

              Fixed min-width, right-aligned: the narration text changes width
              on every progress tick, and in a 1fr grid track that would tug the
              whole header (transport included) sideways many times a second.
              Reserving one stable width kills the reflow — text grows leftward
              into the slack, the Scan button never moves. */}
          <div className="min-w-[19rem] flex flex-col gap-1">
          <div className="flex justify-end">
          {scanning ? (
            <span className="text-[12px] text-accent whitespace-nowrap font-mono tabular-nums">
              {scanStatusText(progress)}
            </span>
          ) : (
          <button
            onClick={() => setHealthOpen(true)}
            title="Library health — index vs disk, and what can't be played"
            className="text-[12px] text-muted whitespace-nowrap text-right hover:text-fg
                       transition-colors"
          >
            {albumCount} albums
            {stats ? ` · ${stats.tracks} tracks` : ""}
            {/* Auburn only while something is UNacknowledged. Acknowledging is
                the user saying "I know, I'm living with it" — the count stays
                (the fact hasn't gone away) but it stops shouting. */}
            {stats && stats.unplayable > 0 ? (
              <span
                className={
                  stats.unplayableUnacked > 0 ? "text-auburn" : "text-muted/70"
                }
              >
                {" · "}
                {stats.unplayable} unplayable
                {stats.unplayableUnacked === 0 ? " (acknowledged)" : ""}
              </span>
            ) : null}
            {lastScannedAt != null ? (
              <span className="text-muted/70">
                {" · "}
                scanned {fmtAgo(lastScannedAt)}
              </span>
            ) : null}
          </button>
          )}
          </div>
          {/* Meter stacked under the status line at the same width. */}
          <ScanProgressBar progress={progress} active={scanning} />
          </div>
          <button
            onClick={doScan}
            disabled={scanning}
            className={cn(
              "flex items-center justify-center gap-1.5 min-w-[6.5rem] text-[12px] px-2.5 py-1 transition-colors",
              // Keep the rollover tint latched on while scanning (pressed look).
              scanning ? "bg-surfaceHover" : "bg-surface/70 hover:bg-surfaceHover",
            )}
          >
            {scanning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {scanning ? "Scanning" : "Scan"}
          </button>
          {/* View-switch cluster — always the last right-zone group per the
              suite grammar: digital-tone ToolbarIconButton, Home first, active
              always lit. Shared vocabulary with ndisc/ntree (was nplay's local
              accent-tinted modeBtn). */}
          <span className="w-px h-6 bg-surface shrink-0" aria-hidden="true" />
          <div className="inline-flex gap-1">
            <ToolbarIconButton
              tone="digital"
              pressed={view === "library"}
              title={
                view === "library" ? "Player (current view)" : "Home — player"
              }
              onClick={() => setView("library")}
            >
              <Home size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              tone="digital"
              pressed={view === "table"}
              title="Track table"
              onClick={() => setView("table")}
            >
              <Table size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              tone="digital"
              pressed={view === "current"}
              title="Current — release feed channel"
              onClick={() => setView("current")}
            >
              <Radio size={14} />
            </ToolbarIconButton>
          </div>
        </div>
      </header>

      {/* Main — Collection · Playlist · Stage (art-or-video + Spectrum),
          or the flat sortable table view. */}
      {view === "table" ? (
        <div className="flex-1 min-h-0 p-4">
          <TableView
            reloadKey={libVersion}
            currentTrackId={current?.id ?? null}
            onPlay={play}
          />
        </div>
      ) : view === "current" ? (
        <div className="flex-1 min-h-0 p-4">
          <CurrentView active={view === "current"} />
        </div>
      ) : (
      <div
        className="flex-1 min-h-0 grid gap-4 p-4"
        style={{ gridTemplateColumns: mainCols }}
      >
        {/* Collection (with sort + filter) */}
        {colCollapsed ? (
          <CollapsedStrip
            title="Collection"
            icon={<ListMusic size={15} />}
            onExpand={() => setColCollapsed(false)}
          />
        ) : (
          <Section
            title="Collection"
            icon={<ListMusic size={15} />}
            iconOnly
            elastic
            className="min-w-0"
            onTitleClick={() => setColCollapsed(true)}
          >
            {/* sort + filter controls (the text search now lives in the
                header — see the left-zone Search input). */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex bg-surface/60 p-0.5 text-[11px] shrink-0">
                {(["artist", "album", "year"] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSort(k)}
                    className={cn(
                      "px-2 py-0.5 capitalize transition-colors",
                      sort === k
                        ? "bg-accent/20 text-accent"
                        : "text-muted hover:text-fg/80",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setVideoOnly((v) => !v)}
                title="Show only albums with video"
                aria-pressed={videoOnly}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-[11px] shrink-0 transition-colors",
                  videoOnly
                    ? "bg-accent/20 text-accent"
                    : "bg-surface/60 text-muted hover:text-fg/80",
                )}
              >
                <Film size={12} /> Video
              </button>
              {labels.length > 0 && (
                <div className="relative shrink-0">
                  {/* appearance-none drops WebKit's bright native chrome (the
                      sharp-contrast box) so the fill is ours; a dark bg-bg/40
                      lets it sit into the filter bar instead of standing off it.
                      Own chevron since the native one goes with appearance. */}
                  <select
                    value={labelFilter}
                    onChange={(e) => setLabelFilter(e.target.value)}
                    title="Filter the Collection by record label (from ndisc's catalogue)"
                    aria-label="Filter by label"
                    className={cn(
                      "appearance-none pl-1.5 pr-6 py-1 text-[11px] max-w-[9rem] truncate",
                      "focus:outline-none focus:ring-1 focus:ring-accent/40",
                      labelFilter
                        ? "bg-accent/20 text-accent"
                        : "bg-bg/40 text-muted hover:text-fg/80",
                    )}
                  >
                    <option value="">All labels</option>
                    {labels.map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.name} ({l.albums})
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
                  />
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
              {loadingAlbums ? (
                <div className="px-2 py-4 text-sm text-muted flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> {loadPhase}
                </div>
              ) : (
                <LibraryTree
                  albums={albums}
                  currentTrackId={current?.id ?? null}
                  onPlay={play}
                  onAddToPlaylist={addToPlaylist}
                  sort={sort}
                  filter={filter}
                  videoOnly={videoOnly}
                  labelFilter={labelFilter}
                />
              )}
            </div>
          </Section>
        )}

        {/* Playlist */}
        {plCollapsed ? (
          <CollapsedStrip
            title="Playlist"
            icon={<ListPlus size={15} />}
            onExpand={() => setPlCollapsed(false)}
          />
        ) : (
          <Section
            title="Playlist"
            icon={<ListPlus size={15} />}
            iconOnly
            elastic
            className="min-w-0"
            onTitleClick={() => setPlCollapsed(true)}
          >
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
              <Playlist
                tracks={playlist}
                albumById={albumById}
                currentTrackId={current?.id ?? null}
                onPlayAt={playPlaylistAt}
                onRemove={removeFromPlaylist}
                onClear={clearPlaylist}
                onLoad={loadPlaylistFile}
                onSave={savePlaylistFile}
                onRemoveUnavailable={removeUnavailableFromPlaylist}
                onRemoveDuplicates={removeDuplicatesFromPlaylist}
                onReorder={reorderPlaylist}
                onSort={sortPlaylist}
                sortKey={sortKey}
                onAdd={addToPlaylist}
              />
            </div>
          </Section>
        )}

        {/* Stage — album art or the live video, then the spectrum beneath. */}
        {npCollapsed ? (
          <CollapsedStrip
            title="Now playing"
            icon={<Music size={15} />}
            onExpand={() => setNpCollapsed(false)}
          />
        ) : (
          <div className="flex flex-col gap-3 min-h-0 min-w-0">
            <Section
              title="Now playing"
              icon={currentIsPlayableVideo ? <Film size={15} /> : <Music size={15} />}
              iconOnly
              onTitleClick={() => setNpCollapsed(true)}
            >
              <NowPlaying
                track={current}
                album={currentAlbum}
                isPlayableVideo={currentIsPlayableVideo}
                mediaBase={mediaBaseUrl}
                volume={volume}
                elRef={videoElRef}
                bpm={bpm}
              />
            </Section>
            <Section
              title="Spectrum"
              icon={<AudioLines size={15} />}
              iconOnly
              elastic
              className="flex-1"
            >
              <div className="flex-1 min-h-0">
                {/* Only animate while actually playing — gating on a loaded
                    track alone polled at 30fps even while paused. */}
                <Spectrum mode={spectrumMode} />
              </div>
            </Section>
          </div>
        )}
      </div>
      )}

      {/* Now playing, seek, volume (transport is in the header) */}
      <PlayerBar
        track={current}
        album={currentAlbum}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        onSeek={seek}
        onVolume={changeVolume}
      />

      {/* Thin status footer — matches the ndisc suite: stack left, an
          nsec/identity chip in the centre (parked until nplay goes
          nostr-aware — see the roadmap note), db location on the right. */}
      <footer className="shrink-0 grid grid-cols-3 items-center gap-4 px-4 py-1 text-[11px] text-muted border-t border-surface/60 bg-panel/60">
        <span className="truncate">
          stack: Tauri 2 + React + TS + Tailwind + SQLite
        </span>
        {/* centre slot reserved for the eventual nsec-in-keychain chip */}
        <span className="justify-self-center min-w-0" />
        {dbPath && (
          <span className="inline-flex items-center gap-1.5 justify-self-end min-w-0">
            <span className="shrink-0">db</span>
            <span
              className="font-mono text-mauve truncate max-w-[32rem]"
              title={dbPath}
            >
              {dbPath}
            </span>
          </span>
        )}
      </footer>

      <Health
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        onRescan={doScan}
        scanning={scanning}
        onAcknowledged={() => {
          libraryStats()
            .then(setStats)
            .catch(() => {});
        }}
      />
    </div>
  );
}
