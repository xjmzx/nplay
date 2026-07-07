import { useState, type RefObject } from "react";
import { Film, Maximize2, Music4 } from "lucide-react";
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
}: NowPlayingProps) {
  const cover = album?.coverPath ?? null;
  const [errored, setErrored] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const showImage = cover && errored !== cover;
  const showVideo = isPlayableVideo && !!mediaBase;

  const meta: string[] = [];
  if (track?.codec) meta.push(track.codec);
  if (track?.sampleRate) meta.push(`${(track.sampleRate / 1000).toFixed(1)} kHz`);
  if (track?.bitDepth) meta.push(`${track.bitDepth}-bit`);

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
        <div className="group/vid relative w-full aspect-video rounded-xl bg-black overflow-hidden">
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
            className="w-full h-full object-contain bg-black"
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
        <div className="w-full aspect-square rounded-xl bg-surface/40 border border-surface/60 overflow-hidden flex items-center justify-center shadow-inner">
          {showImage ? (
            <img
              src={fileSrc(cover)}
              alt={album?.album ?? ""}
              className="w-full h-full object-cover"
              onError={() => setErrored(cover)}
            />
          ) : track?.isVideo ? (
            <Film size={64} className="text-muted/40" strokeWidth={1.2} />
          ) : (
            <Music4 size={64} className="text-muted/40" strokeWidth={1.2} />
          )}
        </div>
      )}

      {track ? (
        <div className="w-full text-center px-1">
          <div className="font-medium text-fg truncate" title={track.title}>
            {track.title}
          </div>
          <div className="text-sm text-fg/70 truncate" title={album?.artist}>
            {album?.artist ?? ""}
          </div>
          <div className="text-[13px] text-muted truncate">
            {album?.album}
            {album?.year != null ? ` · ${album.year}` : ""}
          </div>
          {meta.length > 0 && (
            <div className="mt-1 text-[11px] text-muted/80 tabular-nums">
              {meta.join("  ·  ")}
            </div>
          )}
          {track.isVideo && !showVideo && (
            <div className="mt-1 text-[11px] text-muted/70">
              Audio only — convert to mp4 for picture.
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted">Nothing playing</div>
      )}
    </div>
  );
}
