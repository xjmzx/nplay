import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/cn";

// Home's cover-size switch. Same three icons, order and accent → mauve resting
// tint as ndisc's ViewToggle (itself glmps's), minus ndisc's list mode: Home
// has no list of its own, the Collection is beside it.
export type HomeSize = "lg" | "md" | "sm";

const STORAGE_KEY = "nplay.homeSize";

export function readHomeSize(): HomeSize {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "lg" || v === "md" || v === "sm") return v;
  } catch {
    /* storage unavailable */
  }
  return "lg";
}

export function saveHomeSize(v: HomeSize) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* storage unavailable */
  }
}

const restColor = (i: number): string =>
  `color-mix(in oklch, rgb(var(--c-accent)), rgb(var(--c-mauve)) ${(i / 2) * 100}%)`;

const OPTIONS: { v: HomeSize; label: string; icon: ReactNode }[] = [
  {
    v: "lg",
    label: "Large covers",
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
        <rect x="1" y="1" width="4" height="4" rx="0.5" />
        <rect x="7" y="1" width="4" height="4" rx="0.5" />
        <rect x="1" y="7" width="4" height="4" rx="0.5" />
        <rect x="7" y="7" width="4" height="4" rx="0.5" />
      </svg>
    ),
  },
  {
    v: "md",
    label: "Medium covers",
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
        {[0.5, 4.5, 8.5].flatMap((y) =>
          [0.5, 4.5, 8.5].map((x) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="0.3" />
          )),
        )}
      </svg>
    ),
  },
  {
    v: "sm",
    label: "Small covers",
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
        {[0.5, 3.5, 6.5, 9.5].flatMap((y) =>
          [0.5, 3.5, 6.5, 9.5].map((x) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" rx="0.25" />
          )),
        )}
      </svg>
    ),
  },
];

export function HomeSizeToggle({
  value,
  onChange,
}: {
  value: HomeSize;
  onChange: (v: HomeSize) => void;
}) {
  return (
    <div className="inline-flex rounded border border-surface overflow-hidden shrink-0">
      {OPTIONS.map(({ v, label, icon }, i) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            style={{ ["--btn-rest" as string]: restColor(i) } as CSSProperties}
            className={cn(
              "px-2 py-1 transition-colors",
              active
                ? "bg-accent/15 text-accent"
                : "text-[color:var(--btn-rest)] hover:text-fg",
            )}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
