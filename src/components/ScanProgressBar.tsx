import type { ScanProgress } from "../lib/tauri";

/**
 * One-line narration of a scan for the header summary slot — the words the
 * 80px bar can't carry. Names the current phase and folds in live counts so
 * even the fast read sweep reads as real work rather than a flicker to 100%.
 */
export function scanStatusText(progress: ScanProgress | null): string {
  const phase = progress?.phase ?? "walk";
  const done = (progress?.done ?? 0).toLocaleString();
  const total = (progress?.total ?? 0).toLocaleString();
  switch (phase) {
    case "walk":
      // total is unknown during the walk; the growing "found N" is the point.
      return (progress?.done ?? 0) > 0
        ? `finding files… ${done}`
        : "finding files…";
    case "read":
      return `reading tags… ${done} / ${total}`;
    case "index":
      return "building albums…";
    case "done":
      return "done";
    default:
      return "scanning…";
  }
}

/**
 * Full-width scan-progress bar that sits directly under the header status
 * line (scanStatusText), spanning the same width. The recessed track is
 * always shown in a muted state; when a scan runs the accent fill grows
 * across it (green on completion). No inline label — the words live in the
 * status line above it, so the bar is purely the glanceable fill and stacks
 * under the text rather than stealing width beside it.
 *
 * Covers both the first import and a manual re-scan (both feed `progress`).
 */
export function ScanProgressBar({
  progress,
  active,
}: {
  progress: ScanProgress | null;
  active: boolean;
}) {
  // walk (discovering) and index (album build / DB write) have no useful
  // done/total, so the bar pulses rather than pinning at a misleading value.
  const phase = progress?.phase ?? "walk";
  const finished = active && phase === "done";
  const indeterminate = active && (phase === "walk" || phase === "index");
  const total = Math.max(1, progress?.total ?? 1);
  const done = progress?.done ?? 0;
  const pct = !active ? 0 : indeterminate ? 100 : Math.round((100 * done) / total);

  return (
    <div className="w-full h-1 bg-surface/60 overflow-hidden" title="Scan progress">
      {indeterminate ? (
        <div className="h-full w-1/3 bg-accent/70 animate-pulse" />
      ) : (
        <div
          className={
            finished
              ? "h-full bg-ok transition-[width] duration-150"
              : "h-full bg-accent transition-[width] duration-150"
          }
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
