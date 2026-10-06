import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import { getProfile, isGuestSession } from "./lib/db";

/**
 * Star ratings, one per finished ride.
 *
 * A rating is about the rider, not about the trip, so it lives in its own table
 * keyed by both. That is what makes "average 4.6 over 210 trips" a question the
 * console can ask without walking every ride, and what makes it possible to
 * leave the rating out of a cancelled trip without a special case.
 */

const MIN_SCORE = 1;
const MAX_SCORE = 5;
const MAX_COMMENT = 300;

/** Longest comment kept. A paragraph, not an essay, and not a place for a number. */
export { MAX_COMMENT, MAX_SCORE, MIN_SCORE };

/**
 * Rate the rider on a ride that has finished.
 *
 * Only the commuter rates, and only the rider on their own ride — a rider cannot
 * rate a commuter, and nobody can rate a trip that has not happened yet, which
 * is what stops a rating being left about a ride that is still looking for
 * somebody.
 */
export const rate = mutation({
  args: {
    rideId: v.id("rides"),
    score: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!Number.isFinite(args.score) || !Number.isInteger(args.score)) {
      throw new Error("Pick a rating from 1 to 5 stars.");
    }
    if (args.score < MIN_SCORE || args.score > MAX_SCORE) {
      throw new Error("Pick a rating from 1 to 5 stars.");
    }

    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.commuterId !== userId) {
      throw new Error("Only the passenger can rate this trip.");
    }
    if (!ride.riderId) {
      throw new Error("No rider was assigned to this trip.");
    }
    if (ride.status !== "COMPLETED") {
      throw new Error("You can rate a trip once it is finished.");
    }

    // One rating per trip, and re-rating replaces it rather than stacking: a
    // five-star and a one-star for the same drive is not an average, it is a
    // bug in whatever let both through.
    const existing = await ctx.db
      .query("ratings")
      .withIndex("by_ride", (q) => q.eq("rideId", ride._id))
      .unique();

    const comment = args.comment?.trim().slice(0, MAX_COMMENT) || undefined;
    if (existing) {
      await ctx.db.patch(existing._id, { score: args.score, comment });
      return existing._id;
    }
    return await ctx.db.insert("ratings", {
      rideId: ride._id,
      raterId: userId,
      targetId: ride.riderId,
      score: args.score,
      comment,
      createdAt: Date.now(),
    });
  },
});

/** The rating on a ride, if the passenger has left one. */
export const forRide = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) return null;
    // Both sides can see the score; only the passenger wrote it.
    if (ride.commuterId !== userId && ride.riderId !== userId) return null;
    const rating = await ctx.db
      .query("ratings")
      .withIndex("by_ride", (q) => q.eq("rideId", ride._id))
      .unique();
    if (!rating) return null;
    return { score: rating.score, comment: rating.comment, mine: true };
  },
});

/**
 * A rider's ratings, newest first, for the console and the rider's own screen.
 *
 * That sentence is the access rule, and it used to be only a comment: the query
 * took an arbitrary `riderId` and answered anybody who asked, signed in or not,
 * returning the free text a passenger typed about that rider. Read by the two
 * callers above and nothing else, which is exactly why it has to be enforced
 * here rather than assumed.
 */
export const listForRider = query({
  args: { riderId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (userId !== args.riderId) {
      // A guest session is never the console and never a rider's own screen,
      // so it gets no read of somebody else's record — the same rule
      // `requireAdmin` applies before it even looks at a profile.
      if (await isGuestSession(ctx)) return [];
      const profile = await getProfile(ctx, userId);
      if (profile?.role !== "admin") return [];
    }
    const rows = await ctx.db
      .query("ratings")
      .withIndex("by_target", (q) => q.eq("targetId", args.riderId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
    return rows.map((row) => ({
      _id: row._id,
      rideId: row.rideId,
      score: row.score,
      comment: row.comment ?? null,
      createdAt: row.createdAt,
    }));
  },
});
