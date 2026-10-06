import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { getProfile } from "./lib/db";
import { MAX_THREAD_MESSAGES, normalizeMessage } from "./lib/chat";

/**
 * Both sides of a ride may read and write its thread. Resolving the ride first
 * is the whole authorisation story here: a commuter or rider id that is not on
 * the ride gets nothing, and a stranger cannot even tell the ride exists.
 */
async function requireParticipant(
  ctx: QueryCtx | MutationCtx,
  rideId: Id<"rides">,
): Promise<{ userId: Id<"users">; ride: Doc<"rides"> }> {
  const userId = await requireUserId(ctx);
  const ride = await ctx.db.get(rideId);
  if (!ride) throw new Error("That ride no longer exists.");
  const doc = ride as Doc<"rides">;
  if (doc.commuterId !== userId && doc.riderId !== userId) {
    throw new Error("You are not part of this ride.");
  }
  return { userId, ride: doc };
}

/** How far back each side of the conversation list looks for rides. */
const THREAD_RIDE_SCAN = 40;

/** Threads handed to the client; the newest activity wins the cut. */
export const MAX_THREADS = 50;

/**
 * The rides this account is on the two sides of, newest first and deduped.
 *
 * One account can be the commuter on one ride and the rider on another, and the
 * same ride turns up in both indexes when the viewer is somehow both — so the
 * union is built once here and shared by the thread list and the unread badge,
 * which must agree on what a thread is.
 */
async function threadRides(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"rides">[]> {
  const [asCommuter, asRider] = await Promise.all([
    ctx.db
      .query("rides")
      .withIndex("by_commuter", (q) => q.eq("commuterId", userId))
      .order("desc")
      .take(THREAD_RIDE_SCAN),
    ctx.db
      .query("rides")
      .withIndex("by_rider", (q) => q.eq("riderId", userId))
      .order("desc")
      .take(THREAD_RIDE_SCAN),
  ]);

  const seen = new Set<Id<"rides">>();
  const rides: Doc<"rides">[] = [];
  for (const ride of [...asCommuter, ...asRider]) {
    if (seen.has(ride._id)) continue;
    seen.add(ride._id);
    rides.push(ride);
  }
  return rides;
}

/** Where this account has read each thread to, keyed by ride. */
async function readMarkers(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Map<Id<"rides">, number>> {
  const rows = await ctx.db
    .query("chatReads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(rows.map((row) => [row.rideId, row.readAt]));
}

/**
 * The thread for a ride, oldest first. Served by a reactive query, so the other
 * side's messages appear without polling or a refresh.
 */
export const listForRide = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const { userId, ride } = await requireParticipant(ctx, args.rideId);

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_ride_time", (q) => q.eq("rideId", args.rideId))
      .order("asc")
      .take(MAX_THREAD_MESSAGES);

    // One profile lookup per distinct sender, not per message. A system line is
    // not a person, so it never costs a lookup.
    const senders = new Set(
      rows
        .filter((row) => (row.kind ?? "user") === "user")
        .map((row) => row.senderId),
    );
    const names = new Map<string, string>();
    for (const senderId of senders) {
      const profile = await getProfile(ctx, senderId);
      names.set(senderId, profile?.name ?? "Fetch");
    }

    const otherId =
      ride.commuterId === userId ? ride.riderId : ride.commuterId;

    return {
      rideId: ride._id,
      cancelled: ride.status === "CANCELLED",
      counterpartyName: otherId
        ? (names.get(otherId) ?? "your rider")
        : "your rider",
      /** Which set of one-tap replies this viewer is offered. */
      myRole: ride.commuterId === userId ? "commuter" : "rider",
      messages: rows.map((row) => {
        const kind = row.kind ?? "user";
        return {
          _id: row._id,
          body: row.body,
          createdAt: row.createdAt,
          kind,
          // A status line belongs to neither side, so it is never "mine".
          mine: kind === "user" && row.senderId === userId,
          senderName: kind === "system" ? "Fetch" : (names.get(row.senderId) ?? "Fetch"),
        };
      }),
    };
  },
});

/**
 * Record that this account has read a thread up to now.
 *
 * A timestamp rather than a set of read ids: the badge asks one question — is
 * the newest message newer than when I last looked? — and a row per message
 * would grow without bound over a long trip. The thread calls this as it opens,
 * so the badge clears by reading, which is what a person expects.
 */
export const markRead = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const { userId } = await requireParticipant(ctx, args.rideId);
    const newest = await ctx.db
      .query("messages")
      .withIndex("by_ride_time", (q) => q.eq("rideId", args.rideId))
      .order("desc")
      .take(1);
    const readAt = newest[0]?.createdAt ?? Date.now();
    const existing = await ctx.db
      .query("chatReads")
      .withIndex("by_user_ride", (q) =>
        q.eq("userId", userId).eq("rideId", args.rideId),
      )
      .unique();
    if (existing) {
      // Never move the marker backwards: two clients can race, and the older
      // one must not resurrect a badge the newer one already cleared.
      if (existing.readAt >= readAt) return existing.readAt;
      await ctx.db.patch(existing._id, { readAt });
    } else {
      await ctx.db.insert("chatReads", { userId, rideId: args.rideId, readAt });
    }
    return readAt;
  },
});

/**
 * The Chats tab's red dot: how many threads have something unread in them.
 *
 * A thread is unread when its newest message came from the other person and is
 * newer than this account's read marker. A status line the platform wrote does
 * not count — nobody is waiting on the rider to reply to a notification.
 */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [rides, readAt] = await Promise.all([
      threadRides(ctx, userId),
      readMarkers(ctx, userId),
    ]);

    const unread = await Promise.all(
      rides.map(async (ride) => {
        const newest = await ctx.db
          .query("messages")
          .withIndex("by_ride_time", (q) => q.eq("rideId", ride._id))
          .order("desc")
          .take(1);
        const message = newest[0];
        if (!message) return false;
        if ((message.kind ?? "user") === "system") return false;
        if (message.senderId === userId) return false;
        return message.createdAt > (readAt.get(ride._id) ?? 0);
      }),
    );

    return unread.filter(Boolean).length;
  },
});

/**
 * Every conversation this account is part of, newest message first.
 *
 * A thread only exists once somebody has written in it: a ride with no
 * messages is not a conversation yet, and listing it would teach the commuter
 * nothing. The last message for each ride comes from the by_ride_time index,
 * so this costs one indexed read per recent ride instead of a table scan.
 */
export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [rides, readAt] = await Promise.all([
      threadRides(ctx, userId),
      readMarkers(ctx, userId),
    ]);

    const threads = (
      await Promise.all(
        rides.map(async (ride) => {
          const last = await ctx.db
            .query("messages")
            .withIndex("by_ride_time", (q) => q.eq("rideId", ride._id))
            .order("desc")
            .take(1);
          const message = last[0];
          if (!message) return null;
          return {
            ride,
            message,
            otherId:
              ride.commuterId === userId ? ride.riderId : ride.commuterId,
          };
        }),
      )
    ).filter((thread): thread is NonNullable<typeof thread> => thread !== null);

    // One profile lookup per distinct counterpart, not one per thread.
    const names = new Map<string, string>();
    for (const { otherId } of threads) {
      if (!otherId || names.has(otherId)) continue;
      const profile = await getProfile(ctx, otherId);
      names.set(otherId, profile?.name ?? "Fetch");
    }

    return threads
      .sort((a, b) => b.message.createdAt - a.message.createdAt)
      .slice(0, MAX_THREADS)
      .map(({ ride, message, otherId }) => ({
        rideId: ride._id,
        code: ride.code,
        status: ride.status,
        // Absent on rows written before pasugo existed; those are plain rides.
        bookingType: ride.bookingType ?? "ride",
        counterpartyName: otherId
          ? (names.get(otherId) ?? "your rider")
          : "your rider",
        /** Who is on the other side, for the actions a commuter can take. */
        counterpartyId: otherId ?? null,
        lastMessage: message.body,
        lastMessageAt: message.createdAt,
        lastMessageMine: message.senderId === userId,
        unread:
          (message.kind ?? "user") === "user" &&
          message.senderId !== userId &&
          message.createdAt > (readAt.get(ride._id) ?? 0),
      }));
  },
});

/** Post a message to the ride thread. */
export const send = mutation({
  args: { rideId: v.id("rides"), body: v.string() },
  handler: async (ctx, args) => {
    const { userId, ride } = await requireParticipant(ctx, args.rideId);
    if (ride.status === "CANCELLED") {
      throw new Error("This ride was cancelled, so the chat is closed.");
    }
    const body = normalizeMessage(args.body);
    return await ctx.db.insert("messages", {
      rideId: ride._id,
      senderId: userId,
      body,
      createdAt: Date.now(),
      kind: "user",
    });
  },
});

/** Stop a rider from ever taking this commuter's trips. */
export const blockRider = mutation({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.riderId === userId) {
      throw new Error("You cannot block yourself.");
    }
    // Only ever block somebody who actually drove for you. This is not a way to
    // disable another account, and the rule is what keeps it that way.
    const mine = await ctx.db
      .query("rides")
      .withIndex("by_commuter", (q) => q.eq("commuterId", userId))
      .collect();
    if (!mine.some((ride) => ride.riderId === args.riderId)) {
      throw new Error("You can only block a rider you have ridden with.");
    }
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", userId).eq("blockedId", args.riderId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("blocks", {
      blockerId: userId,
      blockedId: args.riderId,
      createdAt: Date.now(),
    });
  },
});

/** Undo a block, for the commuter who made it. */
export const unblockRider = mutation({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", userId).eq("blockedId", args.riderId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** The riders this commuter has blocked, with names for the screen. */
export const listBlocked = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
      .order("desc")
      .collect();
    return await Promise.all(
      rows.map(async (row) => {
        const profile = await getProfile(ctx, row.blockedId);
        return {
          riderId: row.blockedId,
          name: profile?.name ?? "Rider",
          blockedAt: row.createdAt,
        };
      }),
    );
  },
});
