import { useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";
import type { Album, Track } from "../lib/tauri";

interface PlayerBarProps {
  track: Track | null;
  album: Album | null;
  currentTime: number;
  duration: number;
  volume: number;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
}

// Transport (prev/play/next) lives in the header now; the footer is just the
// centered now-playing title, seek bar, time readouts and volume.
export function PlayerBar({
  track,
  album,
  currentTime,
  duration,
  volume,
  onSeek,
  onVolume,
}: PlayerBarProps) {
  // Drag-scrub the progress bar. While dragging we track the scrubbed time
  // locally (so the fill/thumb follow the pointer live) and only commit the
  // real seek on release — avoids hammering the decoder with a seek per
  // pointer-move. A plain click is a down+up in place, so it still seeks.
  const barRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const seekable = !!track && duration > 0 && isFinite(duration);

  function timeFromClientX(clientX: number): number {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * duration;
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!seekable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrub(timeFromClientX(e.clientX));
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (scrub === null) return;
    setScrub(timeFromClientX(e.clientX));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (scrub === null) return;
    onSeek(scrub);
    setScrub(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  const shown = scrub ?? currentTime;
  const pct = duration > 0 ? (shown / duration) * 100 : 0;

  return (
    <div className="flex justify-center px-4 py-2.5 bg-panel border-t border-surface/60">
      <div className="w-1/2 min-w-[300px] max-w-full flex flex-col items-center gap-1">
        {/* Title */}
        <div className="flex items-center justify-center gap-2 text-[13px] min-w-0 max-w-full">
          <span className="truncate text-fg/90">{track?.title ?? "—"}</span>
          {album && (
            <span className="truncate text-muted shrink-[2]">{album.artist}</span>
          )}
        </div>

        {/* Elapsed · seek · total · volume */}
        <div className="w-full flex items-center gap-2">
          <span className="text-[11px] text-muted font-mono tabular-nums w-9 text-right shrink-0">
            {formatTime(shown)}
          </span>
          <div
            ref={barRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={cn(
              "group/seek flex-1 h-1.5 bg-surface/60 relative min-w-0 touch-none",
              seekable ? "cursor-pointer" : "cursor-default",
            )}
            title="Click or drag to seek"
          >
            <div
              className="h-full bg-accent"
              style={{ width: `${pct}%` }}
            />
            {seekable && (
              <div
                className={cn(
                  "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 bg-accent shadow transition-opacity",
                  scrub !== null
                    ? "opacity-100"
                    : "opacity-0 group-hover/seek:opacity-100",
                )}
                style={{ left: `${pct}%` }}
              />
            )}
          </div>
          <span className="text-[11px] text-muted font-mono tabular-nums w-9 shrink-0">
            {formatTime(duration)}
          </span>
          <Volume2 size={15} className="text-muted shrink-0 ml-1" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(parseFloat(e.target.value))}
            title="Volume"
            className={cn(
              "w-24 cursor-pointer shrink-0 appearance-none bg-transparent",
              // visible track
              "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-surfaceHover",
              // accent thumb, centered on the thin track
              "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:-mt-[3px]",
            )}
          />
        </div>
      </div>
    </div>
  );
}
