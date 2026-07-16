import type { Track } from "./tauri";

/** Custom MIME for dragging Collection items onto the Playlist. Kept distinct
 *  from the Playlist's internal row-reorder drag so the two never collide. */
export const COLLECTION_DND = "application/x-nplay-collection";

/** Custom MIME for the Playlist's internal row-reorder drag. The from-index
 *  travels in component state; this payload exists mainly because WebKit2GTK
 *  (Tauri's Linux webview) won't fire dragover/drop for a drag whose dragstart
 *  never populates the DataTransfer. Distinct from COLLECTION_DND so the
 *  panel's Collection dropzone ignores an internal reorder. */
export const PLAYLIST_DND = "application/x-nplay-playlist-row";

/** Payload carried on a Collection → Playlist drag. Albums travel by id
 *  (their tracks are resolved on drop); a single track travels whole. */
export type CollectionDrag =
  | { kind: "album"; albumId: number }
  | { kind: "track"; track: Track };
