# Suite-shared BPM store — v1

`~/.local/share/ndisc-suite/bpm.json`

A **suite-shared document**, sitting beside ndisc's `published.json` in the same
`ndisc-suite` dir. It is not app data: the entire point is that the other apps
can read it.

## Why it exists

nplay's `tracks.bpm` column is a **cache**. The `tracks` table is wiped and
rebuilt on every scan, and it is keyed by absolute path. But a BPM is expensive
to earn — an `aubio tempo` subprocess per track, accruing over months of
listening — and once a human has tapped one it is a *fact about the recording*,
not about this machine's index. It deserves to outlive the index.

Three things follow from putting it here rather than in the DB:

- It survives a wipe-and-rebuild, and a lost `library.db` entirely.
- **nsmpl** can read it (BPM detection is already in its backlog) without
  coupling to nplay's schema.
- **ndisc** can later read it and make BPM *portable* by folding it into the
  files themselves — ndisc is the app that already writes tags, and the one that
  knows publish state. nplay deliberately does not write to library files.

## Shape

```json
{
  "version": 1,
  "generatedAt": 1752451200,
  "roots": { "music": "/data/music" },
  "entries": {
    "music": {
      "Artist/Album/01 - Track.flac": {
        "bpm": 128.0,
        "source": "aubio",
        "at": 1752451200
      }
    }
  }
}
```

- **Identity is `(root, relpath)`**, per the suite's terrain/roots model — never
  an absolute path, and never a DB id. `roots` records the absolute path each
  named root resolved to, so a consumer whose root differs can still rebuild
  absolute paths. A file outside the root has no stable identity here and is
  simply not representable — writers skip it rather than invent a key.
- `music` is the canonical root name for the audio library.
- `source` is `aubio` (detected) or `tap` (confirmed by a human).

## Rules for writers

1. **`tap` outranks `aubio`, always.** A detection must never silently overwrite
   a hand-tapped value. aubio has a known octave-error problem (half/double
   tempo), so a human tap is ground truth and a detection is a guess.
2. **Write atomically** (temp file + rename). Other apps read this; a crash
   mid-write must not leave a half-written document behind.
3. **Batch.** Read-modify-write per track would be quadratic across a
   library-sized backfill.
4. **Best-effort.** A store failure must never break playback, a scan, or a
   publish. The DB cache still works without it.

## Rules for readers

- A **missing file is the normal cold state**, not an error — treat it as empty.
- A corrupt file should be treated as empty rather than fatal; the next write
  rebuilds it.
- Unknown fields must be ignored, so v1 readers survive a v2 writer.

## Not in scope for v1

Publishing BPM to Nostr. `release.v2` is a frozen contract and "musical values"
is a logged backlog item — adding BPM to the wire is a **contract change** and
needs a coordinated suite wave, not a unilateral field.
