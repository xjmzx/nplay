// LRC lyric files, parsed.
//
// The format is one line of text per line of the file, each prefixed with the
// time it is sung: `[01:23.45]words`. Three things real files do that a naive
// parser gets wrong:
//   - a line can carry several stamps (`[00:12.00][01:40.00]chorus`), meaning
//     the same words at each of those times;
//   - headers share the bracket syntax (`[ar:Artist]`, `[offset:+250]`);
//   - "enhanced" files add per-word stamps inside the text (`<00:12.50>`),
//     which are dropped here — this shows lines, not karaoke.
// A file with no stamps at all is plain lyrics and is returned unsynced.

export interface LyricLine {
  /** Seconds into the track; null in an unsynced file. */
  t: number | null;
  text: string;
}

export interface ParsedLyrics {
  synced: boolean;
  lines: LyricLine[];
}

const STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const HEADER = /^\[([a-zA-Z#]+):(.*)\]\s*$/;
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function seconds(min: string, sec: string, frac?: string): number {
  // The fraction is hundredths in most files and milliseconds in some; reading
  // it as a decimal fraction ("5" → .5, "45" → .45, "450" → .45) handles both.
  return Number(min) * 60 + Number(sec) + (frac ? Number(`0.${frac}`) : 0);
}

export function parseLrc(source: string): ParsedLyrics {
  const timed: { t: number; text: string }[] = [];
  const plain: string[] = [];
  let offsetMs = 0;

  for (const raw of source.split(/\r\n|\r|\n/)) {
    let line = raw.trim();

    const stamps: number[] = [];
    for (let m = line.match(STAMP); m; m = line.match(STAMP)) {
      stamps.push(seconds(m[1], m[2], m[3]));
      line = line.slice(m[0].length).trimStart();
    }

    if (stamps.length === 0) {
      const h = line.match(HEADER);
      if (h) {
        // `[offset:+250]` shifts every stamp; positive means lyrics appear
        // sooner. Other headers (ar/ti/al/by/length/re/ve) describe the file.
        if (h[1].toLowerCase() === "offset") offsetMs = Number(h[2]) || 0;
        continue;
      }
      plain.push(line);
      continue;
    }

    const text = line.replace(WORD_STAMP, "").replace(/\s+/g, " ").trim();
    for (const t of stamps) timed.push({ t, text });
  }

  if (timed.length === 0) {
    // Unsynced: keep blank lines (they are the verse breaks) but not a ragged
    // run of them at either end.
    while (plain.length && !plain[0]) plain.shift();
    while (plain.length && !plain[plain.length - 1]) plain.pop();
    return { synced: false, lines: plain.map((text) => ({ t: null, text })) };
  }

  const shift = offsetMs / 1000;
  const lines = timed
    .map(({ t, text }) => ({ t: Math.max(0, t - shift), text }))
    // Stable sort: repeated-stamp choruses land in time order, and lines that
    // share a stamp keep the order the file gave them.
    .sort((a, b) => a.t - b.t);
  return { synced: true, lines };
}

/** Index of the line being sung at `time`, or -1 before the first one. */
export function activeLine(lines: LyricLine[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid].t ?? 0) <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
