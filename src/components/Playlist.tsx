import { memo, useState } from "react";
import {
  ArrowDownUp,
  Ban,
  CopyMinus,
  FolderOpen,
  FolderSearch,
  GripVertical,
  Play,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";
import { revealInFileManager, type Album, type Track } from "../lib/tauri";

/** One-shot sort keys for the playlist (applied as a reorder, not a mode). */
export type PlaylistSortKey = "title" | "artist" | "album" | "duration";

const SORT_OPTIONS: [PlaylistSortKey, string][] = [
  ["artist", "Artist"],
  ["album", "Album"],
  ["title", "Title"],
  ["duration", "Duration"],
];

interface PlaylistProps {
  tracks: Track[];
  albumById: Map<number, Album>;
  currentTrackId: number | null;
  /** Start playback at this index within the playlist. */
  onPlayAt: (index: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  /** Import an .xspf into the playlist. */
  onLoad: () => void;
  /** Export the playlist as an .xspf. */
  onSave: () => void;
  /** Drop tracks whose format can't be decoded. */
  onRemoveUnavailable: () => void;
  /** Collapse duplicate paths, keeping the first occurrence. */
  onRemoveDuplicates: () => void;
  /** Move a track from one row to another (drag-drop reorder). */
  onReorder: (from: number, to: number) => void;
  /** Sort the whole list by a key (one-shot reorder). */
  onSort: (key: PlaylistSortKey) => void;
}

// Memoized so the app's 250ms position tick doesn't reconcile the list (its
// props are stable between ticks — only the footer needs the tick).
export const Playlist = memo(PlaylistImpl);

function PlaylistImpl({
  tracks,
  albumById,
  currentTrackId,
  onPlayAt,
  onRemove,
  onClear,
  onLoad,
  onSave,
  onRemoveUnavailable,
  onRemoveDuplicates,
  onReorder,
  onSort,
}: PlaylistProps) {
  const hasUnavailable = tracks.some((t) => t.playable === false);
  const seenPaths = new Set<string>();
  const hasDuplicates = tracks.some((t) =>
    seenPaths.has(t.path) ? true : (seenPaths.add(t.path), false),
  );
  const [sortOpen, setSortOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-1">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 -mt-1 pt-1 bg-panel/95 flex items-center gap-2">
        <button
          onClick={() => onPlayAt(0)}
          disabled={!tracks.length}
          className="flex items-center gap-1.5 text-[12px] px-2 py-1 bg-surface/70 hover:bg-surfaceHover disabled:opacity-40 transition-colors"
          title="Play playlist"
        >
          <Play size={13} /> Play
        </button>
        <div className="relative ml-auto">
          <button
            onClick={() => setSortOpen((o) => !o)}
            disabled={!tracks.length}
            title="Sort playlist"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            className="text-muted hover:text-accent disabled:opacity-40 transition-colors"
          >
            <ArrowDownUp size={14} />
          </button>
          {sortOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setSortOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 flex flex-col border border-surface bg-panel py-1 text-[12px] shadow-lg"
              >
                {SORT_OPTIONS.map(([key, label]) => (
                  <button
                    key={key}
                    role="menuitem"
                    onClick={() => {
                      onSort(key);
                      setSortOpen(false);
                    }}
                    className="px-3 py-1 text-left whitespace-nowrap text-fg/80 hover:bg-surface/60 hover:text-accent transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          onClick={onLoad}
          title="Load an .xspf playlist"
          className="text-muted hover:text-accent transition-colors"
        >
          <FolderOpen size={14} />
        </button>
        <button
          onClick={onSave}
          disabled={!tracks.length}
          title="Save as .xspf"
          className="text-muted hover:text-accent disabled:opacity-40 transition-colors"
        >
          <Save size={14} />
        </button>
        <button
          onClick={onRemoveUnavailable}
          disabled={!hasUnavailable}
          title="Remove unavailable tracks"
          className="text-muted hover:text-alert disabled:opacity-40 transition-colors"
        >
          <Ban size={14} />
        </button>
        <button
          onClick={onRemoveDuplicates}
          disabled={!hasDuplicates}
          title="Remove duplicate tracks"
          className="text-muted hover:text-alert disabled:opacity-40 transition-colors"
        >
          <CopyMinus size={14} />
        </button>
        <span className="text-[11px] text-muted tabular-nums">
          {tracks.length}
        </span>
        <button
          onClick={onClear}
          disabled={!tracks.length}
          title="Clear playlist"
          className="text-muted hover:text-alert disabled:opacity-40 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {!tracks.length ? (
        <div className="text-[13px] text-muted px-1 py-2">
          Empty. Add tracks from the Collection with the{" "}
          <span className="text-fg/70">+</span> button.
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {tracks.map((t, i) => {
            const active = t.id === currentTrackId;
            const artist = albumById.get(t.albumId)?.artist ?? "";
            const unplayable = t.playable === false;
            return (
              <div
                key={`${t.id}-${i}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overIndex !== i) setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) onReorder(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1 hover:bg-surface/50 text-[13px]",
                  active && "bg-surface/70",
                  dragIndex === i && "opacity-40",
                  overIndex === i &&
                    dragIndex !== null &&
                    dragIndex !== i &&
                    "ring-1 ring-inset ring-accent/60 bg-accent/10",
                )}
                title={
                  unplayable
                    ? `${t.codec ?? "This format"} can't be decoded — will be skipped`
                    : undefined
                }
              >
                <GripVertical
                  size={13}
                  className="shrink-0 text-muted/40 opacity-0 group-hover:opacity-100 cursor-grab transition-opacity"
                  aria-hidden="true"
                />
                <div
                  onDoubleClick={() => onPlayAt(i)}
                  title="Double-click to play"
                  className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer select-none"
                >
                  <span className="w-4 text-right text-[11px] text-muted tabular-nums shrink-0">
                    {i + 1}
                  </span>
                  <span className="truncate min-w-0">
                    <span
                      className={cn(
                        unplayable
                          ? "text-muted/50 line-through decoration-muted/30"
                          : active
                            ? "text-accent"
                            : "text-fg/80",
                      )}
                    >
                      {t.title}
                    </span>
                    {artist && <span className="text-muted"> · {artist}</span>}
                  </span>
                </div>
                {unplayable && (
                  <span className="shrink-0 text-[9px] font-medium tracking-wide text-auburn border border-auburn/40 px-1 leading-tight">
                    {t.codec ?? "?"}
                  </span>
                )}
                {t.duration != null && (
                  <span className="text-[11px] text-muted tabular-nums shrink-0">
                    {formatTime(t.duration)}
                  </span>
                )}
                <button
                  onClick={() => revealInFileManager(t.path).catch(() => {})}
                  title="Show in file browser"
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent shrink-0 transition-opacity"
                >
                  <FolderSearch size={13} />
                </button>
                <button
                  onClick={() => onRemove(i)}
                  title="Remove"
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-alert shrink-0 transition-opacity"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
