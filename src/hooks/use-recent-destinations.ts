/**
 * The last few destinations this commuter picked, kept on the device.
 *
 * ── Why local storage rather than the server ────────────────────────────────
 * There is already a server-side recent-places list (`recentPlaces.ts`), and it
 * is the better answer for one thing: a commuter who books the same trip on
 * Monday and again on Tuesday should see the market on both. So why a second
 * list?
 *
 * Because this one has to be there *before* the request exists. The server list
 * is written inside the booking transaction, so a commuter who abandons the
 * booking after typing the destination gets nothing — and abandoning is the
 * common case while they are still learning where things are. The on-device
 * list records the moment a destination is chosen, so the second attempt starts
 * from where the first one got to.
 *
 * It is also what makes search feel instant. Reading the history is synchronous
 * and local, so the "Recent" chips are on screen in the same paint as the search
 * box rather than arriving after a round trip.
 *
 * The two lists are not kept in sync, deliberately: one is "places I have
 * booked", the other is "places I was looking at a moment ago". Merging them
 * would mean clearing your recent list to clear your history, which is the wrong
 * answer to either question.
 *
 * ── Failure is expected here ───────────────────────────────────────────────
 * Private browsing makes `localStorage.setItem` throw on some browsers, and the
 * value can be anything a previous build or a curious person wrote. Reading is
 * wrapped and every unparseable row is dropped individually — a history is a
 * convenience, and losing it must never take the booking screen down with it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_LOCAL_RECENTS,
  parseRecentDestinations,
  rankDestinations,
  rememberDestination,
  type RecentDestination,
} from "@/lib/search";

/** Where the list lives. Versioned so a future shape change cannot misread it. */
const STORAGE_KEY = "fetch.recentDestinations.v1";

function read(): RecentDestination[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return parseRecentDestinations(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function write(rows: RecentDestination[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Quota exceeded or a browser that refuses writes. The list is a
    // convenience, so the in-memory copy stands for this session and the app
    // carries on.
  }
}

export interface RecentDestinations {
  /** Newest first, already capped. */
  rows: RecentDestination[];
  /** Records a destination as just used. */
  remember: (entry: Omit<RecentDestination, "usedAt">) => void;
  /** Empties the list, for the "Clear" control. */
  clear: () => void;
}

export function useRecentDestinations(): RecentDestinations {
  // Read once, on mount. Re-reading on every render would be a storage hit per
  // keystroke in the search box, which is exactly the lag this feature exists
  // to remove.
  const [rows, setRows] = useState<RecentDestination[]>(read);

  /**
   * The current list, readable from a callback.
   *
   * The obvious implementation computes the next list inside the `setRows`
   * updater and writes storage there. That updater is not supposed to have side
   * effects — React is free to call it twice in StrictMode, and a `Date.now()`
   * and a storage write inside it make the list depend on *how many times* it
   * ran rather than on the data. So the next list is computed in the handler,
   * where it is pure, and this ref is what gives the handler the current value.
   */
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const remember = useCallback(
    (entry: Omit<RecentDestination, "usedAt">) => {
      // `now` is read here rather than inside an updater, so "newest first" is a
      // property of the data and not of the clock.
      const next = rankDestinations(
        rememberDestination(rowsRef.current, { ...entry, usedAt: Date.now() }),
        MAX_LOCAL_RECENTS,
      );
      // Updated before the render, so two remembers in the same tick both see
      // the first one's result instead of racing on a stale list.
      rowsRef.current = next;
      setRows(next);
      write(next);
    },
    [],
  );

  const clear = useCallback(() => {
    setRows([]);
    write([]);
  }, []);

  return { rows, remember, clear };
}