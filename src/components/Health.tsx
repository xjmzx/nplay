import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileVideo2,
  FolderSearch,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "../lib/cn";
import {
  acknowledgeFiles,
  libraryHealth,
  type LibraryHealth,
  type ProblemFile,
} from "../lib/tauri";

// "N ago", compact. Anything under a minute reads as "just now".
export function fmtAgo(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const KIND_COPY: Record<
  ProblemFile["kind"],
  { label: string; why: string; fix: string }
> = {
  undecodable_audio: {
    label: "No decoder",
    why: "Lossless formats the audio engine has no decoder for (APE, WavPack, TAK, WMA). The files are not damaged — they simply can't be read.",
    fix: "Transcode to FLAC. Lossless to lossless: nothing is lost, and they become playable.",
  },
  pictureless_video: {
    label: "No picture",
    why: "Not an mp4/m4v container, so the webview can't draw it. These still play — audio only, via ffmpeg.",
    fix: "Remux/transcode to H.264 + AAC faststart mp4 (ntree's “Normalize videos”).",
  },
};

export function Health({
  open,
  onClose,
  onRescan,
  scanning,
  onAcknowledged,
}: {
  open: boolean;
  onClose: () => void;
  onRescan: () => void;
  scanning: boolean;
  /** Acknowledging changes what the header should nag about, so the parent has
   *  to refetch its stats — this dialog is not the only thing showing them. */
  onAcknowledged?: () => void;
}) {
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAcked, setShowAcked] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setHealth(await libraryHealth());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Re-check whenever the dialog opens, and after a scan finishes — the whole
  // point is that it reflects disk as it is now, not as it was.
  useEffect(() => {
    if (open && !scanning) void load();
  }, [open, scanning]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const all = health?.problems ?? [];
    const visible = showAcked ? all : all.filter((p) => !p.acknowledged);
    const by = new Map<ProblemFile["kind"], ProblemFile[]>();
    for (const p of visible) {
      const list = by.get(p.kind) ?? [];
      list.push(p);
      by.set(p.kind, list);
    }
    return by;
  }, [health, showAcked]);

  const ackedCount = (health?.problems ?? []).filter(
    (p) => p.acknowledged,
  ).length;
  const drift = (health?.stale.length ?? 0) + (health?.unindexed.length ?? 0);

  async function setAck(paths: string[], acknowledged: boolean) {
    await acknowledgeFiles(paths, acknowledged);
    await load();
    onAcknowledged?.();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-full flex flex-col bg-panel border
                   border-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b border-surface">
          <AlertTriangle size={16} className="text-accent shrink-0" />
          <h2 className="text-sm font-semibold text-fg flex-1">Library health</h2>
          <button
            onClick={() => void load()}
            disabled={loading || scanning}
            className="p-1.5 text-muted hover:text-fg disabled:opacity-40"
            title="Re-check"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-fg"
            title="Close"
          >
            <X size={14} />
          </button>
        </header>

        <div className="overflow-y-auto px-4 py-3 text-xs">
          {error && <p className="text-alert font-mono">{error}</p>}

          {/* ---- Index vs disk ------------------------------------------- */}
          <section className="mb-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <Stat
                label="indexed"
                value={(health?.indexedTracks ?? 0).toLocaleString()}
              />
              <Stat
                label="on disk"
                value={(health?.onDisk ?? 0).toLocaleString()}
              />
              <Stat
                label="last scanned"
                value={
                  health?.lastScannedAt
                    ? fmtAgo(health.lastScannedAt)
                    : "never"
                }
                tone={health?.lastScannedAt ? "accent" : "warn"}
              />
            </div>

            {drift > 0 ? (
              <div className="mt-2 border border-warn/40 bg-warn/10 p-2.5">
                <p className="text-warn font-medium">
                  The index has drifted from disk.
                </p>
                <p className="mt-1 text-muted leading-relaxed">
                  {health!.unindexed.length > 0 && (
                    <>
                      <span className="font-mono text-fg">
                        {health!.unindexed.length}
                      </span>{" "}
                      file{health!.unindexed.length === 1 ? "" : "s"} on disk
                      are not indexed.{" "}
                    </>
                  )}
                  {health!.stale.length > 0 && (
                    <>
                      <span className="font-mono text-fg">
                        {health!.stale.length}
                      </span>{" "}
                      indexed file{health!.stale.length === 1 ? "" : "s"} are
                      gone from disk.
                    </>
                  )}
                </p>
                <button
                  onClick={onRescan}
                  disabled={scanning}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs
                             font-semibold bg-accent text-bg
                             hover:opacity-90 disabled:opacity-50"
                >
                  <FolderSearch size={13} />
                  {scanning ? "scanning…" : "Rescan library"}
                </button>
                <Paths label="not indexed" paths={health!.unindexed} />
                <Paths label="gone from disk" paths={health!.stale} />
              </div>
            ) : (
              health && (
                <p className="mt-2 text-ok flex items-center gap-1.5">
                  <Check size={13} /> Index matches disk.
                </p>
              )
            )}
          </section>

          {/* ---- Problem files ------------------------------------------- */}
          {[...groups.entries()].map(([kind, files]) => {
            const copy = KIND_COPY[kind];
            const unacked = files.filter((f) => !f.acknowledged);
            return (
              <section key={kind} className="mb-4">
                <div className="flex items-baseline gap-2">
                  <FileVideo2 size={13} className="text-auburn shrink-0" />
                  <h3 className="text-fg font-medium">{copy.label}</h3>
                  <span className="font-mono text-auburn">{files.length}</span>
                  {unacked.length > 0 && (
                    <button
                      onClick={() =>
                        void setAck(
                          unacked.map((f) => f.path),
                          true,
                        )
                      }
                      className="ml-auto text-[11px] text-muted hover:text-fg"
                      title="Mark these as seen and accepted — they stop being flagged"
                    >
                      acknowledge all
                    </button>
                  )}
                </div>
                <p className="mt-1 text-muted leading-relaxed">{copy.why}</p>
                <p className="mt-0.5 text-muted leading-relaxed">
                  <span className="text-fg/70">Fix:</span> {copy.fix}
                </p>

                <ul className="mt-2 divide-y divide-surface/60 border border-surface/60">
                  {files.map((f) => (
                    <li
                      key={f.path}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5",
                        f.acknowledged && "opacity-50",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fg/85">
                          {f.title || f.path.split("/").pop()}
                        </span>
                        <span className="block truncate text-[10px] text-muted">
                          {f.artist} · {f.album}
                        </span>
                      </span>
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px]
                                       font-mono text-auburn bg-auburn/10">
                        {f.codec}
                      </span>
                      <button
                        onClick={() => void setAck([f.path], !f.acknowledged)}
                        className={cn(
                          "shrink-0 px-1.5 py-0.5 text-[10px] border",
                          f.acknowledged
                            ? "border-surface text-muted hover:text-fg"
                            : "border-muted/40 text-muted hover:text-fg hover:border-fg/40",
                        )}
                        title={
                          f.acknowledged
                            ? "Un-acknowledge — flag this again"
                            : "Acknowledge — I know, and I'm living with it"
                        }
                      >
                        {f.acknowledged ? "acknowledged" : "acknowledge"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {health && groups.size === 0 && (
            <p className="text-ok flex items-center gap-1.5">
              <Check size={13} />
              {ackedCount > 0
                ? "Nothing unacknowledged — every known problem has been accepted."
                : "Every file in the library plays."}
            </p>
          )}

          {ackedCount > 0 && (
            <button
              onClick={() => setShowAcked((v) => !v)}
              className="mt-2 text-[11px] text-muted hover:text-fg"
            >
              {showAcked ? "hide" : "show"} {ackedCount} acknowledged
            </button>
          )}

          <p className="mt-4 pt-3 border-t border-surface/60 text-[11px]
                        text-muted leading-relaxed">
            nplay never deletes library files. Both problems above are fixable
            rather than disposable — and anything already published to Nostr is
            tracked by <span className="text-fg/70">ndisc</span>, which is where
            a destructive operation would have to live so it could refuse to
            touch a published release.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: string;
  tone?: "accent" | "warn";
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          "font-mono",
          tone === "warn" ? "text-warn" : "text-accent",
        )}
      >
        {value}
      </span>
    </span>
  );
}

// Collapsed path list — the counts are the message; the paths are for when you
// want to know exactly which files, without flooding the dialog.
function Paths({ label, paths }: { label: string; paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] text-muted hover:text-fg">
        {paths.length} {label}
      </summary>
      <ul className="mt-1 max-h-40 overflow-y-auto font-mono text-[10px] text-muted">
        {paths.map((p) => (
          <li key={p} className="truncate py-0.5">
            {p}
          </li>
        ))}
      </ul>
    </details>
  );
}
