import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_TARIFF } from "./fare";
import { systemLineFor } from "./chat";
import { requireUserId } from "./auth";
import {
  DEFAULT_BOOKING_LIMITS,
  limitsFromSettings,
  MAX_CONCURRENT_RIDES_CEILING,
  type BookingLimits,
} from "./limits";
import { isReservedAdminEmail } from "./adminEmail";
import { riderApprovalSatisfied, selectBroadcastRecipients } from "./audience";

export { MAX_CONCURRENT_RIDES_CEILING };
export type { BookingLimits };

type Ctx = QueryCtx | MutationCtx;

/**
 * Scan window for a rider's live rides: sized for the widest concurrency limit
 * the console permits, plus headroom, rather than the current limit.
 */
const MAX_RIDERS_RIDE_SCAN = MAX_CONCURRENT_RIDES_CEILING + 2;

export async function getProfile(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function getRider(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"riders"> | null> {
  return await ctx.db
    .query("riders")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Write the ride's own line into its chat thread.
 *
 * A notification is the platform talking at somebody; a chat thread is two
 * people talking to each other. Without this, "your rider has arrived" and the
 * reply that follows it look like they came from nowhere. The line is attributed
 * to whoever is on the ride, and marked as a system row so the thread renders
 * it centred rather than as a bubble from one of them.
 */
export async function postSystemLine(
  ctx: MutationCtx,
  ride: Doc<"rides">,
  status: string,
): Promise<void> {
  const body = systemLineFor(status);
  if (!body) return;
  await ctx.db.insert("messages", {
    rideId: ride._id,
    senderId: ride.riderId ?? ride.commuterId,
    body,
    createdAt: Date.now(),
    kind: "system",
  });
}

/**
 * The riders this account has blocked.
 *
 * Checked on the accept path, so a block actually keeps a rider off a commuter's
 * trips rather than only hiding the button in the UI.
 */
export async function blockedRiderIds(
  ctx: Ctx,
  blockerId: Id<"users">,
): Promise<Set<Id<"users">>> {
  const rows = await ctx.db
    .query("blocks")
    .withIndex("by_blocker", (q) => q.eq("blockerId", blockerId))
    .collect();
  return new Set(rows.map((row) => row.blockedId));
}

/**
 * Every live ride assigned to a rider. A rider can carry more than one, up to
 * whatever the Super Admin's concurrency limit allows, so the scan window is
 * sized for the widest limit the console permits rather than the default.
 */
export async function activeRidesFor(ctx: Ctx, riderId: Id<"users">) {
  const rides = await ctx.db
    .query("rides")
    .withIndex("by_rider", (q) => q.eq("riderId", riderId))
    .order("desc")
    .take(MAX_RIDERS_RIDE_SCAN);
  return rides.filter((ride) =>
    (ACTIVE_STATUSES as readonly string[]).includes(ride.status),
  );
}

/**
 * The caller's `users` document, or null when nobody is signed in.
 *
 * Everything about "who is this" is answered from here, never from the identity.
 * Convex Auth mints a JWT carrying only `sub`, `iss`, `aud` and the timestamps,
 * so `getUserIdentity()` has no email and no anonymity flag to read.
 */
export async function getCallerUser(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
}

/**
 * Email of the signed-in caller, or null when there is none.
 *
 * Read from the `users` document rather than the identity, because there is no
 * email on the identity to read. Getting this wrong fails silently: it once made
 * the reserved owner look like an ordinary stranger.
 */
export async function getCallerEmail(
  ctx: Ctx,
): Promise<string | null> {
  const user = await getCallerUser(ctx);
  return typeof user?.email === "string"
    ? user.email.trim().toLowerCase()
    : null;
}

/**
 * Is the caller a throwaway guest session?
 *
 * A guest is a real auth user with `isAnonymous: true`, which means it can own a
 * FETCH profile. An anonymous session that picked up an `admin` profile — from
 * the period when the ownership check was broken, say — would otherwise sail
 * into the control room on the strength of that row alone. A guest is never an
 * admin, whoever it is and whatever it has in the profiles table.
 */
export async function isGuestSession(ctx: Ctx): Promise<boolean> {
  return (await getCallerUser(ctx))?.isAnonymous === true;
}

/** True only for the reserved owner of the Super Admin seat. */
export async function isReservedAdmin(ctx: Ctx): Promise<boolean> {
  return isReservedAdminEmail(await getCallerEmail(ctx));
}

/**
 * Super Admin gate. Every admin read and write goes through here, so a
 * commuter or rider can never reach the tariff controls or the approval queue
 * by calling the functions directly.
 *
 * The reserved owner address passes on the strength of the address alone, even
 * before `profiles.ensureAdminProfile` has written their profile row. That way
 * the console is reachable the instant they sign in, with no setup step in
 * between — the profile is only there so the UI can name them.
 */
export async function requireAdmin(ctx: Ctx) {
  const userId = await requireUserId(ctx);
  // Checked before the profile: a guest session must not be one query away from
  // the control room, however its profile row happens to read.
  if (await isGuestSession(ctx)) {
    throw new Error("Guest sessions do not have Super Admin access.");
  }
  const profile = await getProfile(ctx, userId);
  if (profile?.role !== "admin" && !(await isReservedAdmin(ctx))) {
    throw new Error("Super Admin access only.");
  }
  return { userId, profile };
}

/** Settings keys the Super Admin controls. */
export const BOOKINGS_OPEN_KEY = "bookingsOpen";
export const MAX_CONCURRENT_RIDES_KEY = "maxConcurrentRides";
export const MAX_SECOND_RIDE_DETOUR_KEY = "maxSecondRideDetourKm";
export const CASHLESS_KEY = "cashlessEnabled";
export const AUTO_APPROVE_RIDERS_KEY = "autoApproveRiders";

/** Reads one settings row, or undefined when the admin has never set it. */
async function readSetting(ctx: Ctx, key: string) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/** Defaults to open: the platform only pauses when an admin says so. */
export async function isBookingsOpen(ctx: Ctx): Promise<boolean> {
  const row = await readSetting(ctx, BOOKINGS_OPEN_KEY);
  return typeof row?.value === "boolean" ? row.value : true;
}

/**
 * Has the Super Admin switched online payment on?
 *
 * Defaults to false. Fetch has always settled in cash, and every existing
 * rider and commuter knows that; making a payment method appear by default is
 * the kind of change that should have to be asked for.
 *
 * This is only half of the question. Online payment also needs a provider to
 * be configured, which is why `resolvePaymentMethod` in `src/lib/payments.ts`
 * takes both — an admin who flips this before the payment keys exist gets cash,
 * not a checkout screen that cannot charge anybody.
 */
export async function isCashlessEnabled(ctx: Ctx): Promise<boolean> {
  const row = await readSetting(ctx, CASHLESS_KEY);
  return typeof row?.value === "boolean" ? row.value : false;
}

/**
 * Do new drivers skip the Super Admin approval queue?
 *
 * Defaults to **true**, which is the opposite of every other switch here, and
 * deliberately so. While FETCH is in its testing phase nobody is vetting
 * applications, so leaving new riders in a queue that is not being worked means
 * a driver signs up and then stares at "waiting for approval" for ever — and
 * the whole driver experience is untestable from the second account.
 *
 * The console owns it, so this is a decision that gets reversed rather than a
 * constant that gets forgotten: `Settings → Auto-approve new drivers` turns it
 * off, and the row it writes is also an audit entry naming whoever did it.
 *
 * Guests already bypass the queue elsewhere; this is about real accounts.
 */
export async function autoApproveRiders(ctx: Ctx): Promise<boolean> {
  const row = await readSetting(ctx, AUTO_APPROVE_RIDERS_KEY);
  return typeof row?.value === "boolean" ? row.value : true;
}

/**
 * The live booking limits, falling back to the shipped defaults until the Super
 * Admin saves something different. Every enforcement point reads this rather
 * than a constant, so changing the limit takes effect immediately for the next
 * accept — no redeploy.
 */
export async function bookingLimits(ctx: Ctx): Promise<BookingLimits> {
  const [concurrency, detour] = await Promise.all([
    readSetting(ctx, MAX_CONCURRENT_RIDES_KEY),
    readSetting(ctx, MAX_SECOND_RIDE_DETOUR_KEY),
  ]);
  return limitsFromSettings({
    maxConcurrentRides: concurrency?.value,
    maxSecondRideDetourKm: detour?.value,
  });
}

export { DEFAULT_BOOKING_LIMITS };

/** Creates or overwrites a single settings row. */
export async function writeSetting(
  ctx: MutationCtx,
  key: string,
  value: boolean | number,
  updatedBy: Id<"users">,
) {
  const existing = await readSetting(ctx, key);
  if (existing) {
    await ctx.db.patch(existing._id, { value, updatedAt: Date.now(), updatedBy });
    return existing._id;
  }
  return await ctx.db.insert("settings", {
    key,
    value,
    updatedAt: Date.now(),
    updatedBy,
  });
}

/** Reads the active tariff, seeding the documented default on first use. */
export async function ensureActiveTariff(ctx: MutationCtx) {
  const active = await ctx.db
    .query("tariffs")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .first();
  if (active) {
    return {
      id: active._id as Id<"tariffs">,
      minFare: active.minFare,
      includedDistanceKm: active.includedDistanceKm,
      ratePerKm: active.ratePerKm,
      // Optional: absent on rows published before long trips were banded.
      longTripThresholdKm: active.longTripThresholdKm,
      longTripRatePerKm: active.longTripRatePerKm,
      // Rows created before errands were priced fall back to the defaults.
      errandMinFare: active.errandMinFare ?? DEFAULT_TARIFF.errandMinFare,
      stopFee: active.stopFee ?? DEFAULT_TARIFF.stopFee,
    };
  }
  const id = await ctx.db.insert("tariffs", {
    ...DEFAULT_TARIFF,
    isActive: true,
    createdAt: Date.now(),
  });
  return { id, ...DEFAULT_TARIFF };
}

/** Atomic-enough sequential counter for human-readable ride codes. */
export async function nextSeq(ctx: MutationCtx, name: string): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!row) {
    await ctx.db.insert("counters", { name, value: 1 });
    return 1;
  }
  const next = row.value + 1;
  await ctx.db.patch(row._id, { value: next });
  return next;
}

export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: string;
    title: string;
    body: string;
    rideId?: Id<"rides">;
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    rideId: args.rideId,
    read: false,
    createdAt: Date.now(),
  });
}

/**
 * Fan a message out to every user, and record it so the admin can see what was
 * sent and to whom.
 *
 * Recipients are resolved from `profiles`, not from `users`: an anonymous guest
 * session has an auth user but no FETCH profile, and nobody wants their share
 * of the notice. The choice of *which* recipients is `selectBroadcastRecipients`
 * in lib/audience.ts, which is unit tested; this function only does the writes.
 */
export async function notifyBroadcast(
  ctx: MutationCtx,
  args: {
    kind: "announcement" | "tariff";
    audience: "all" | "commuters" | "riders";
    title: string;
    body: string;
    createdBy: Id<"users">;
  },
) {
  const profiles = await ctx.db.query("profiles").collect();
  const userIds = selectBroadcastRecipients(profiles, args.audience, args.createdBy);

  const createdAt = Date.now();
  for (const userId of userIds) {
    await ctx.db.insert("notifications", {
      userId,
      type: args.kind === "tariff" ? "tariff_change" : "announcement",
      title: args.title,
      body: args.body,
      read: false,
      createdAt,
    });
  }

  const broadcastId = await ctx.db.insert("broadcasts", {
    title: args.title,
    body: args.body,
    kind: args.kind,
    audience: args.audience,
    createdBy: args.createdBy,
    recipients: userIds.length,
    createdAt,
  });

  return { broadcastId, recipients: userIds.length };
}

/**
 * May this caller act as a rider right now?
 *
 * Real accounts wait for the Super Admin to approve them, so an unvified rider
 * cannot pick up passengers. A guest session is a throwaway demo account that
 * nobody will ever sit in the approval queue for, so holding one back just
 * strands it on a "waiting for approval" screen it can never leave.
 *
 * Every place that gated on `approval === "APPROVED"` goes through here, so the
 * guest exemption cannot be applied at one door and forgotten at the next.
 */
export async function canOperateAsRider(
  ctx: Ctx,
  rider: Doc<"riders"> | null,
): Promise<boolean> {
  if (!rider) return false;
  return riderApprovalSatisfied(rider.approval, await isGuestSession(ctx));
}

/** Statuses that mean the ride is still live. */
export const ACTIVE_STATUSES = [
  "SEARCHING",
  "ACCEPTED",
  "RIDER_ARRIVING",
  "RIDER_ARRIVED",
  "IN_PROGRESS",
] as const;
