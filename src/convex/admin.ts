import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  AUTO_APPROVE_RIDERS_KEY,
  autoApproveRiders,
  BOOKINGS_OPEN_KEY,
  bookingLimits,
  getProfile,
  isBookingsOpen,
  MAX_CONCURRENT_RIDES_KEY,
  MAX_SECOND_RIDE_DETOUR_KEY,
  notify,
  notifyBroadcast,
  requireAdmin,
  writeSetting,
} from "./lib/db";
import { normalizeBookingLimits } from "./lib/limits";
import { DEFAULT_TARIFF } from "./lib/fare";
import { describeTariffChanges, tariffNoticeTitle } from "./lib/broadcast";
import type { Doc } from "./_generated/dataModel";
import { toCsv } from "../lib/csv";
import { averageScore } from "../lib/ratings";
import { RIDER_PLATFORM_RATE } from "./rides";

/** Reject a tariff value that would make the platform charge nonsense. */
function readAmount(value: number, field: string, max: number): number {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${field} must be between 0 and ${max}.`);
  }
  return Math.round(value * 100) / 100;
}

/**
 * Everything the admin console needs on load: the pending approval queue, the
 * live tariff, the bookings switch, and a few counters for context.
 */
export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const riders = await ctx.db.query("riders").collect();
    const byApproval = (approval: string) =>
      riders.filter((r) => r.approval === approval);

    const completed = await ctx.db
      .query("rides")
      .withIndex("by_status", (q) => q.eq("status", "COMPLETED"))
      .order("desc")
      .take(200);
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const today = completed.filter(
      (r) => (r.completedAt ?? r.requestedAt) >= dayStart,
    );
    const searching = await ctx.db
      .query("rides")
      .withIndex("by_status", (q) => q.eq("status", "SEARCHING"))
      .collect();
    const inProgress = await ctx.db
      .query("rides")
      .withIndex("by_status", (q) => q.eq("status", "IN_PROGRESS"))
      .collect();

    return {
      pendingRiders: byApproval("PENDING").length,
      approvedRiders: byApproval("APPROVED").length,
      suspendedRiders: byApproval("SUSPENDED").length,
      rejectedRiders: byApproval("REJECTED").length,
      onlineRiders: riders.filter(
        (r) => r.isOnline && r.approval === "APPROVED",
      ).length,
      totalRiders: riders.length,
      // Passengers, counted from their profiles rather than by subtracting the
      // driver count from the account total: the two live in different tables
      // and a difference would silently go wrong the moment a rider row was
      // left behind by a deleted account.
      totalCommuters: (await ctx.db.query("profiles").collect()).filter(
        (profile) => profile.role === "commuter",
      ).length,
      searching: searching.length,
      inProgress: inProgress.length,
      completedToday: today.length,
      // Platform revenue only: the service fee the platform actually keeps, at
      // the live rate. The fee is 0 — the rider collects the whole fare — so
      // this is 0, and reporting the sum of fares here would claim revenue that
      // was never charged. Item budgets are the rider's cash, not our revenue.
      serviceFeesToday:
        Math.round(
          today.reduce((sum, r) => sum + r.fare * RIDER_PLATFORM_RATE, 0) * 100,
        ) / 100,
      bookingsOpen: await isBookingsOpen(ctx),
      limits: await bookingLimits(ctx),
      // Surfaced so the Settings tab can show the live value rather than
      // guessing at the default.
      autoApproveRiders: await autoApproveRiders(ctx),
    };
  },
});

/** How many rides the console export will hand over at most. */
const EXPORT_LIMIT = 2000;

/**
 * Every account, with the things the Users tab filters and sorts on.
 *
 * Built by joining `users` to their profile and rider row rather than by
 * keeping a denormalised user list: an admin looking for somebody is looking
 * for a name or an email, and a list that can go stale about somebody's role
 * is worse than no list.
 *
 * Rider counts ride along because "show me the drivers" is the most common
 * thing an admin does here, and it should not need a second request.
 */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const riders = await ctx.db.query("riders").collect();
    const rides = await ctx.db.query("rides").collect();

    const byUser = <T extends { userId: Id<"users"> }>(rows: T[]) =>
      new Map(rows.map((row) => [row.userId, row] as const));

    const profileByUser = byUser(profiles);
    const riderByUser = byUser(riders);

    return users
      .filter((user) => !user.isAnonymous)
      .map((user) => {
        const profile = profileByUser.get(user._id);
        const rider = riderByUser.get(user._id);
        const history = rides.filter(
          (ride) =>
            ride.commuterId === user._id || ride.riderId === user._id,
        );
        return {
          userId: user._id,
          name: profile?.name ?? user.name ?? "Unnamed",
          email: user.email ?? null,
          role: profile?.role ?? "commuter",
          phone: profile?.phone ?? rider?.phone ?? null,
          photoId: profile?.photoId ?? null,
          approval: rider?.approval ?? null,
          vehicle: rider?.vehicle ?? null,
          isOnline: rider?.isOnline ?? false,
          suspendedAt: user.suspendedAt ?? null,
          suspendedReason: user.suspendedReason ?? null,
          rides: history.length,
          completed: history.filter((ride) => ride.status === "COMPLETED")
            .length,
          joinedAt: profile?.createdAt ?? user._creationTime,
        };
      })
      // Newest joiners last is the wrong order for an admin: the person who
      // has not been looked at yet is the one to look at.
      .sort((a, b) => b.joinedAt - a.joinedAt);
  },
});

/**
 * Every ride that is still live, for the console's map.
 *
 * Distinct from `rides.listActiveRides`, which is scoped to the caller: an
 * admin needs to see all of them at once to answer "is anything stuck", and a
 * per-user query would mean opening N screens to answer it.
 */
export const listLiveRides = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const live = await ctx.db
      .query("rides")
      .withIndex("by_status")
      .collect();
    const rows = live.filter((ride) => ride.status !== "COMPLETED" && ride.status !== "CANCELLED");
    const riders = await ctx.db.query("riders").collect();
    // `rides.riderId` is a *user*, and the GPS lives on the rider row keyed by
    // the same user — so the join is on the user id, never on the row id.
    const riderByUser = new Map(riders.map((row) => [row.userId, row] as const));

    // Who is on each trip, and how to reach them. One lookup per distinct user
    // rather than per ride: a commuter with forty trips costs one read.
    //
    // This used to answer a different question. It returned a rider only when
    // that rider had a GPS fix, because the row existed to draw the console map
    // — so a driver who had accepted and then lost signal read as *nobody* on
    // the trip. That is precisely the trip an admin needs to trace, and the one
    // the row most badly hid. Identity and location are now separate: `rider`
    // says who is driving, `riderGps` says whether the map can place them.
    const people = new Set<string>();
    for (const ride of rows) {
      people.add(ride.commuterId);
      if (ride.riderId) people.add(ride.riderId);
    }
    const profiles = new Map<string, Doc<"profiles"> | null>();
    for (const id of people) {
      profiles.set(id, await getProfile(ctx, id as Id<"users">));
    }
    const who = (id: string) => {
      const profile = profiles.get(id) ?? null;
      if (!profile) return null;
      return { name: profile.name, phone: profile.phone };
    };

    return rows
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .slice(0, LIVE_RIDE_LIMIT)
      .map((ride) => {
        const riderRow = ride.riderId ? riderByUser.get(ride.riderId) : undefined;
        const hasGps = riderRow?.lat != null && riderRow?.lng != null;
        return {
          _id: ride._id,
          code: ride.code,
          status: ride.status,
          bookingType: ride.bookingType ?? "ride",
          fare: ride.fare,
          requestedAt: ride.requestedAt,
          distanceKm: ride.distanceKm ?? null,
          pickup: { lat: ride.pickup.lat, lng: ride.pickup.lng },
          destination: { lat: ride.destination.lat, lng: ride.destination.lng },
          pickupLabel: ride.pickup.address ?? "Pinned pickup",
          destinationLabel: ride.destination.address ?? "Pinned destination",
          commuter: who(ride.commuterId),
          // Null only when nobody is assigned — not when the GPS is missing.
          rider: ride.riderId ? who(ride.riderId) : null,
          riderGps: hasGps
            ? {
                lat: riderRow!.lat!,
                lng: riderRow!.lng!,
                heading: riderRow!.heading ?? null,
              }
            : null,
        };
      });
  },
});

/** How many live rides the console map will draw at most. */
const LIVE_RIDE_LIMIT = 200;

/**
 * The driver approval queue, with the document that proves each applicant.
 *
 * `reviewedAt` doubles as the submission time for a pending driver, because the
 * two are the same event seen from either side: the moment they applied. Shown
 * as "submitted" so an admin is not asked to compare it with a date that does
 * not exist yet.
 */
export const listDriverDocuments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const riders = await ctx.db
      .query("riders")
      .withIndex("by_approval", (q) => q.eq("approval", "PENDING"))
      .collect();
    const profiles = await ctx.db.query("profiles").collect();
    const byUser = new Map(profiles.map((row) => [row.userId, row] as const));

    return Promise.all(
      riders.map(async (rider) => {
        const profile = byUser.get(rider.userId);
        const photoUrl = profile?.photoId
          ? await ctx.storage.getUrl(profile.photoId)
          : null;
        return {
          riderId: rider._id,
          userId: rider.userId,
          name: profile?.name ?? rider.name,
          phone: profile?.phone ?? rider.phone,
          vehicle: rider.vehicle,
          photoUrl,
          submittedAt: rider.createdAt,
          reviewNote: rider.reviewNote ?? null,
        };
      }),
    );
  },
});

/* ── The audit log ────────────────────────────────────────────────────────── */

/**
 * Record what an admin just did.
 *
 * Called from the same mutation that does it, never by the client afterwards.
 * A log written as a second step can be skipped by a failed request, and a log
 * that can be skipped is not an audit trail — it is a suggestion.
 */
async function logAction(
  ctx: MutationCtx,
  adminId: Id<"users">,
  entry: {
    action: string;
    targetId?: Id<"users">;
    targetName?: string;
    details?: string;
  },
) {
  const admin = await ctx.db.get(adminId);
  await ctx.db.insert("adminLogs", {
    adminId,
    adminName: admin?.name ?? admin?.email ?? "Admin",
    action: entry.action,
    targetId: entry.targetId,
    targetName: entry.targetName,
    details: entry.details,
    createdAt: Date.now(),
  });
}

/** The audit trail, newest first, filtered. */
export const listAdminLogs = query({
  args: {
    /** Free text over the action, the admin and the person affected. */
    search: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("adminLogs")
      .withIndex("by_created")
      .order("desc")
      .take(LOG_LIMIT);

    const needle = args.search?.trim().toLowerCase() ?? "";
    return rows
      .filter((row) => (args.action ? row.action === args.action : true))
      .filter((row) =>
        needle.length === 0
          ? true
          : [row.action, row.adminName, row.targetName ?? "", row.details ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(needle),
      )
      .map((row) => ({
        _id: row._id,
        adminId: row.adminId,
        adminName: row.adminName,
        action: row.action,
        targetId: row.targetId ?? null,
        targetName: row.targetName ?? null,
        details: row.details ?? null,
        createdAt: row.createdAt,
      }));
  },
});

/** How many entries the log tab will hand over at most. */
const LOG_LIMIT = 500;

/* ── Analytics ─────────────────────────────────────────────────────────────── */

/** The three windows the revenue chart can be read over. */
const REVENUE_BUCKETS = { day: 7, week: 12, month: 12 } as const;

/**
 * Revenue over time, plus the riders who earned the most.
 *
 * Two questions, one read. They share the same scan of completed rides, so
 * splitting them would mean walking the same rows twice for two numbers that
 * are always shown side by side.
 *
 * ── Why revenue is not the sum of everything ever booked ───────────────────
 * Only completed rides count, and only the service fee: item budgets are the
 * rider's own cash, not the platform's. A cancelled ride that was never driven
 * is not revenue, and counting it would make the chart disagree with the
 * rider payouts an admin has to reconcile against.
 *
 * Buckets are returned dense — a day with no rides is a zero, not a gap — so
 * the chart shows a flat line instead of silently skipping three days and
 * compressing the axis.
 */
export const getAnalytics = query({
  args: {
    bucket: v.optional(
      v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const bucket = args.bucket ?? "day";

    const completed = await ctx.db
      .query("rides")
      .withIndex("by_status", (q) => q.eq("status", "COMPLETED"))
      .order("desc")
      .take(ANALYTICS_LIMIT);

    const now = Date.now();
    const buckets: { label: string; at: number; revenue: number; rides: number }[] = [];
    if (bucket === "day") {
      for (let back = REVENUE_BUCKETS.day - 1; back >= 0; back -= 1) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - back);
        const end = start.getTime() + 86_400_000;
        buckets.push({
          label: `${start.getDate()}/${start.getMonth() + 1}`,
          at: start.getTime(),
          revenue: 0,
          rides: 0,
        });
        // Buckets are pushed newest-last so the index of the bucket a ride
        // belongs to is a straight comparison against these two numbers.
        for (const ride of completed) {
          const at = ride.completedAt ?? ride.requestedAt;
          if (at >= start.getTime() && at < end) {
            const row = buckets[buckets.length - 1];
            row.revenue =
              Math.round(
                (row.revenue + ride.fare * RIDER_PLATFORM_RATE) * 100,
              ) / 100;
            row.rides += 1;
          }
        }
      }
    } else if (bucket === "week") {
      const weeks = REVENUE_BUCKETS.week;
      for (let back = weeks - 1; back >= 0; back -= 1) {
        buckets.push({ label: `W-${back}`, at: 0, revenue: 0, rides: 0 });
      }
      for (const ride of completed) {
        const ageDays =
          (now - (ride.completedAt ?? ride.requestedAt)) / 86_400_000;
        const index = weeks - 1 - Math.floor(ageDays / 7);
        if (index < 0 || index >= weeks) continue;
        const row = buckets[index];
        row.revenue =
          Math.round((row.revenue + ride.fare * RIDER_PLATFORM_RATE) * 100) / 100;
        row.rides += 1;
      }
    } else {
      const months = REVENUE_BUCKETS.month;
      const cursor = new Date();
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      for (let back = months - 1; back >= 0; back -= 1) {
        const start = new Date(cursor);
        start.setMonth(start.getMonth() - back);
        buckets.push({
          label: start.toLocaleString("en", { month: "short" }),
          at: start.getTime(),
          revenue: 0,
          rides: 0,
        });
      }
      for (const ride of completed) {
        const at = new Date(ride.completedAt ?? ride.requestedAt);
        for (const row of buckets) {
          const end = new Date(row.at);
          end.setMonth(end.getMonth() + 1);
          if (at.getTime() >= row.at && at.getTime() < end.getTime()) {
            row.revenue =
              Math.round(
                (row.revenue + ride.fare * RIDER_PLATFORM_RATE) * 100,
              ) / 100;
            row.rides += 1;
            break;
          }
        }
      }
    }

    // Top riders, by what they earned rather than by trip count. With the
    // platform fee removed a rider's earnings are the fares they collected, but
    // the ranking is by money either way: a rider with fewer, longer trips is
    // not a smaller earner.
    const earned = new Map<string, { name: string; revenue: number; rides: number }>();
    for (const ride of completed) {
      if (!ride.riderId) continue;
      const row = earned.get(ride.riderId) ?? {
        name: "Rider",
        revenue: 0,
        rides: 0,
      };
      row.revenue = Math.round((row.revenue + ride.fare) * 100) / 100;
      row.rides += 1;
      earned.set(ride.riderId, row);
    }
    const riders = await ctx.db.query("riders").collect();
    const topRiders = [...earned.entries()]
      .map(([userId, row]) => ({
        userId,
        name: riders.find((r) => r._id === userId)?.name ?? row.name,
        revenue: row.revenue,
        rides: row.rides,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, TOP_RIDERS_LIMIT);

    return {
      bucket,
      series: buckets,
      topRiders,
      totalRevenue:
        Math.round(
          completed.reduce(
            (sum, ride) => sum + ride.fare * RIDER_PLATFORM_RATE,
            0,
          ) * 100,
        ) / 100,
      totalRides: completed.length,
    };
  },
});

/** How many completed rides the analytics scan will read. */
const ANALYTICS_LIMIT = 2000;

/** How many riders the "top riders" chart shows. */
const TOP_RIDERS_LIMIT = 8;

/* ── Support tickets ──────────────────────────────────────────────────────── */

/** A ticket plus its thread, newest message last. */
export const listTickets = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("OPEN"),
        v.literal("IN_PROGRESS"),
        v.literal("RESOLVED"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = args.status
      ? await ctx.db
          .query("tickets")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(TICKET_LIMIT)
      : await ctx.db
          .query("tickets")
          .withIndex("by_updated")
          .order("desc")
          .take(TICKET_LIMIT);

    return Promise.all(
      rows.map(async (ticket) => {
        const messages = await ctx.db
          .query("ticketMessages")
          .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
          .collect();
        return {
          ...ticket,
          // Status defaults are applied on read, so a ticket written by an
          // older build (or by a user) reads as open without a backfill.
          status: ticket.status ?? "OPEN",
          priority: ticket.priority ?? 1,
          messages: messages.sort((a, b) => a.createdAt - b.createdAt),
        };
      }),
    );
  },
});

/** How many tickets the console will hand over at most. */
const TICKET_LIMIT = 200;

export const replyToTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    body: v.string(),
    /** Resolve in the same action, so the note and the status cannot disagree. */
    resolve: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("That ticket no longer exists.");
    const body = args.body.trim();
    if (!body) throw new Error("Write something first.");

    const admin = await ctx.db.get(adminId);
    const now = Date.now();
    await ctx.db.insert("ticketMessages", {
      ticketId: ticket._id,
      senderId: adminId,
      senderName: admin?.name ?? "Support",
      fromAdmin: true,
      body,
      createdAt: now,
    });
    await ctx.db.patch(ticket._id, {
      status: args.resolve ? "RESOLVED" : (ticket.status ?? "OPEN") === "OPEN" ? "IN_PROGRESS" : ticket.status ?? "OPEN",
      assignedTo: ticket.assignedTo ?? adminId,
      updatedAt: now,
      resolvedAt: args.resolve ? now : undefined,
    });

    if (ticket.userId) {
      await notify(ctx, {
        userId: ticket.userId,
        type: "ticket_reply",
        title: args.resolve ? "Your ticket was resolved" : "Support replied",
        body: body.slice(0, 160),
      });
    }
    await logAction(ctx, adminId, {
      action: args.resolve ? "resolve_ticket" : "reply_ticket",
      details: body.slice(0, 200),
    });
    return { ok: true };
  },
});

/** Open a ticket on someone's behalf, from the console. */
export const createTicket = mutation({
  args: { subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx);
    const body = args.body.trim();
    if (!body) throw new Error("Write something first.");
    const now = Date.now();
    const ticketId = await ctx.db.insert("tickets", {
      subject: args.subject.trim().slice(0, 120) || "Follow-up",
      status: "OPEN",
      priority: 2,
      assignedTo: adminId,
      createdAt: now,
      updatedAt: now,
    });
    const admin = await ctx.db.get(adminId);
    await ctx.db.insert("ticketMessages", {
      ticketId,
      senderId: adminId,
      senderName: admin?.name ?? "Support",
      fromAdmin: true,
      body,
      createdAt: now,
    });
    await logAction(ctx, adminId, {
      action: "create_ticket",
      details: args.subject.slice(0, 200),
    });
    return { ok: true, ticketId };
  },
});

/* ── Suspending an account ────────────────────────────────────────────────── */

/**
 * Suspend or restore any account, commuter or rider.
 *
 * A rider's approval state is about whether they may drive; a suspension is
 * about whether they may use the app at all, so it lives on the account. The
 * rider row is patched too when the suspended account is a rider, so the two
 * views of "may this person work" cannot disagree — and the person is notified
 * either way, because a silent suspension is just an outage with an admin's
 * name on it.
 */
export const setUserSuspended = mutation({
  args: {
    userId: v.id("users"),
    suspended: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("That account no longer exists.");

    const reason = args.reason?.trim() || (args.suspended ? "No reason given" : "");
    await ctx.db.patch(args.userId, {
      suspendedAt: args.suspended ? Date.now() : undefined,
      suspendedReason: args.suspended ? reason.slice(0, 300) : undefined,
    });

    const rider = await ctx.db
      .query("riders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (rider && args.suspended && rider.approval === "APPROVED") {
      await ctx.db.patch(rider._id, { approval: "SUSPENDED" });
    }

    const name = user.name ?? user.email ?? "Account";
    await notify(ctx, {
      userId: args.userId,
      type: "account_suspended",
      title: args.suspended ? "Your account has been suspended" : "Your account is active again",
      body: args.suspended
        ? `${name}: ${reason}`
        : `${name} — welcome back.`,
    });

    await logAction(ctx, adminId, {
      action: args.suspended ? "suspend" : "restore",
      targetId: args.userId,
      targetName: name,
      details: reason,
    });
    return { ok: true };
  },
});

/**
 * The export's columns, in order.
 *
 * Kept beside the query that fills them, not in the console component, so the
 * header, the order and the values cannot drift apart, and so a field added to
 * the query is a deliberate decision to publish it.
 */
const EXPORT_HEADERS = [
  "Trip",
  "Status",
  "Service",
  "Passenger",
  "Passenger phone",
  "Rider",
  "Rider phone",
  "Pickup",
  "Destination",
  "Distance (km)",
  "Fare",
  "Requested",
  "Completed",
] as const;

/**
 * Every ride as a CSV file, built here rather than in the console.
 *
 * The export is the one place the platform writes other people's data out to a
 * file, and the client has no business deciding what is in it: a column added
 * to a screen's query should not silently become a column in somebody's
 * spreadsheet. Passenger notes, item budgets and recipient phone numbers are
 * left out on purpose — a fare sheet does not need them.
 */
export const exportRidesCsv = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAdmin(ctx);
    const rides = await ctx.db
      .query("rides")
      .order("desc")
      .take(EXPORT_LIMIT);

    // One profile lookup per distinct id, not one per ride: a commuter with
    // forty trips costs one read, not forty. Names *and* numbers, because a
    // name is what you recognise and a number is what you can ring — an export
    // you cannot act on is just a dump.
    const ids = new Set<string>();
    for (const ride of rides) {
      ids.add(ride.commuterId);
      if (ride.riderId) ids.add(ride.riderId);
    }
    const people = new Map<string, { name: string; phone: string }>();
    for (const id of ids) {
      const profile = await getProfile(ctx, id as never);
      people.set(id, { name: profile?.name ?? "", phone: profile?.phone ?? "" });
    }

    const csv = toCsv(
      EXPORT_HEADERS,
      rides.map((ride) => [
        ride.code,
        ride.status,
        ride.bookingType ?? "ride",
        people.get(ride.commuterId)?.name ?? "",
        people.get(ride.commuterId)?.phone ?? "",
        ride.riderId ? (people.get(ride.riderId)?.name ?? "") : "",
        ride.riderId ? (people.get(ride.riderId)?.phone ?? "") : "",
        ride.pickup.address ?? "",
        ride.destination.address ?? "",
        ride.distanceKm,
        ride.fare,
        new Date(ride.requestedAt).toISOString(),
        ride.completedAt ? new Date(ride.completedAt).toISOString() : null,
      ]),
    );

    // Written inside the same mutation as the export, never by the client
    // afterwards: a log that a failed request can skip is a suggestion, not an
    // audit trail. This is the only admin action that carries passenger and
    // rider phone numbers out of the database, which is precisely why it is
    // the one that has to leave a row behind.
    await logAction(ctx, userId, {
      action: "export_rides_csv",
      details: `${rides.length} rides exported, including passenger and rider phone numbers.`,
    });

    return {
      csv,
      count: rides.length,
      // Dated in the file name, because "rides.csv" in a downloads folder is
      // never the one somebody wanted.
      filename: `fetch-rides-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  },
});

/** The rider approval queue plus the full rider list for review. */
export const listRiders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const riders = await ctx.db.query("riders").collect();
    const rows = await Promise.all(
      riders.map(async (rider) => {
        const profile = await getProfile(ctx, rider.userId);
        // The average is what the console acts on, so it belongs on the row
        // rather than behind a second click. Null for a rider nobody has rated
        // yet, which is a different thing from a rider rated badly.
        const ratings = await ctx.db
          .query("ratings")
          .withIndex("by_target", (q) => q.eq("targetId", rider.userId))
          .collect();
        return {
          _id: rider._id,
          name: rider.name,
          email: profile?.name ?? "—",
          phone: rider.phone,
          vehicle: rider.vehicle,
          approval: rider.approval,
          isOnline: rider.isOnline,
          reviewNote: rider.reviewNote,
          reviewedAt: rider.reviewedAt,
          createdAt: rider.createdAt,
          ratingAverage: averageScore(ratings.map((row) => row.score)),
          ratingCount: ratings.length,
        };
      }),
    );

    const order = { PENDING: 0, APPROVED: 1, SUSPENDED: 2, REJECTED: 3 } as const;
    return rows.sort((a, b) => {
      const byApproval = order[a.approval] - order[b.approval];
      if (byApproval !== 0) return byApproval;
      return a.createdAt - b.createdAt;
    });
  },
});

/**
 * Approve, reject, or suspend a rider. Records who decided and why, and tells
 * the rider either way so they are not left guessing.
 */
export const setRiderApproval = mutation({
  args: {
    riderId: v.id("riders"),
    approval: v.union(
      v.literal("APPROVED"),
      v.literal("SUSPENDED"),
      v.literal("REJECTED"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const rider = await ctx.db.get(args.riderId);
    if (!rider) throw new Error("Rider not found.");

    // A decline with no reason is not actionable: the applicant cannot fix it,
    // support cannot explain it, and the console keeps no record of why. The
    // Documents tab already disables its Reject button until a reason is typed,
    // but a rule that lives only in a button is a rule that a future screen (or
    // a direct call) can walk straight past — so it is enforced here, where the
    // decision is actually written.
    const note = args.note?.trim();
    if (args.approval === "REJECTED" && !note) {
      throw new Error("Say why the application was declined.");
    }

    // Suspending a rider mid-trip would strand the commuter, so send them
    // offline first and let the ride finish.
    if (args.approval !== "APPROVED") await ctx.db.patch(rider._id, { isOnline: false });

    await ctx.db.patch(rider._id, {
      approval: args.approval,
      reviewedAt: Date.now(),
      reviewedBy: userId,
      reviewNote: note?.slice(0, 200) || undefined,
    });

    const messages = {
      APPROVED: ["You're approved", "You can go online and start accepting rides."],
      SUSPENDED: ["Your account is suspended", "Contact Fetch support if you think this is a mistake."],
      REJECTED: ["Your rider application was declined", "Contact Fetch support if you think this is a mistake."],
    } as const;
    const [title, body] = messages[args.approval];
    await notify(ctx, {
      userId: rider.userId,
      type: `rider_${args.approval.toLowerCase()}`,
      title,
      body,
    });

    // The reason travels with the decision, and the decision travels into the
    // audit log: "why was this driver declined" has to be answerable a year
    // later by somebody who was not here.
    await logAction(ctx, userId, {
      action: `rider_${args.approval.toLowerCase()}`,
      targetId: rider.userId,
      targetName: rider.name,
      details: note?.slice(0, 200),
    });
  },
});

/** Every tariff version, newest first, so the admin can see what changed. */
export const listTariffs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("tariffs").collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((t) => ({
        _id: t._id,
        minFare: t.minFare,
        includedDistanceKm: t.includedDistanceKm,
        ratePerKm: t.ratePerKm,
        // Optional on older rows: the admin form leaves them blank rather than
        // showing a band the tariff does not actually have.
        longTripThresholdKm: t.longTripThresholdKm,
        longTripRatePerKm: t.longTripRatePerKm,
        errandMinFare: t.errandMinFare ?? DEFAULT_TARIFF.errandMinFare,
        stopFee: t.stopFee ?? DEFAULT_TARIFF.stopFee,
        note: t.note,
        isActive: t.isActive,
        createdAt: t.createdAt,
      }));
  },
});

/**
 * Publish a new tariff. Never edits an existing row: rides snapshot the terms
 * they were priced with, so old receipts must keep their original numbers.
 */
export const updateTariff = mutation({
  args: {
    minFare: v.number(),
    includedDistanceKm: v.number(),
    ratePerKm: v.number(),
    /**
     * The long-trip band. Both together or neither: a threshold with no rate
     * would leave an admin believing long trips are priced differently when
     * they are not, so the pair is validated below rather than half-applied.
     */
    longTripThresholdKm: v.optional(v.number()),
    longTripRatePerKm: v.optional(v.number()),
    errandMinFare: v.number(),
    stopFee: v.number(),
    note: v.optional(v.string()),
    /**
     * Set false to publish the fares silently. The admin is told on screen what
     * a change means, so publishing quietly is a deliberate option rather than
     * an oversight.
     */
    notifyUsers: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const minFare = readAmount(args.minFare, "Minimum fare", 5000);
    const includedDistanceKm = readAmount(args.includedDistanceKm, "Included distance", 100);
    const ratePerKm = readAmount(args.ratePerKm, "Rate per km", 500);

    // Both dials or neither, and the band has to start beyond the distance the
    // base fare already covers — a threshold inside the included distance would
    // price the first few kilometres at the long rate, which is not what an
    // admin setting "after 3 km" means.
    const hasBand =
      args.longTripThresholdKm !== undefined ||
      args.longTripRatePerKm !== undefined;
    let longTripThresholdKm: number | undefined;
    let longTripRatePerKm: number | undefined;
    if (hasBand) {
      if (args.longTripThresholdKm === undefined || args.longTripRatePerKm === undefined) {
        throw new Error(
          "Set both the long-trip distance and the long-trip rate, or leave both blank.",
        );
      }
      longTripThresholdKm = readAmount(
        args.longTripThresholdKm,
        "Long-trip distance",
        500,
      );
      longTripRatePerKm = readAmount(args.longTripRatePerKm, "Long-trip rate", 500);
      if (longTripThresholdKm <= includedDistanceKm) {
        throw new Error(
          `Long-trip distance must be more than the included distance (${includedDistanceKm} km).`,
        );
      }
      if (longTripRatePerKm < ratePerKm) {
        throw new Error(
          "The long-trip rate should not be cheaper than the standard rate.",
        );
      }
    }

    const errandMinFare = readAmount(args.errandMinFare, "Errand minimum", 5000);
    const stopFee = readAmount(args.stopFee, "Store stop fee", 2000);

    const active = await ctx.db
      .query("tariffs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();

    // Snapshot the outgoing numbers before they are deactivated, so the notice
    // can say what changed rather than just restating the new tariff.
    const before = active
      ? {
          minFare: active.minFare,
          includedDistanceKm: active.includedDistanceKm,
          ratePerKm: active.ratePerKm,
          longTripThresholdKm: active.longTripThresholdKm,
          longTripRatePerKm: active.longTripRatePerKm,
          // Rows predating errands have no such columns; fall back to the
          // defaults so the diff reads "changed" instead of "0 -> 90".
          errandMinFare: active.errandMinFare ?? DEFAULT_TARIFF.errandMinFare,
          stopFee: active.stopFee ?? DEFAULT_TARIFF.stopFee,
        }
      : null;

    if (active) await ctx.db.patch(active._id, { isActive: false });

    const id = await ctx.db.insert("tariffs", {
      minFare,
      includedDistanceKm,
      ratePerKm,
      longTripThresholdKm,
      longTripRatePerKm,
      errandMinFare,
      stopFee,
      note: args.note?.trim().slice(0, 120) || undefined,
      isActive: true,
      createdBy: userId,
      createdAt: Date.now(),
    });

    let notified = 0;
    if (args.notifyUsers !== false) {
      const changes = describeTariffChanges(before, {
        minFare,
        includedDistanceKm,
        ratePerKm,
        longTripThresholdKm,
        longTripRatePerKm,
        errandMinFare,
        stopFee,
      });
      const reason = args.note?.trim().slice(0, 120);
      const sent = await notifyBroadcast(ctx, {
        kind: "tariff",
        audience: "all",
        title: tariffNoticeTitle(),
        body: reason ? `${changes} Reason: ${reason}.` : changes,
        createdBy: userId,
      });
      notified = sent.recipients;
    }

    return { tariffId: id, notified };
  },
});

/**
 * Post a message to commuters and/or riders. Everyone addressed receives it as
 * a notification, so it waits in their bell until they next open the app.
 */
export const postBroadcast = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    audience: v.union(
      v.literal("all"),
      v.literal("commuters"),
      v.literal("riders"),
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const title = args.title.trim().slice(0, 80);
    const body = args.body.trim().slice(0, 400);
    if (!title) throw new Error("Give the message a title.");
    if (!body) throw new Error("The message cannot be empty.");

    return await notifyBroadcast(ctx, {
      kind: "announcement",
      audience: args.audience,
      title,
      body,
      createdBy: userId,
    });
  },
});

/** What the console has sent, newest first. */
export const listBroadcasts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("broadcasts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(20);
  },
});

/**
 * Master switch on the rider approval queue.
 *
 * While FETCH is in testing this starts on, so a newly registered driver can
 * immediately use their dashboard. Turning it off restores the queue: new
 * applicants land in `PENDING` and the Super Admin works through them in the
 * Driver Documents tab.
 *
 * Audited, unlike the other settings toggles, because this is the one switch
 * that decides whether an unvetted driver may carry passengers. "Who turned
 * the queue off, and when" has to be answerable.
 */
export const setAutoApproveRiders = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    await writeSetting(ctx, AUTO_APPROVE_RIDERS_KEY, args.enabled, userId);
    await logAction(ctx, userId, {
      action: "set_auto_approve_riders",
      details: args.enabled
        ? "New drivers are now approved automatically."
        : "New drivers now wait in the approval queue.",
    });
  },
});

/**
 * Master switch on new bookings. Useful when fares need to move and the
 * platform wants a breather, or when the region is unreachable.
 */
export const setBookingsOpen = mutation({
  args: { open: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    await writeSetting(ctx, BOOKINGS_OPEN_KEY, args.open, userId);
  },
});

/**
 * Set how many live rides a rider may hold, and how far off their current route
 * a second pickup may sit.
 *
 * Setting `maxConcurrentRides` to 1 switches double booking off entirely.
 * Takes effect on the next accept attempt — riders who are already carrying
 * more than the new limit simply cannot take anything further until they drop
 * below it.
 */
export const updateBookingLimits = mutation({
  args: {
    maxConcurrentRides: v.number(),
    maxSecondRideDetourKm: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const limits = normalizeBookingLimits(args);

    await writeSetting(
      ctx,
      MAX_CONCURRENT_RIDES_KEY,
      limits.maxConcurrentRides,
      userId,
    );
    await writeSetting(
      ctx,
      MAX_SECOND_RIDE_DETOUR_KEY,
      limits.maxSecondRideDetourKm,
      userId,
    );
    return limits;
  },
});