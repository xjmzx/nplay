import { memo, useEffect, useMemo, useState } from "react";
import { Film, Music4, Play, Plus } from "lucide-react";
import { COLLECTION_DND } from "../lib/dnd";
import { matches, searchKey } from "../lib/search";
import { fileSrc, listAlbumTracks, type Album, type Track } from "../lib/tauri";

/** First release year Home shows: the year it was twelve months ago. Tags only
 *  carry a year, so the window is year-precise — in November 2026 it holds
 *  2025 and 2026, and from 1 January 2027 it rolls to 2026 and 2027. Folder
 *  dates were considered and rejected: bulk moves rewrote most of them. */
export function homeSince(now: Date): number {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 1);
  return d.getFullYear();
}

/** Today's date, re-read hourly and on window focus, so a window left open
 *  across New Year rolls forward on its own. */
function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const tick = () =>
      setToday((prev) => {
        const now = new Date();
        return now.toDateString() === prev.toDateString() ? prev : now;
      });
    const id = setInterval(tick, 60 * 60 * 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return today;
}

interface HomeGridProps {
  albums: Album[];
  /** Header search text — narrows Home the same way it narrows the Collection. */
  filter: string;
  onPlay: (tracks: Track[], startIndex: number) => void;
  onAddToPlaylist: (tracks: Track[]) => void;
  /** Album of the track playing now, outlined in the grid. */
  currentAlbumId: number | null;
}

// Memoized for the same reason as LibraryTree: keep the cover grid out of the
// app's 250ms position-tick re-render.
export const HomeGrid = memo(HomeGridImpl);

function HomeGridImpl({
  albums,
  filter,
  onPlay,
  onAddToPlaylist,
  currentAlbumId,
}: HomeGridProps) {
  const today = useToday();
  const since = homeSince(today);

  // Newest year first; within a year, by artist then album.
  const years = useMemo(() => {
    const f = searchKey(filter.trim());
    const recent = albums.filter(
      (a) =>
        a.year !== null &&
        a.year >= since &&
        (!f || matches(a.artist, f) || matches(a.album, f)),
    );
    const byYear = new Map<number, Album[]>();
    for (const a of recent) {
      const list = byYear.get(a.year!) ?? [];
      list.push(a);
      byYear.set(a.year!, list);
    }
    const cmp = (x: Album, y: Album) =>
      x.artist.localeCompare(y.artist, undefined, { sensitivity: "base" }) ||
      x.album.localeCompare(y.album, undefined, { sensitivity: "base" });
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => ({ year, albums: list.sort(cmp) }));
  }, [albums, filter, since]);

  async function withTracks(albumId: number, fn: (t: Track[]) => void) {
    try {
      const rows = await listAlbumTracks(albumId);
      if (rows.length) fn(rows);
    } catch (e) {
      console.error("album tracks failed", e);
    }
  }

  if (!years.length) {
    return (
      <div className="px-2 py-4 text-sm text-muted">
        {filter.trim()
          ? "No recent releases match."
          : `No releases tagged ${since} or later.`}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      {years.map(({ year, albums }) => (
        <div key={year}>
          <div className="flex items-baseline gap-2 mb-2 px-0.5">
            <span className="text-accent font-semibold tabular-nums">{year}</span>
            <span className="text-[11px] text-muted tabular-nums">
              {albums.length} {albums.length === 1 ? "release" : "releases"}
            </span>
          </div>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
            {albums.map((al) => (
              <Tile
                key={al.id}
                album={al}
                playing={al.id === currentAlbumId}
                onPlay={() => withTracks(al.id, (t) => onPlay(t, 0))}
                onAdd={() => withTracks(al.id, onAddToPlaylist)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({
  album,
  playing,
  onPlay,
  onAdd,
}: {
  album: Album;
  playing: boolean;
  onPlay: () => void;
  onAdd: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const cover = album.coverPath && !broken ? album.coverPath : null;
  return (
    <div
      className="group min-w-0"
      draggable
      onDragStart={(e) => {
        // Same payload as a Collection album row, so it drops on the Playlist.
        e.dataTransfer.setData(
          COLLECTION_DND,
          JSON.stringify({ kind: "album", albumId: album.id }),
        );
        e.dataTransfer.setData("text/plain", album.album);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div
        className={
          "relative aspect-square rounded-lg overflow-hidden bg-surface/40 border shadow-inner " +
          (playing ? "border-accent" : "border-surface/60")
        }
      >
        {cover ? (
          <img
            src={fileSrc(cover)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Music4 size={36} className="text-muted/40" strokeWidth={1.2} />
          </div>
        )}
        {album.hasVideo && (
          <Film
            size={13}
            className="absolute top-1.5 left-1.5 text-fg/80 drop-shadow"
          />
        )}
        {/* Click the art to play; the corner button appends instead. */}
        <button
          onClick={onPlay}
          title={`Play ${album.album}`}
          aria-label={`Play ${album.album}`}
          className="absolute inset-0 flex items-center justify-center bg-bg/0
                     group-hover:bg-bg/45 transition-colors"
        >
          <Play
            size={30}
            fill="currentColor"
            className="text-fg opacity-0 group-hover:opacity-90 transition-opacity"
          />
        </button>
        <button
          onClick={onAdd}
          title="Add album to playlist"
          aria-label={`Add ${album.album} to playlist`}
          className="absolute bottom-1.5 right-1.5 p-1 rounded bg-bg/70 text-fg/80
                     opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="text-[13px] text-fg truncate" title={album.album}>
          {album.album}
        </div>
        <div className="text-[12px] text-fg/60 truncate" title={album.artist}>
          {album.artist}
        </div>
        {album.label && (
          <div className="text-[11px] text-muted truncate" title={album.label}>
            {album.label}
          </div>
        )}
      </div>
    </div>
  );
}
