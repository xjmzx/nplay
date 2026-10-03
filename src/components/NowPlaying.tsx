import { useEffect, useState, type RefObject } from "react";
import { Film, Maximize2, MicVocal, Music4 } from "lucide-react";
import { cn } from "../lib/cn";
import {
  fileSrc,
  videoSrc,
  type Album,
  type Track,
  type TrackBpm,
} from "../lib/tauri";

interface NowPlayingProps {
  track: Track | null;
  album: Album | null;
  /** True when the current track is an mp4/m4v that plays with picture. */
  isPlayableVideo: boolean;
  /** Loopback media-server base URL (http://127.0.0.1:<port>). */
  mediaBase: string;
  /** Current app volume (0..1) — applied to the <video> on load. */
  volume: number;
  /** Shared handle so the app transport (header/footer) drives the <video>. */
  elRef: RefObject<HTMLVideoElement | null>;
  /** BPM for the current track (with its source), or null while pending or
   *  undetectable. */
  bpm: TrackBpm | null;
  /** Lay the panel out as one short row — a thumbnail with the captions
   *  beside it. Set while the lyrics panel is open: stacked at full size, the
   *  art and its captions fill the column and leave the lyrics no height. */
  compact?: boolean;
  /** Offered when the track has no lyrics file yet: start one. */
  onAddLyrics?: () => void;
}

// The unified stage: the media square shows album art for audio and the live
// <video> for a picture-playable clip. mp4/m4v stream from the Rust loopback
// server (WebKit2GTK can't play local media over the asset protocol); the
// element is shared up via `elRef` so the app transport drives it. Non-mp4
// video stays rodio audio-only and shows the art/placeholder + a note.
export function NowPlaying({
  track,
  album,
  isPlayableVideo,
  mediaBase,
  volume,
  elRef,
  bpm,
  compact,
  onAddLyrics,
}: NowPlayingProps) {
  const cover = album?.coverPath ?? null;
  const [errored, setErrored] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const showImage = cover && errored !== cover;
  const showVideo = isPlayableVideo && !!mediaBase;
  // A video keeps its full stage — it is the thing being watched.
  const row = !!compact && !showVideo;

  // The art lags `cover` by design: on Stop, `cover` goes null but the last
  // image stays mounted at opacity 0 so it can fade *out* rather than being
  // yanked. It only ever gets replaced by the next cover, never cleared.
  const [shownCover, setShownCover] = useState<string | null>(null);
  const [coverLoaded, setCoverLoaded] = useState(false);
  useEffect(() => {
    if (!cover) return;
    setShownCover(cover);
    setCoverLoaded(false);
  }, [cover]);

  // The format specs read as one group; BPM is a musical fact, not a container
  // fact, so it is kept out of the join and rendered on its own.
  const specs: string[] = [];
  if (track?.codec) specs.push(track.codec);
  if (track?.sampleRate) specs.push(`${(track.sampleRate / 1000).toFixed(1)} kHz`);
  if (track?.bitDepth) specs.push(`${track.bitDepth}-bit`);

  function goFullscreen() {
    try {
      elRef.current?.requestFullscreen?.();
    } catch {
      /* element fullscreen unavailable in this webview — panel view only */
    }
  }

  return (
    <div className={cn("flex gap-3", row ? "flex-row items-center" : "flex-col items-center")}>
      {showVideo ? (
        <div className="group/vid relative w-full aspect-video max-h-[55vh] mx-auto rounded-xl bg-surface/40 border border-surface/60 overflow-hidden shadow-inner">
          {/* object-contain over the grey panel tone: a clip smaller than the
              area (or a non-16:9 aspect) sits centred with the surface filling
              the letterbox/pillarbox rather than hard black. */}
          <video
            key={track!.path}
            ref={elRef}
            src={videoSrc(mediaBase, track!.path)}
            controls
            autoPlay
            onLoadStart={(e) => {
              setVideoError(false);
              e.currentTarget.volume = volume;
            }}
            onError={() => setVideoError(true)}
            className="w-full h-full object-contain"
          />
          <button
            onClick={goFullscreen}
            title="Fullscreen"
            className="absolute top-1.5 right-1.5 p-1 bg-bg/70 text-fg/80 hover:text-accent opacity-0 group-hover/vid:opacity-100 transition-opacity"
          >
            <Maximize2 size={14} />
          </button>
          {videoError && (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] leading-relaxed text-alert bg-bg/85">
              This mp4 won’t decode (non-conforming / unsupported profile).
            </div>
          )}
        </div>
      ) : (
        // The frame is the constant — it holds the panel's shape so stopping
        // never collapses the layout. Everything inside cross-fades over it.
        <div
          className={cn(
            "relative aspect-square bg-surface/40 border border-surface/60 overflow-hidden shadow-inner",
            row ? "w-24 shrink-0 rounded-lg" : "w-full max-w-[18rem] rounded-xl",
          )}
        >
          {/* Glyph = "this release has no cover art", NOT "nothing playing" —
              the caption below already says that, so idle shows a bare frame. */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
              track && !showImage ? "opacity-100" : "opacity-0",
            )}
          >
            {track?.isVideo ? (
              <Film size={row ? 32 : 64} className="text-muted/40" strokeWidth={1.2} />
            ) : (
              <Music4 size={row ? 32 : 64} className="text-muted/40" strokeWidth={1.2} />
            )}
          </div>

          {shownCover && (
            <img
              src={fileSrc(shownCover)}
              alt={album?.album ?? ""}
              onLoad={() => setCoverLoaded(true)}
              onError={() => setErrored(shownCover)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
                showImage && coverLoaded ? "opacity-100" : "opacity-0",
              )}
            />
          )}
        </div>
      )}

      {/* No idle caption: the empty frame says "nothing playing" on its own. */}
      {track && (
        // In the row layout every caption truncates against `min-w-0`, so a
        // long title shortens with an ellipsis instead of pushing the column
        // wider or clipping; the full text stays in each line's tooltip.
        <div className={cn(row ? "min-w-0 flex-1 text-left" : "w-full text-center px-1")}>
          <div className="font-medium text-fg truncate" title={track.title}>
            {track.title}
          </div>
          <div className="text-sm text-fg/70 truncate" title={album?.artist}>
            {album?.artist ?? ""}
          </div>
          <div
            className="text-[13px] text-fg/65 truncate"
            title={album ? `${album.album}${album.year != null ? ` · ${album.year}` : ""}` : undefined}
          >
            {album?.album}
            {album?.year != null ? ` · ${album.year}` : ""}
          </div>
          {/* Technical detail. Deliberately louder than it was — this is the
              stuff you actually interrogate a track for, and at 11px/55% it was
              quieter than the release year above it. The specs stay one group;
              BPM is set apart because it is a musical fact rather than a
              container fact, and it's the one value here a human can assert
              (mauve = the suite's BPM colour, matching nsmpl's BPM chip). */}
          {(specs.length > 0 || bpm != null) && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 font-medium tabular-nums",
                row ? "mt-1 justify-start text-xs" : "mt-2.5 justify-center text-[13px] gap-y-1.5",
              )}
            >
              {specs.map((s, i) => (
                <span key={s} className="flex items-center gap-x-2">
                  {i > 0 && <span className="text-muted/50">·</span>}
                  <span className="text-fg/80">{s}</span>
                </span>
              ))}
              {/* A detected BPM is a *guess* — aubio has a known octave-error
                  problem (half/double tempo) — so it is marked `?` and shown
                  muted. A human-asserted one (nsmpl's bar-derived `bars`, or a
                  tap) is ground truth and reads in full mauve. The number alone
                  would flatten that distinction, which is the whole reason the
                  suite tracks a source at all. */}
              {bpm != null &&
                (() => {
                  const guess = bpm.source === "aubio";
                  return (
                    <span
                      title={
                        guess
                          ? `${bpm.bpm} BPM — detected by aubio, so treat it as a guess (it commonly locks onto half or double the real tempo). Cut a loop in nsmpl and pin the bar count to replace it with an exact figure.`
                          : `${bpm.bpm} BPM — asserted by you (${bpm.source}), not detected. aubio can never overwrite this.`
                      }
                      className={cn(
                        "px-1.5 py-0.5",
                        guess
                          ? "bg-mauve/10 text-mauve/70"
                          : "bg-mauve/15 text-mauve",
                      )}
                    >
                      {bpm.bpm}
                      {guess && <span className="text-muted/80">?</span>}
                      <span
                        className={cn(
                          "ml-1 text-[10px]",
                          guess ? "text-mauve/50" : "text-mauve/70",
                        )}
                      >
                        BPM
                      </span>
                    </span>
                  );
                })()}
            </div>
          )}
          {onAddLyrics && (
            <button
              onClick={onAddLyrics}
              title="Add lyrics for this track — saved as a .lrc file beside it"
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted/70 hover:text-accent transition-colors"
            >
              <MicVocal size={12} /> add lyrics
            </button>
          )}
          {track.isVideo && !showVideo && (
            <div className="mt-1.5 text-[11px] text-muted/70">
              Audio only — convert to mp4 for picture.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
