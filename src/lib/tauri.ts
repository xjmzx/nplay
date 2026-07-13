// Typed wrappers around the Rust commands in src-tauri/src/lib.rs, plus
// the asset-protocol URL helper used to feed local files to <audio>/<img>.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export interface Album {
  id: number;
  artist: string;
  album: string;
  year: number | null;
  trackCount: number;
  hasVideo: boolean;
  coverPath: string | null;
}

export interface Track {
  id: number;
  albumId: number;
  path: string;
  title: string;
  trackNo: number | null;
  discNo: number | null;
  duration: number | null;
  codec: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
  isVideo: boolean;
  /** False when the audio backend has no decoder for this format (APE/WMA/
   *  WavPack/TAK) — known at scan time from the extension. */
  playable: boolean;
}

export interface LibraryStats {
  tracks: number;
  unplayable: number;
  /** Of those, how many are NOT yet acknowledged. Acknowledging silences the
   *  warning, so this is what the header nags about — the total stays available
   *  so the fact itself isn't lost. */
  unplayableUnacked: number;
  /** When the index was last rebuilt (unix seconds), or null if never. */
  lastScannedAt: number | null;
}

/** A track joined with its album — one flat row for the sortable table view. */
export interface FlatTrack extends Track {
  artist: string;
  album: string;
  year: number | null;
}

export interface ScanSummary {
  albums: number;
  tracks: number;
  videos: number;
}

export interface ScanProgress {
  phase: "walk" | "read" | "index" | "done" | string;
  done: number;
  total: number;
  /** Current file being read (read phase); empty otherwise. */
  path: string;
}

export function getConfig(): Promise<{ musicRoot: string }> {
  return invoke("get_config");
}

export function setMusicRoot(path: string): Promise<void> {
  return invoke("set_music_root", { path });
}

export function scanLibrary(): Promise<ScanSummary> {
  return invoke("scan_library");
}

export function listAlbums(): Promise<Album[]> {
  return invoke("list_albums");
}

export function listAlbumTracks(albumId: number): Promise<Track[]> {
  return invoke("list_album_tracks", { albumId });
}

/** Resolve file paths back to library tracks (missing paths are omitted). */
export function tracksByPaths(paths: string[]): Promise<Track[]> {
  return invoke("tracks_by_paths", { paths });
}

/** Headline library counts (total tracks + how many can't be decoded). */
export function libraryStats(): Promise<LibraryStats> {
  return invoke("library_stats");
}

/** A file nplay cannot fully play. Both kinds are fixable, not disposable —
 *  see the Rust side. `undecodable_audio` = APE/WavPack/TAK/WMA (no decoder,
 *  the file is fine); `pictureless_video` = not mp4/m4v, so it plays audio-only. */
export interface ProblemFile {
  path: string;
  kind: "undecodable_audio" | "pictureless_video";
  codec: string;
  artist: string;
  album: string;
  title: string;
  acknowledged: boolean;
}

export interface LibraryHealth {
  lastScannedAt: number | null;
  indexedTracks: number;
  /** Media files on disk under the music root, right now. */
  onDisk: number;
  /** Indexed, but the file is gone from disk. */
  stale: string[];
  /** On disk, but not indexed — a rescan picks these up. */
  unindexed: string[];
  problems: ProblemFile[];
}

/** Walk the music root, diff it against the index, and list what can't be
 *  played. Read-only — touches nothing on disk, changes nothing in the DB. */
export function libraryHealth(): Promise<LibraryHealth> {
  return invoke("library_health");
}

/** Mark problem files seen-and-accepted (or un-mark). A note to self: it changes
 *  nothing about playback and nothing on disk. Keyed by path, so it survives the
 *  wipe-and-rebuild a scan does. */
export function acknowledgeFiles(
  paths: string[],
  acknowledged: boolean,
): Promise<void> {
  return invoke("acknowledge_files", { paths, acknowledged });
}

/** Every track in the library, flat (joined with album), for the table view. */
export function listAllTracks(): Promise<FlatTrack[]> {
  return invoke("list_all_tracks");
}

/** Write one editable tag field (`title` | `trackNo`) back to a track's file
 *  and mirror it into the DB. `value` null clears it (trackNo only). */
export function setTrackField(
  id: number,
  path: string,
  field: "title" | "trackNo",
  value: string | null,
): Promise<void> {
  return invoke("set_track_field", { id, path, field, value });
}

export function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

export function defaultPlaylistDir(): Promise<string> {
  return invoke("default_playlist_dir");
}

/** Absolute path of the SQLite library in use (shown in the footer). */
export function libraryDbPath(): Promise<string> {
  return invoke("library_db_path");
}

export interface TrackBpm {
  bpm: number;
  /** "aubio" = detected (a guess — the UI marks it `?`); "tap" / "bars" =
   *  human-asserted ground truth, which aubio can never overwrite. */
  source: string;
}

/** BPM for a track: the suite store's human-asserted value if there is one,
 *  else this app's cache, else detected with aubio and cached. Resolves null
 *  when it can't be determined (aubio missing / undetectable). */
export function trackBpm(id: number): Promise<TrackBpm | null> {
  return invoke("track_bpm", { id });
}

export interface BpmStoreStats {
  /** ~/.local/share/ndisc-suite/bpm.json */
  path: string;
  entries: number;
  /** How many were confirmed by a human tap rather than detected. */
  tapped: number;
  exists: boolean;
}

/** The suite-shared BPM store — the durable copy, keyed by (root, relpath).
 *  The DB column is only a cache of it; this survives a wipe-and-rebuild. */
export function bpmStoreStats(): Promise<BpmStoreStats> {
  return invoke("bpm_store_stats");
}

/** Open the OS file manager with the given file selected. */
export function revealInFileManager(path: string): Promise<void> {
  return revealItemInDir(path);
}

export function onScanProgress(
  cb: (p: ScanProgress) => void,
): Promise<UnlistenFn> {
  return listen<ScanProgress>("scan-progress", (e) => cb(e.payload));
}

/** asset:// URL for a local file path — used for <img> covers. */
export function fileSrc(path: string): string {
  return convertFileSrc(path);
}

/** Base URL of the Rust loopback media server (`http://127.0.0.1:<port>`). */
export function mediaBase(): Promise<string> {
  return invoke("media_base");
}

/** Loopback-server URL for a local media file — used by the <video> element,
 *  since WebKit2GTK can't play local media over the asset protocol. */
export function videoSrc(base: string, path: string): string {
  return `${base}/media?path=${encodeURIComponent(path)}`;
}

// --- native audio playback (Rust rodio backend) ---------------------------
// WebKit2GTK can't play local media here, so playback is driven over IPC and
// the frontend polls audioStatus() for position / finished.

export interface AudioStatus {
  positionMs: number;
  durationMs: number;
  playing: boolean;
  /** True once (consumed on read) when the track reached its natural end. */
  finished: boolean;
  /** True once (consumed on read) when a load failed — frontend skips it. */
  error: boolean;
}

export function audioPlay(path: string): Promise<void> {
  return invoke("audio_play", { path });
}
export function audioPause(): Promise<void> {
  return invoke("audio_pause");
}
export function audioResume(): Promise<void> {
  return invoke("audio_resume");
}
export function audioStop(): Promise<void> {
  return invoke("audio_stop");
}
export function audioSeek(seconds: number): Promise<void> {
  return invoke("audio_seek", { seconds });
}
export function audioSetVolume(volume: number): Promise<void> {
  return invoke("audio_set_volume", { volume });
}
export function audioStatus(): Promise<AudioStatus> {
  return invoke("audio_status");
}

/** Latest spectrum bar magnitudes (0..1), recomputed in Rust ~30×/s. The
 *  Now-playing visualizer polls this on a rAF loop. */
export function audioSpectrum(): Promise<number[]> {
  return invoke("audio_spectrum");
}
