import {
  DocumentData,
  onSnapshot,
  Query,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

/**
 * Shared live Firestore listeners — the portal's data layer.
 *
 * Why not one-shot getDocs? Because online, getDocs ALWAYS waits for a server
 * round trip (the IndexedDB cache never short-circuits it), and the UI only
 * knows what the last manual fetch returned — so removals looked "stuck"
 * until a hard refresh.
 *
 * onSnapshot fixes both at once:
 *  - first emission is served from the local cache instantly, then the server
 *    catch-up streams in behind it;
 *  - our own writes (removes, approvals, adds) reflect IMMEDIATELY via
 *    latency compensation — no refresh() calls anywhere;
 *  - anything changed by others (a tradie accepting a job, a tenant
 *    confirming) appears live without any user action.
 *
 * Listeners are kept warm in a keyed registry for the whole session, so
 * navigating back to a page renders the latest data with zero loading state.
 * Each portal account only opens a handful of narrow, account-scoped queries,
 * so the standing-listener cost is negligible.
 */

interface Entry {
  data: unknown[] | null;
  listeners: Set<(d: unknown[]) => void>;
  unsubscribe: () => void;
}

const registry = new Map<string, Entry>();

export function useLive<T>(
  key: string,
  makeQuery: () => Query<DocumentData>,
  fromDoc: (d: QueryDocumentSnapshot<DocumentData>) => T = (d) => d.data() as T,
): T[] | null {
  const [data, setData] = useState<T[] | null>(
    () => (registry.get(key)?.data as T[] | null) ?? null,
  );

  useEffect(() => {
    let entry = registry.get(key);
    if (!entry) {
      const e: Entry = { data: null, listeners: new Set(), unsubscribe: () => {} };
      registry.set(key, e);
      e.unsubscribe = onSnapshot(
        makeQuery(),
        (snap) => {
          e.data = snap.docs.map((d) => fromDoc(d));
          for (const l of e.listeners) l(e.data);
        },
        () => {
          // Permission/network error: fail to an empty list rather than an
          // eternal spinner; a retry happens naturally on next mount.
          registry.delete(key);
          e.data = e.data ?? [];
          for (const l of e.listeners) l(e.data);
        },
      );
      entry = e;
    }
    const listener = (d: unknown[]) => setData(d as T[]);
    entry.listeners.add(listener);
    setData((entry.data as T[] | null) ?? null);
    return () => {
      entry.listeners.delete(listener);
    };
    // makeQuery/fromDoc intentionally excluded — `key` fully identifies the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}
