# nplay scan — Tier 3: incremental rescan (design)

**Status:** proposed · 2026-07-29
**Depends on:** Tier 1 (off-main-thread `#[tauri::command(async)]`) + Tier 2 (WAL) — both shipped and verified.
**Goal:** make a rescan of an unchanged (or barely-changed) library near-instant, so scan cost scales with *what changed* rather than with library size (~18,891 tracks today).

---

## 1. Problem recap

`scan_library` today is a full **wipe-and-rebuild**:

1. `WalkDir` the music root, collect every media file.
2. `read_meta` **every** file in parallel (rayon) — lofty opens and decodes each audio file's tags + properties. This is the expensive step.
3. Group files into albums by release dir; for each album resolve a cover — including `extract_embedded_cover`, which **opens and decodes an audio file again** for any release with no folder image (e.g. digital releases).
4. `DELETE FROM tracks; DELETE FROM albums;` then re-`INSERT` everything in one transaction.

Every rescan pays the full step-2 + step-3 cost even when nothing changed. On a large library that is seconds of pure, repeated decode work. Tier 1 moved it off the UI thread (no more freeze); Tier 3 stops doing the work at all when it isn't needed.

**What's cheap and stays:** the `WalkDir` enumeration and a `metadata()` stat per file are milliseconds even at 19k files. **What's expensive and must be gated:** `read_meta` (tag/property decode) and `extract_embedded_cover` (image decode/extract).

---

## 2. Unit of incrementality: the **release directory**

Albums are an *aggregate* over a release dir — artist/album/year are `mode_or` over the dir's tracks, the cover is resolved from the dir, multi-disc `CD1/CD2` siblings collapse into the parent (`release_dir()`). The aggregate is only correct when computed from the **whole** dir.

Therefore the incremental unit is the **release dir, not the individual file.** If any file in a release dir changed, we re-read that entire dir (all its tracks) and rebuild that one album. If a dir is unchanged, we touch nothing — no reads, no cover work, its existing `albums`/`tracks` rows stay exactly as they are.

Re-reading a whole 30-track album because one track changed is a non-issue: album-level changes are rare, and it is still ~19k → tens of files. This keeps album-aggregation logic **byte-for-byte identical** to today (always a full-dir read) — the change is purely *which* dirs we read.

Per-file mtime columns were considered and rejected: they'd tell us exactly which file changed, but aggregation needs the whole dir regardless, so finer granularity buys nothing and costs a wider schema.

---

## 3. Change detection: a per-album **content signature**

Add one column to `albums`:

```sql
content_sig INTEGER   -- fingerprint of the release dir's file set at last scan; NULL = unknown (treat dirty)
```

The signature is a 64-bit hash over the release dir's **media *and* image** files (including its disc subdirs), each contributing `(path-relative-to-dir, mtime_secs, size_bytes)`, sorted for determinism.

- **Media** files are included so an added/removed/re-tagged track flips the sig. (Tag writes bump mtime — including ndisc's own file-tag writer, see `[[ndisc-file-tag-write]]` — so retags are caught.)
- **Image** files are included so *cover-only* changes are caught: dropping a `cover.jpg` into a folder whose audio is untouched (exactly the manual step done for the "A Certain Ratio" releases) must mark the dir dirty even though no audio mtime moved. This is the one case a media-only fingerprint would miss, so images are first-class in the sig.

The `WalkDir` pass already visits image files; we simply `stat` them too (a handful per dir) instead of discarding them. No extra `read_dir`.

### Scan algorithm (incremental path)

1. **Walk** (phase `walk`): enumerate media + image files, `stat` each for `(mtime, size)`. Group by `release_dir()` key. Only groups containing ≥1 media file are album candidates. Compute each candidate's `content_sig`.
2. **Diff** (phase `diff`, fast, no decode): load `dir → content_sig` from `albums`.
   - **Dirty** = candidate dir whose computed sig ≠ stored sig, or that has no stored row (new album), or whose stored sig is NULL (post-migration / forced).
   - **Vanished** = stored album dir with no on-disk candidate → delete.
   - **Unchanged** = sig matches → skip entirely.
3. **Read** (phase `read`): `read_meta` only the media files of **dirty** dirs (rayon, as today). Progress `total` is now the dirty-file count, so the bar reflects real remaining work — a no-op rescan flashes straight to done.
4. **Aggregate + covers**: for each dirty dir, build the `AlbumAgg` and resolve its cover exactly as today (`extract_embedded_cover` only ever runs for dirty dirs — unchanged digital releases never re-decode).
5. **Apply** (phase `index`): in a transaction, for each dirty dir `DELETE` its old `albums` row (cascade its `tracks`) and `INSERT` the rebuilt album + tracks with the new `content_sig`; `DELETE` vanished albums. Unchanged albums are never written.
6. Re-`apply_catalogue` (cheap), stamp `last_scanned_at`, emit `done`.

Steps 1–2 are the only cost paid for the unchanged majority.

---

## 4. Interactions with existing behavior

- **BPM carry** — already keyed by **path** (DB + suite store), independent of album/track ids. Unchanged dirs keep their rows (and thus their BPM) untouched; dirty dirs re-insert and re-attach BPM from `prior_bpm` by path exactly as today. No change needed. The one-time "export DB BPM to store" migration stays.
- **Album/track id stability** — today a full rebuild reassigns *all* ids every scan. Incremental **improves** this: unchanged albums keep their ids. New albums append with higher ids regardless of alphabetical position — safe because `list_albums` orders by `artist, year, album` at query time (id order never drives display). Verified.
- **`playable` / `is_video` / codec / props** — all derived inside `read_meta`, so they refresh naturally for dirty dirs and persist for unchanged ones.
- **Catalogue enrichment** — `apply_catalogue` is a keyed `UPDATE ... WHERE dir = ?` over all albums; run it every scan as now (cheap, and it must still pick up a refreshed `catalogue.json` even when no audio changed). Note this means a catalogue-only change (new label in ndisc's export) is *not* gated by `content_sig` — good, it's applied unconditionally post-index.
- **WAL (Tier 2)** — incremental writes are smaller and shorter than a full rebuild, so playback-vs-scan concurrency gets even better. Optionally commit per-batch of dirty dirs.

---

## 5. Escape hatch: forced full rebuild

Keep an explicit **full rebuild** that ignores `content_sig` and re-reads everything, for: post-schema-change, a suspected-stale index, or the rare in-place edit that preserved mtime+size (some tag writers restore mtime — the standard rsync-style caveat of mtime+size detection; a full byte hash would be robust but far too expensive to be the default).

Surface it as a distinct action — e.g. **Scan** = incremental, and a **"Full rebuild"** item (menu, or modifier-click) that calls `scan_library(force: true)`. Implementation: add a `force: bool` param; `force` treats every candidate dir as dirty.

---

## 6. Migration

- `ALTER TABLE albums ADD COLUMN content_sig INTEGER` in `open()` (same `let _ =` idempotent pattern as the existing migrations).
- Existing rows have `content_sig = NULL` → every dir reads as dirty on the **first** incremental scan after upgrade → a one-time full re-read that populates all sigs. Every scan after that is incremental. No data migration, no user action.

---

## 7. Progress / UX

New phase sequence: `walk` (found N) → `diff` (quick) → `read` (M dirty of N, M ≪ N normally) → `index` → `done`. The header narration already renders these live (Tier 1); the win is that `read`'s denominator is now the *dirty* count, so a clean rescan is visibly instant and a small change shows "reading 12 of 18,891" rather than churning all 19k.

---

## 8. Suggested staging

1. **Core skip** — `content_sig` column + walk/stat/diff + read-only-dirty + per-dir replace. This is ~all of the win. (Ship, measure a clean rescan and a one-album-changed rescan.)
2. **Forced-full action** — the `force` param + UI affordance.
3. **Polish** — per-batch commits; optional cover-cache pruning (the embedded-cover cache is keyed by album-dir hash and never pruned — stale entries accumulate; a sweep that removes cache files no album references closes that housekeeping gap).

---

## 9. Open questions for review

1. **Sig hash choice** — a stable `FNV`/`xxhash` over the tuple list vs `DefaultHasher` (not guaranteed stable across std versions; if used, must rehash on toolchain change — prefer an explicit stable hash stored as `i64`).
2. **mtime resolution** — seconds is enough for detection; confirm we read `modified()` (portable) rather than platform ctime.
3. **Symlinked / networked libraries** — `stat` cost per file on a network mount could dominate; if the root is remote, is a full-rebuild-only mode preferable? (Probably fine; note it.)
4. Should **catalogue.json**'s own mtime gate the `apply_catalogue` re-run, or keep it unconditional (current recommendation: unconditional — it's cheap and correctness-first).
