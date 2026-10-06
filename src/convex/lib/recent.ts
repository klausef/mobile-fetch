/**
 * The bookkeeping behind "recent locations", as pure functions.
 *
 * Kept out of the mutation for the same reason `fare.ts` and `geo.ts` are kept
 * out of theirs: ordering, de-duplication and the cap are the three things
 * about a recent list that go subtly wrong — the wrong place slides off the
 * end, or the same market is filed six times under six slightly different
 * addresses — and they are far easier to assert here than through a mutation.
 *
 * Nothing in this file touches the database, so the caller owns the
 * transaction and these stay trivially testable.
 */

/** How many places the list keeps. Small on purpose: it is a shortlist. */
export const MAX_RECENT_PLACES = 6;

/** Longest address stored. A geocoder will happily return a paragraph. */
export const MAX_RECENT_ADDRESS_LENGTH = 120;

/**
 * The identity of a place.
 *
 * The address, not the coordinates: two GPS fixes of the same storefront differ
 * by a few metres, so keying on position files the same place as new every
 * time somebody stands somewhere slightly different.
 */
export function recentKey(address: string): string {
  return address.trim().toLowerCase();
}

/** The stored row for an address, or undefined when it is a place we have not seen. */
export function findRecent<T extends { address: string }>(
  rows: T[],
  address: string,
): T | undefined {
  const key = recentKey(address);
  if (!key) return undefined;
  return rows.find((row) => recentKey(row.address) === key);
}

/** The list as the UI wants it: newest first, capped. Never mutates `rows`. */export function rankRecent<T extends { usedAt: number }>(
  rows: T[],
  limit: number = MAX_RECENT_PLACES,
): T[] {
  return [...rows].sort((a, b) => b.usedAt - a.usedAt).slice(0, limit);
}

/**
 * The rows that no longer fit, least recently used first.
 *
 * Returned rather than deleted so the caller decides when — and so a failed
 * write earlier in the same transaction takes its deletes with it.
 */
export function recentOverflow<T extends { usedAt: number }>(
  rows: T[],
  limit: number = MAX_RECENT_PLACES,
): T[] {
  if (rows.length <= limit) return [];
  return [...rows]
    .sort((a, b) => a.usedAt - b.usedAt)
    .slice(0, rows.length - limit);
}
