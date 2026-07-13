import { useEffect, useRef } from "react";
import { audioSpectrum } from "../lib/tauri";

/**
 * Now-playing spectrum visualiser. The audio is decoded in Rust (rodio,
 * outside the webview), so the FFT is computed there too; we poll the bar
 * magnitudes on a rAF loop and paint them to a canvas — no React re-render
 * per frame.
 *
 * The bar colour is taken from the canvas's own computed `color` (set via the
 * `text-accent` class) so it tracks the suite palette.
 */
export type SpectrumMode =
  /** Audio is running through rodio — poll the real FFT. */
  | "live"
  /** Nothing to analyse: no track loaded, or an mp4 whose audio is decoded by
   *  the webview and never reaches rodio. Runs the idle loop so the panel is
   *  never a dead rectangle — this is also the state it initialises in. */
  | "idle"
  /** Paused with a track loaded: hold the last frame. The signal is suspended,
   *  not absent, so neither an idle shimmer nor a blank canvas would be true. */
  | "hold";

export function Spectrum({ mode }: { mode: SpectrumMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Freeze: leave whatever is painted exactly where it is.
    if (mode === "hold") return;

    let raf = 0;
    let stopped = false;
    let last = 0;
    const accent = getComputedStyle(canvas).color;
    // Derive translucent accents for the axis key from the computed colour
    // (rgb(...) → rgba) so the scale stays on-theme and faint.
    const rgb = accent.match(/\d+/g);
    const tint = (a: number) =>
      rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : accent;

    // Axis key: frequency ticks (X) match the Rust bands (40Hz–16kHz, log),
    // level marks (Y) match the −60..0 dB → 0..1 mapping. Kept sparse.
    const FMIN = 40;
    const FMAX = 16_000;
    const FREQ_TICKS: Array<[number, string]> = [
      [100, "100"],
      [1_000, "1k"],
      [10_000, "10k"],
    ];
    const DB_MARKS = [0, -20, -40];
    const PAD_L = 22;
    const PAD_B = 13;

    const draw = (bars: number[]) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!bars.length) return;

      const plotW = w - PAD_L;
      const plotH = h - PAD_B;
      if (plotW <= 0 || plotH <= 0) return;

      ctx.font = "9px ui-monospace, monospace";

      // --- Y level scale (dB) — faint gridlines + right-aligned labels ------
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const logSpan = Math.log(FMAX / FMIN);
      for (const db of DB_MARKS) {
        const norm = (db + 60) / 60; // matches the Rust −60..0 dB floor
        const y = plotH * (1 - norm);
        ctx.strokeStyle = tint(0.1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_L, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
        ctx.fillStyle = tint(0.5);
        ctx.fillText(String(db), PAD_L - 4, Math.max(5, Math.min(plotH - 1, y)));
      }
      // dB unit, once, top-left.
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = tint(0.4);
      ctx.fillText("dB", 0, 1);

      // --- bars -------------------------------------------------------------
      const gap = 2;
      const bw = (plotW - gap * (bars.length - 1)) / bars.length;
      ctx.fillStyle = accent;
      for (let i = 0; i < bars.length; i++) {
        const v = Math.max(0, Math.min(1, bars[i]));
        const bh = Math.max(1, v * plotH);
        const x = PAD_L + i * (bw + gap);
        const y = plotH - bh;
        const r = Math.min(bw / 2, 2);
        ctx.globalAlpha = 0.35 + 0.65 * v;
        ctx.beginPath();
        ctx.moveTo(x, plotH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + bw - r, y);
        ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
        ctx.lineTo(x + bw, plotH);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // --- X frequency key (Hz) — log-positioned ticks ----------------------
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const [f, label] of FREQ_TICKS) {
        const x = PAD_L + (Math.log(f / FMIN) / logSpan) * plotW;
        ctx.strokeStyle = tint(0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, plotH);
        ctx.lineTo(x + 0.5, plotH + 3);
        ctx.stroke();
        ctx.fillStyle = tint(0.5);
        ctx.fillText(label, x, plotH + 3);
      }
    };

    // A subtle, seamless looping EQ pattern for the no-audio-analysis case:
    // two slow counter-travelling sine waves folded into the 28 bands, kept
    // low (~0.10–0.30) so it reads as an idle shimmer, not live signal.
    const BARS = 28;
    const synth = (t: number): number[] => {
      const s = t / 1000;
      const out = new Array(BARS);
      for (let i = 0; i < BARS; i++) {
        const x = i / (BARS - 1);
        const a = 0.5 + 0.5 * Math.sin(s * 0.9 + x * Math.PI * 2);
        const b = 0.5 + 0.5 * Math.sin(s * 0.6 - x * Math.PI * 3 + 1.3);
        out[i] = 0.1 + 0.2 * (a * 0.6 + b * 0.4);
      }
      return out;
    };

    const tick = (t: number) => {
      if (stopped) return;
      if (t - last >= 33) {
        last = t;
        if (mode === "idle") {
          draw(synth(t));
        } else {
          audioSpectrum()
            // Guarded: a poll still in flight when playback stops would
            // otherwise resolve *after* teardown and paint one last frame of
            // real signal over the idle loop — freezing a still of the audio
            // at the moment we stopped.
            .then((bars) => {
              if (!stopped) draw(bars);
            })
            .catch(() => {});
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [mode]);

  return <canvas ref={canvasRef} className="w-full h-full text-accent" />;
}
