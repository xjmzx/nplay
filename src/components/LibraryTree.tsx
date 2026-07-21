import { memo, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Film,
  Music2,
  Play,
  Plus,
} from "lucide-react";
import { cn } from "../lib/cn";
import { COLLECTION_DND } from "../lib/dnd";
import { formatTime } from "../lib/format";
import { listAlbumTracks, type Album, type Track } from "../lib/tauri";

export type SortKey = "artist" | "album" | "year";

// Ghost artist rows — the empty space below the tree keeps the list's rhythm
// going instead of falling away to flat panel, which is what a hard filter used
// to leave behind. Same idea as the Playlist's ghost rows.
//
// Two things it has to get right or it reads as a *different* element rather
// than a trace of the next one:
//
//  1. It traces the ARTIST row, not the release row. Collection is a tree of
//     three row types (artist = mauve, release = digital, track = bare), and a
//     ghost can only be one of them. At the bottom of the list the next thing
//     that would appear is an artist, so mauve it is.
//  2. It matches the artist row's GEOMETRY, not just its colour: a 20px chevron
//     gutter (14px icon + 6px gap), the flexible name fill, then the 36px count
//     chip. A plain full-width stripe would line up with nothing.
//
// Faint on purpose — the real fill is mauve/10, so a trace sits below that.
// Pitch: 2px lead-in (the row wrapper's py-0.5) + 24px fill + 2px = 28px.
const GHOST_FILL =
  "repeating-linear-gradient(to bottom," +
  "transparent 0 2px," +
  "rgb(var(--c-mauve) / 0.05) 2px 26px," +
  "transparent 26px 28px)";

function GhostRows() {
  return (
    <div
      aria-hidden="true"
      className="flex-1 min-h-0 flex items-stretch gap-1.5 pl-5"
    >
      <div className="flex-1" style={{ background: GHOST_FILL }} />
      <div className="w-9 shrink-0" style={{ background: GHOST_FILL }} />
    </div>
  );
}

/** mp4/m4v play with picture (h264/aac/ac3 via WebKit+libav); others audio-only. */
const isPlayableVideo = (p: string) => /\.(mp4|m4v)$/i.test(p);

interface LibraryTreeProps {
  albums: Album[];
  /** Id of the track currently loaded in the transport (for highlight). */
  currentTrackId: number | null;
  /** Play `tracks` starting at `startIndex` (replaces the playlist). */
  onPlay: (tracks: Track[], startIndex: number) => void;
  /** Append tracks to the playlist. */
  onAddToPlaylist: (tracks: Track[]) => void;
  /** Album ordering within each artist. */
  sort: SortKey;
  /** Substring filter over artist + album names (case-insensitive). */
  filter: string;
  /** Restrict to albums that contain video, and show only their video tracks. */
  videoOnly: boolean;
  /** Restrict to albums on this record label ("" = all). Label comes from
   *  ndisc's catalogue export, so albums ndisc doesn't know are excluded. */
  labelFilter: string;
}

interface ArtistGroup {
  artist: string;
  albums: Album[];
}

// Memoized: the Collection is the heaviest panel; keeping it out of the app's
// 250ms position-tick re-render (its props are referentially stable between
// ticks) is the main reason the transport poll no longer reconciles the tree.
export const LibraryTree = memo(LibraryTreeImpl);

function LibraryTreeImpl({
  albums,
  currentTrackId,
  onPlay,
  onAddToPlaylist,
  sort,
  filter,
  videoOnly,
  labelFilter,
}: LibraryTreeProps) {
  // Group by artist (backend already sorts by artist, year, album), then
  // re-order each group's albums by the chosen sort and apply the filter.
  const groups = useMemo<ArtistGroup[]>(() => {
    const byLabel = labelFilter
      ? albums.filter((a) => a.label === labelFilter)
      : albums;
    const source = videoOnly ? byLabel.filter((a) => a.hasVideo) : byLabel;
    const out: ArtistGroup[] = [];
    let last: ArtistGroup | null = null;
    for (const a of source) {
      if (!last || last.artist !== a.artist) {
        last = { artist: a.artist, albums: [] };
        out.push(last);
      }
      last.albums.push(a);
    }

    const byAlbum = (x: Album, y: Album) =>
      x.album.toLowerCase().localeCompare(y.album.toLowerCase());
    for (const g of out) {
      if (sort === "album") {
        g.albums = [...g.albums].sort(byAlbum);
      } else if (sort === "year") {
        g.albums = [...g.albums].sort(
          (x, y) => (x.year ?? Infinity) - (y.year ?? Infinity) || byAlbum(x, y),
        );
      }
      // "artist" keeps the backend (year, album) order.
    }

    const f = filter.trim().toLowerCase();
    if (!f) return out;
    return out
      .map((g) => {
        if (g.artist.toLowerCase().includes(f)) return g;
        const albums = g.albums.filter((al) =>
          al.album.toLowerCase().includes(f),
        );
        return albums.length ? { artist: g.artist, albums } : null;
      })
      .filter((g): g is ArtistGroup => g !== null);
  }, [albums, sort, filter, videoOnly, labelFilter]);

  // Auto-expand artists when narrowing (text filter, video-only or label) so the
  // (usually few) matches are visible without manual drilling.
  const filtering = filter.trim().length > 0 || videoOnly || labelFilter !== "";

  const [openArtists, setOpenArtists] = useState<Set<string>>(new Set());
  const [openAlbums, setOpenAlbums] = useState<Set<number>>(new Set());
  const [trackCache, setTrackCache] = useState<Record<number, Track[]>>({});
  const [loading, setLoading] = useState<Set<number>>(new Set());

  function toggleArtist(name: string) {
    setOpenArtists((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function ensureTracks(albumId: number): Promise<Track[]> {
    if (trackCache[albumId]) return trackCache[albumId];
    setLoading((p) => new Set(p).add(albumId));
    try {
      const rows = await listAlbumTracks(albumId);
      setTrackCache((p) => ({ ...p, [albumId]: rows }));
      return rows;
    } finally {
      setLoading((p) => {
        const n = new Set(p);
        n.delete(albumId);
        return n;
      });
    }
  }

  async function toggleAlbum(albumId: number) {
    const isOpen = openAlbums.has(albumId);
    if (!isOpen) await ensureTracks(albumId);
    setOpenAlbums((prev) => {
      const next = new Set(prev);
      next.has(albumId) ? next.delete(albumId) : next.add(albumId);
      return next;
    });
  }

  async function playAlbum(albumId: number, startIndex = 0) {
    const rows = await ensureTracks(albumId);
    if (rows.length) onPlay(rows, startIndex);
  }

  async function addAlbum(albumId: number) {
    const rows = await ensureTracks(albumId);
    if (rows.length) onAddToPlaylist(rows);
  }

  if (!albums.length) {
    return (
      <div className="text-sm flex flex-col min-h-full">
        <div className="text-muted px-2 py-4">
          No albums indexed yet. Scan your library to get started.
        </div>
        <GhostRows />
      </div>
    );
  }

  // "No matches" is precisely the case this exists for: a hard filter used to
  // leave a flat, empty panel.
  if (!groups.length) {
    return (
      <div className="text-sm flex flex-col min-h-full">
        <div className="text-muted px-2 py-4">No matches.</div>
        <GhostRows />
      </div>
    );
  }

  return (
    <div className="text-sm flex flex-col min-h-full">
      {groups.map((g) => {
        // While filtering, show matching groups expanded so hits are visible.
        const artistOpen = filtering || openArtists.has(g.artist);
        return (
          <div key={g.artist}>
            <button
              onClick={() => toggleArtist(g.artist)}
              className="group/row w-full flex items-center gap-1.5 py-0.5 text-left"
            >
              {artistOpen ? (
                <ChevronDown size={14} className="text-muted shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-muted shrink-0" />
              )}
              <span className="flex-1 truncate min-w-0 px-2 py-0.5 bg-mauve/10 group-hover/row:bg-mauve/25 text-mauve font-medium transition-colors">
                {g.artist}
              </span>
              {/* Album count — neutral quantity badge (--c-medium: leaf-green in
                  colour themes, grey in mono). Soft fill (medium/15 over the row)
                  so it stays quiet; the name pill carries the tier hue, the
                  quantity stays neutral. Top-right corner rounded. Ref: ndisc. */}
              <span className="shrink-0 min-w-[2.25rem] px-2 py-0.5 bg-medium/15 text-medium text-[11px] tabular-nums text-center rounded-tr-xl">
                {g.albums.length}
              </span>
            </button>

            {artistOpen && (
              <div className="ml-3 border-l border-surface/40 pl-1">
                {g.albums.map((al) => {
                  const albumOpen = openAlbums.has(al.id);
                  const tracks = trackCache[al.id] ?? [];
                  const isLoading = loading.has(al.id);
                  return (
                    <div key={al.id}>
                      <div
                        className="group flex items-center gap-1.5 py-0.5"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            COLLECTION_DND,
                            JSON.stringify({ kind: "album", albumId: al.id }),
                          );
                          e.dataTransfer.setData("text/plain", al.album);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        <button
                          onClick={() => toggleAlbum(al.id)}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                        >
                          {albumOpen ? (
                            <ChevronDown
                              size={13}
                              className="text-muted shrink-0"
                            />
                          ) : (
                            <ChevronRight
                              size={13}
                              className="text-muted shrink-0"
                            />
                          )}
                          <span className="flex-1 truncate min-w-0 px-2 py-0.5 bg-digital/10 group-hover:bg-digital/25 text-digital transition-colors">
                            {al.album}
                          </span>
                          {al.year != null && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-digital/10 group-hover:bg-digital/25 text-digital text-[11px] tabular-nums transition-colors">
                              {al.year}
                            </span>
                          )}
                          {al.hasVideo && (
                            <Film size={12} className="text-mauve/70 shrink-0" />
                          )}
                        </button>
                        {/* Album Play / Add sit on the row's digital tint (like
                            the name + year pills) so they read as part of one
                            album bar rather than floating bare. */}
                        <button
                          onClick={() => playAlbum(al.id, 0)}
                          title="Play album"
                          className="shrink-0 px-1.5 py-1 bg-digital/10 group-hover:bg-digital/25 text-muted/60 hover:text-accent transition-colors"
                        >
                          <Play size={13} />
                        </button>
                        <button
                          onClick={() => addAlbum(al.id)}
                          title="Add album to playlist"
                          className="shrink-0 px-1.5 py-1 bg-digital/10 group-hover:bg-digital/25 text-muted/60 hover:text-accent transition-colors"
                        >
                          <Plus size={13} />
                        </button>
                        {/* Track count — same soft neutral quantity badge as the
                            artist album-count; the digital name pill keeps the
                            release-tier hue. */}
                        <span className="shrink-0 min-w-[2.25rem] px-2 py-0.5 bg-medium/15 text-medium text-[11px] tabular-nums text-center rounded-tr-xl">
                          {al.trackCount}
                        </span>
                      </div>

                      {albumOpen && (
                        <div className="ml-5 border-l border-surface/30 pl-1">
                          {isLoading && (
                            <div className="px-2 py-1 text-[11px] text-muted">
                              loading…
                            </div>
                          )}
                          {(videoOnly
                            ? tracks.filter((t) => t.isVideo)
                            : tracks
                          ).map((t, i, shown) => {
                            const active = t.id === currentTrackId;
                            const playableVideo = t.isVideo && isPlayableVideo(t.path);
                            const unplayable = t.playable === false;
                            return (
                              <div
                                key={t.id}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    COLLECTION_DND,
                                    JSON.stringify({ kind: "track", track: t }),
                                  );
                                  e.dataTransfer.setData("text/plain", t.title);
                                  e.dataTransfer.effectAllowed = "copy";
                                }}
                                className={cn(
                                  "group flex items-center gap-2 px-2 py-1 hover:bg-surface/50",
                                  active && "bg-surface/70",
                                )}
                                title={
                                  unplayable
                                    ? `${t.codec ?? "This format"} can't be decoded — will be skipped`
                                    : undefined
                                }
                              >
                                <button
                                  onDoubleClick={() => onPlay(shown, i)}
                                  title="Double-click to play"
                                  className="flex items-center gap-2 min-w-0 flex-1 text-left select-none"
                                >
                                  {active ? (
                                    <Music2
                                      size={12}
                                      className="text-accent shrink-0"
                                    />
                                  ) : (
                                    <span className="w-4 text-right text-[11px] text-muted tabular-nums shrink-0">
                                      {t.trackNo ?? "·"}
                                    </span>
                                  )}
                                  <span
                                    className={cn(
                                      "truncate flex-1",
                                      unplayable
                                        ? "text-muted/50 line-through decoration-muted/30"
                                        : active
                                          ? "text-accent"
                                          : playableVideo
                                            ? "text-digital"
                                            : "text-fg/75",
                                    )}
                                  >
                                    {t.title}
                                  </span>
                                </button>
                                {unplayable && (
                                  <span className="shrink-0 text-[9px] font-medium tracking-wide text-auburn border border-auburn/40 px-1 leading-tight">
                                    {t.codec ?? "?"}
                                  </span>
                                )}
                                {t.isVideo && (
                                  <Film
                                    size={11}
                                    className={cn(
                                      "shrink-0",
                                      playableVideo
                                        ? "text-digital"
                                        : "text-mauve/60",
                                    )}
                                  />
                                )}
                                {t.duration != null && (
                                  <span className="text-[11px] text-muted tabular-nums shrink-0">
                                    {formatTime(t.duration)}
                                  </span>
                                )}
                                <button
                                  onClick={() => onAddToPlaylist([t])}
                                  title="Add to playlist"
                                  className="text-muted/50 hover:text-accent shrink-0 transition-colors"
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <GhostRows />
    </div>
  );
}
