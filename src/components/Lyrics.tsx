import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "../lib/cn";
import { activeLine, parseLrc } from "../lib/lrc";

interface LyricsProps {
  /** Raw sidecar text (.lrc or plain). */
  text: string;
  /** Playback position in seconds. */
  currentTime: number;
  onSeek: (t: number) => void;
  onEdit: () => void;
}

/** How long a manual scroll holds off the follow-along, in ms. */
const HANDS_OFF_MS = 4000;

// The lyrics for the playing track. A synced file (.lrc with time stamps)
// follows playback: the current line is lit and kept in the middle of the
// panel, and clicking any line seeks to it. A plain file is just shown.
export function Lyrics({ text, currentTime, onSeek, onEdit }: LyricsProps) {
  const parsed = useMemo(() => parseLrc(text), [text]);
  const active = parsed.synced ? activeLine(parsed.lines, currentTime) : -1;

  const boxRef = useRef<HTMLDivElement>(null);
  const touchedAt = useRef(0);

  // A new file starts at the top.
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = 0;
    touchedAt.current = 0;
  }, [text]);

  // Follow the current line — unless the reader has just scrolled away to look
  // at something, in which case leave them there for a few seconds.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || active < 0) return;
    if (Date.now() - touchedAt.current < HANDS_OFF_MS) return;
    const el = box.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    // Centre it by hand: scrollIntoView would also scroll every ancestor.
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [active]);

  const touched = () => {
    touchedAt.current = Date.now();
  };

  return (
    <div className="group/lyr relative flex-1 min-h-0 flex flex-col">
      <button
        onClick={onEdit}
        title="Edit these lyrics"
        className="absolute top-0 left-0 z-10 p-1 bg-panel/80 text-muted hover:text-accent opacity-0 group-hover/lyr:opacity-100 transition-opacity"
      >
        <Pencil size={13} />
      </button>
    <div
      ref={boxRef}
      onWheel={touched}
      onTouchMove={touched}
      className="relative flex-1 min-h-0 overflow-y-auto pr-1 text-center leading-relaxed"
    >
      {/* The opening and closing lines sit at the top and bottom edges rather
          than being padded out to reach the middle: a song starts at the top
          of its lyric sheet. */}
      <div className="py-2">
        {parsed.lines.map((l, i) =>
          parsed.synced ? (
            <button
              key={i}
              data-line={i}
              onClick={() => {
                touchedAt.current = 0;
                onSeek(l.t ?? 0);
              }}
              title="Jump to this line"
              className={cn(
                "block w-full px-2 py-1 transition-colors duration-300",
                i === active
                  ? "text-accent font-medium"
                  : i < active
                    ? "text-muted/60 hover:text-fg/80"
                    : "text-fg/70 hover:text-fg",
              )}
            >
              {/* An instrumental gap is a stamped empty line. */}
              {l.text || "·"}
            </button>
          ) : (
            <p key={i} className={cn("px-2 text-fg/80", l.text ? "py-0.5" : "h-4")}>
              {l.text}
            </p>
          ),
        )}
      </div>
    </div>
    </div>
  );
}

interface LyricsEditorProps {
  /** The track being written for — shown so it is clear whose lyrics these
   *  are if playback has moved on while typing. */
  trackTitle: string;
  initial: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}

// Type or paste lyrics for a track. Saving writes a `.lrc` beside the track
// with the same name — no need to go and find the release folder. Plain text
// is fine; lines stamped `[mm:ss.xx]` make it follow playback.
export function LyricsEditor({ trackTitle, initial, onSave, onCancel }: LyricsEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="text-xs text-muted truncate" title={trackTitle}>
        Lyrics for <span className="text-fg/80">{trackTitle}</span>
      </div>
      <textarea
        ref={areaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
        spellCheck={false}
        placeholder={"Paste or type the lyrics.\n\nPlain text is fine. Lines stamped like\n[01:23.45]words\nfollow along with playback."}
        className="flex-1 min-h-0 w-full resize-none bg-surface/60 p-2 text-sm leading-relaxed text-fg placeholder:text-muted/60 outline-none focus:ring-1 focus:ring-accent/50"
      />
      {error && <div className="text-xs text-alert">{error}</div>}
      <div className="flex items-center justify-end gap-2 text-xs">
        <button onClick={onCancel} disabled={busy} className="px-2 py-1 text-muted hover:text-fg">
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={busy || !draft.trim()}
          title="Save beside the track  (Ctrl+S)"
          className="px-2.5 py-1 bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}
