import { Loader2, Radio } from "lucide-react";
import { cn } from "../lib/cn";
import { useFeed } from "../hooks/useFeed";
import { OWNER_PUBKEY } from "../lib/feed";

// `current` — a READ-ONLY view of the owner's feed-note channel (kind:31239),
// the same channel ndisc authors and ndisc.view / glmps read. nplay has no
// Nostr identity, so it only subscribes (consumer-only) and renders notes; the
// trust gate is the shared lib/feed.ts resolveFeed.

const fmtDate = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export function CurrentView({ active }: { active: boolean }) {
  const { notes, loading } = useFeed(OWNER_PUBKEY, active);

  return (
    <div className="rounded-xl bg-panel border border-surface/60 shadow-md flex flex-col min-h-0 h-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 shrink-0 border-b border-surface/60 text-xs">
        <span className="inline-flex items-center gap-1.5 text-accent font-medium uppercase tracking-wide shrink-0">
          <Radio size={14} /> Current
        </span>
        <span className="text-muted">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </span>
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-muted/70 ml-auto">
            <Loader2 size={12} className="animate-spin" /> reading relays…
          </span>
        )}
        <span className={cn("text-muted/50", loading ? "" : "ml-auto")}>
          read-only feed
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {notes.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">
            {loading ? "connecting to relays…" : "No feed notes on the wire yet."}
          </div>
        ) : (
          notes.map((n) => (
            <article
              key={n.address}
              className="flex gap-3 px-4 py-3 border-b border-surface/40"
            >
              {n.images[0] && (
                <img
                  src={n.images[0]}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  className="w-16 h-16 rounded object-cover bg-bg/60 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-medium text-fg/90 truncate min-w-0">
                    {n.title || "untitled"}
                  </h3>
                  <span className="text-[11px] text-muted tabular-nums shrink-0 ml-auto">
                    {fmtDate(n.publishedAt)}
                  </span>
                </div>
                {n.body && (
                  <p className="mt-1 text-[13px] text-fg/70 leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {n.body}
                  </p>
                )}
                {(n.topics.length > 0 || n.provenance !== "owner") && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {n.topics.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 bg-digital/15 text-digital"
                      >
                        {t}
                      </span>
                    ))}
                    {n.provenance !== "owner" && (
                      <span className="text-[10px] text-mauve/80">
                        {n.provenance}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
