import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { isValidLatLng } from "./lib/geo";
import {
  findRecent,
  MAX_RECENT_ADDRESS_LENGTH,
  rankRecent,
  recentOverflow,
} from "./lib/recent";

/**
 * Recent locations: the places a commuter has actually booked, offered back to
 * them as a shortcut.
 *
 * Kept deliberately small. This is not a history — the receipt list already
 * does history, with fares and timestamps — it is the short list of places
 * somebody is likely to want again, on the screen where retyping an address is
 * the friction.
 */

/**
 * Record a place the commuter just booked.
 *
 * Exported as a plain function rather than only as a mutation so the booking
 * path can record both ends in the same transaction as the ride. If it were a
 * separate client call, a client that crashed between the two would leave the
 * ride in the database and the place missing from the list — a small bug, but a
 * permanently inconsistent one.
 *
 * Returns quietly on anything unusable. A convenience list is never a reason to
 * fail a booking, so this cannot throw.
 */
export async function rememberRecent(
  ctx: MutationCtx,
  userId: Id<"users">,
  point: { lat: number; lng: number; address?: string },
): Promise<void> {
  const address = (point.address ?? "")
    .trim()
    .slice(0, MAX_RECENT_ADDRESS_LENGTH);
  if (!address || !isValidLatLng(point)) return;

  const rows = await ctx.db
    .query("recentPlaces")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const match = findRecent(rows, address);
  const now = Date.now();

  if (match) {
    await ctx.db.patch(match._id, {
      lat: point.lat,
      lng: point.lng,
      uses: match.uses + 1,
      usedAt: now,
    });
  } else {
    await ctx.db.insert("recentPlaces", {
      userId,
      address,
      lat: point.lat,
      lng: point.lng,
      uses: 1,
      usedAt: now,
    });
  }

  // Trim the tail — least recently used first — so the list stays a shortcut
  // and the table stays bounded on an account that books every day.
  const all = await ctx.db
    .query("recentPlaces")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of recentOverflow(all)) await ctx.db.delete(row._id);
}

/** The commuter's recent places, newest first. */
export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("recentPlaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rankRecent(rows).map((row) => ({
        _id: row._id,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
      }));
  },
});
