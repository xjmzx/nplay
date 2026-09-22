// Search-key normalisation.
//
// Tag values arrive in whichever Unicode normalisation the tagger wrote. A
// title stored NFD (`Começo` as `o` + U+0327) is a different string from the
// NFC form a keyboard produces, though they render identically — so a plain
// `includes()` finds nothing and the track is effectively invisible to search.
//
// The scanner now stores NFC (see `tag_text` in src-tauri), but old rows keep
// whatever was ingested until a rescan, and filenames are never normalised on
// purpose. So both sides of every comparison are folded here instead of
// relying on the stored form.
//
// NFC, not NFKC: this is for matching text the user typed against text they
// can see, and compatibility folding (µ → μ, ﬁ → fi) belongs to a different
// problem — see ndisc's schema/identity-normalisation-design-2026-09-22.md.
export function searchKey(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

/** True when `haystack` contains `needle`, both normalised first. */
export function matches(haystack: string, needle: string): boolean {
  return searchKey(haystack).includes(needle);
}
