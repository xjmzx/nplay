import type { ScanProgress } from "../lib/tauri";

/**
 * Compact scan-progress bar that lives permanently inline in the header
 * (next to the album count + Scan button). The recessed track is always
 * shown in a muted state; when a scan runs the accent fill grows across it
 * and a live pct/phase label appears. Persistent so it never shifts the
 * header layout — a full-width banner jolted the whole view and the scan
 * is too quick to read.
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

  const label = !active
    ? ""
    : finished
      ? "✓"
      : phase === "index"
        ? "idx"
        : indeterminate
          ? "···"
          : `${pct}%`;

  return (
    <div className="flex items-center gap-2" title="Scan progress">
      <div className="w-20 h-1 bg-surface/60 overflow-hidden">
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
      <span
        className={
          "text-[11px] font-mono tabular-nums w-8 text-right shrink-0 " +
          (finished ? "text-ok" : "text-muted")
        }
      >
        {label}
      </span>
    </div>
  );
}
