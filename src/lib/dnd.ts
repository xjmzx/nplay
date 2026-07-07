import type { Track } from "./tauri";

/** Custom MIME for dragging Collection items onto the Playlist. Kept distinct
 *  from the Playlist's internal row-reorder drag (which uses component state,
 *  not a dataTransfer payload) so the two never collide. */
export const COLLECTION_DND = "application/x-nplay-collection";

/** Payload carried on a Collection → Playlist drag. Albums travel by id
 *  (their tracks are resolved on drop); a single track travels whole. */
export type CollectionDrag =
  | { kind: "album"; albumId: number }
  | { kind: "track"; track: Track };
