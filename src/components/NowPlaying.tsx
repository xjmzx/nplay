import { useEffect, useState, type RefObject } from "react";
import { Film, Maximize2, Music4 } from "lucide-react";
import { cn } from "../lib/cn";
import { fileSrc, videoSrc, type Album, type Track } from "../lib/tauri";

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
  /** Detected BPM for the current track, or null while pending/unknown. */
  bpm: number | null;
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
}: NowPlayingProps) {
  const cover = album?.coverPath ?? null;
  const [errored, setErrored] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const showImage = cover && errored !== cover;
  const showVideo = isPlayableVideo && !!mediaBase;

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

  const meta: string[] = [];
  if (track?.codec) meta.push(track.codec);
  if (track?.sampleRate) meta.push(`${(track.sampleRate / 1000).toFixed(1)} kHz`);
  if (track?.bitDepth) meta.push(`${track.bitDepth}-bit`);
  if (bpm != null) meta.push(`${bpm} BPM`);

  function goFullscreen() {
    try {
      elRef.current?.requestFullscreen?.();
    } catch {
      /* element fullscreen unavailable in this webview — panel view only */
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
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
        <div className="relative w-full max-w-[18rem] aspect-square rounded-xl bg-surface/40 border border-surface/60 overflow-hidden shadow-inner">
          {/* Glyph = "this release has no cover art", NOT "nothing playing" —
              the caption below already says that, so idle shows a bare frame. */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
              track && !showImage ? "opacity-100" : "opacity-0",
            )}
          >
            {track?.isVideo ? (
              <Film size={64} className="text-muted/40" strokeWidth={1.2} />
            ) : (
              <Music4 size={64} className="text-muted/40" strokeWidth={1.2} />
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
        <div className="w-full text-center px-1">
          <div className="font-medium text-fg truncate" title={track.title}>
            {track.title}
          </div>
          <div className="text-sm text-fg/70 truncate" title={album?.artist}>
            {album?.artist ?? ""}
          </div>
          <div className="text-[13px] text-fg/65 truncate">
            {album?.album}
            {album?.year != null ? ` · ${album.year}` : ""}
          </div>
          {meta.length > 0 && (
            <div className="mt-1 text-[11px] text-fg/55 tabular-nums">
              {meta.join("  ·  ")}
            </div>
          )}
          {track.isVideo && !showVideo && (
            <div className="mt-1 text-[11px] text-muted/70">
              Audio only — convert to mp4 for picture.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
