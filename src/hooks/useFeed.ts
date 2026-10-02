import { useEffect, useRef, useState } from "react";
import { SimplePool, type Event as NostrEvent } from "nostr-tools";
import {
  APPROVAL_KIND,
  FEED_KIND,
  REGISTRY_KIND,
  resolveFeed,
  type FeedNote,
} from "../lib/feed";

// nplay is a READ-ONLY consumer of the owner's feed-note channel — it has no
// Nostr identity and never publishes. Fixed relay set (the suite default); no
// relay-config UI here. The parse + trust-gate maths is the shared template
// (lib/feed.ts), identical to ndisc / ndisc.view / glmps.
const RELAYS = [
  "wss://relay.fizx.uk",
  "wss://relay.nfunc.xyz",
];

export interface FeedState {
  notes: FeedNote[];
  loading: boolean;
}

/** Subscribe to the owner's kind:31239 channel (+ 30000 registry / 4550
 *  sign-offs / 5 deletes) and run the shared trust gate. `active` gates the
 *  subscription so relays are only touched while the Current view is open. */
export function useFeed(
  ownerHex: string | undefined,
  active: boolean,
): FeedState {
  const [notes, setNotes] = useState<FeedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const byKeyRef = useRef<Map<string, NostrEvent>>(new Map());

  useEffect(() => {
    if (!active || !ownerHex) {
      setLoading(false);
      return;
    }
    byKeyRef.current = new Map();
    setNotes([]);
    setLoading(true);

    const pool = new SimplePool();
    const byKey = byKeyRef.current;
    const recompute = () => setNotes(resolveFeed([...byKey.values()], ownerHex));

    const sub = pool.subscribeMany(
      RELAYS,
      { kinds: [FEED_KIND, REGISTRY_KIND, APPROVAL_KIND, 5], authors: [ownerHex] },
      {
        onevent(ev) {
          // Replaceable kinds key by address; regular events (4550, 5) by id.
          const dTag = ev.tags.find((t) => t[0] === "d")?.[1];
          const key =
            ev.kind === FEED_KIND || ev.kind === REGISTRY_KIND
              ? `${ev.kind}:${ev.pubkey}:${dTag ?? ""}`
              : ev.id;
          const prev = byKey.get(key);
          if (!prev || ev.created_at > prev.created_at) {
            byKey.set(key, ev);
            recompute();
          }
        },
        oneose() {
          setLoading(false);
        },
      },
    );

    // Stop the spinner even if no relay answers.
    const t = setTimeout(() => setLoading(false), 5000);

    return () => {
      clearTimeout(t);
      sub.close();
      pool.close(RELAYS);
    };
  }, [ownerHex, active]);

  return { notes, loading };
}
