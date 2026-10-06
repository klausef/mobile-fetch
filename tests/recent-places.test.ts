/**
 * The recent-locations list: ordering, de-duplication and the cap.
 *
 * These three are exactly what goes subtly wrong with a recent list, and all
 * three are invisible until somebody notices that their usual destination has
 * quietly disappeared, or that the same market is offered six times. The rules
 * live in `src/convex/lib/recent.ts` as pure functions so they can be asserted
 * here rather than through a mutation.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  findRecent,
  MAX_RECENT_ADDRESS_LENGTH,
  MAX_RECENT_PLACES,
  rankRecent,
  recentKey,
  recentOverflow,
} from "../src/convex/lib/recent.ts";

type Row = {
  _id: string;
  address: string;
  lat: number;
  lng: number;
  uses: number;
  usedAt: number;
};

function row(id: string, address: string, usedAt: number, uses = 1): Row {
  return { _id: id, address, lat: 8.155, lng: 125.13, uses, usedAt };
}

test("the list is a shortlist, not a history", () => {
  expect(MAX_RECENT_PLACES).toBe(6);
  expect(MAX_RECENT_ADDRESS_LENGTH).toBe(120);
});

test("the list comes back newest first", () => {
  const ranked = rankRecent([
    row("a", "Malaybalay Public Market", 10),
    row("b", "Bukidnon State University", 30),
    row("c", "Valencia Terminal", 20),
  ]);
  expect(ranked.map((r) => r._id)).toEqual(["b", "c", "a"]);
});

test("ranking never mutates the rows it was handed", () => {
  // The caller's array is the database result it still has to iterate over.
  const rows = [row("a", "One", 10), row("b", "Two", 30)];
  rankRecent(rows);
  expect(rows.map((r) => r._id)).toEqual(["a", "b"]);
});

test("ranking caps the list at the newest few", () => {
  const rows = Array.from({ length: 9 }, (_, index) =>
    row(`p${index}`, `Place ${index}`, index),
  );
  const ranked = rankRecent(rows);
  expect(ranked).toHaveLength(MAX_RECENT_PLACES);
  // p8 is the most recent, so it heads the list and p0 was never included.
  expect(ranked[0]._id).toBe("p8");
  expect(ranked.map((r) => r._id)).not.toContain("p0");
});

test("an address is matched regardless of case or surrounding space", () => {
  const rows = [row("a", "Public Market, Malaybalay", 10)];
  expect(findRecent(rows, "  public market, MALAYBALAY  ")?._id).toBe("a");
  expect(recentKey("  Banana  ")).toBe("banana");
});

test("the same place re-booked from a different fix is still the same place", () => {
  // Coordinates wobble by a few metres between visits; the address is what
  // identifies the place, so a second visit updates the row rather than
  // adding one.
  const rows = [row("a", "Public Market", 10)];
  const later = { ...rows[0], lat: 8.156, lng: 125.131, usedAt: 99 };
  expect(findRecent([...rows, later], "Public Market")?._id).toBe("a");
});

test("a blank address matches nothing at all", () => {
  // A pin with no resolved address must not silently match whichever place
  // happens to be first — that would move somebody's shortcut to the wrong pin.
  const rows = [row("a", "Public Market", 10), row("b", "", 20)];
  expect(findRecent(rows, "")).toBeUndefined();
  expect(findRecent(rows, "   ")).toBeUndefined();
  expect(findRecent([], "Public Market")).toBeUndefined();
});

test("a list inside the cap sheds nothing", () => {
  const rows = Array.from({ length: MAX_RECENT_PLACES }, (_, i) =>
    row(`p${i}`, `Place ${i}`, i),
  );
  expect(recentOverflow(rows)).toEqual([]);
  expect(recentOverflow([])).toEqual([]);
});

test("an over-full list sheds the least recently used first", () => {
  const rows = [
    row("new", "Newest", 90),
    row("oldest", "Oldest", 10),
    row("old", "Older", 20),
    row("mid", "Middle", 50),
  ];
  const shed = recentOverflow(rows, 2);
  // Two must go, and they are the two that have gone longest unused.
  expect(shed.map((r) => r._id)).toEqual(["oldest", "old"]);
  // The rows themselves are untouched: the caller decides when to delete.
  expect(rows).toHaveLength(4);
});
