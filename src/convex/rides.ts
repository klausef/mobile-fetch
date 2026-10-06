import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { normalizePhone, requireUserId } from "./lib/auth";
import { ridePassenger } from "./lib/passenger";
import {
  ACTIVE_STATUSES,
  activeRidesFor,
  blockedRiderIds,
  bookingLimits,
  canOperateAsRider,
  ensureActiveTariff,
  getProfile,
  getRider,
  isBookingsOpen,
  isCashlessEnabled,
  nextSeq,
  notify,
  postSystemLine,
} from "./lib/db";
import { canTakeAnotherRide } from "./lib/limits";
import { rememberRecent } from "./recentPlaces";
import {
  clampStoreFare,
  computeErrandFare,
  formatRideCode,
  MAX_STORE_REPRICE_RATIO,
  needsStoreConfirmation,
  NEAR_STORE_KM,
} from "./lib/fare";
import {
  distanceToSegmentKm,
  haversineKm,
  isValidLatLng,
} from "./lib/geo";
import { normalizeScheduledFor } from "../lib/schedule";
import {
  fareBreakdown,
  resolveBillableKm,
  resolveRideType,
  surgeMultiplierFor,
  type RideType,
} from "../lib/fare-breakdown";
import {
  isPaymentMethod,
  resolvePaymentMethod,
} from "../lib/payments";
import { isStripeConfigured } from "./lib/provider";
import type { Doc, Id } from "./_generated/dataModel";

const point = v.object({
  lat: v.number(),
  lng: v.number(),
  address: v.optional(v.string()),
});

const bookingTypeArg = v.union(
  v.literal("ride"),
  v.literal("pabili"),
  v.literal("padala"),
);

/**
 * The vehicle class, as a request argument.
 *
 * A union rather than `RIDE_TYPE` from the schema so an older client that does
 * not send the field at all is still accepted: `requestRide` falls back to the
 * default ride type and prices it, rather than rejecting a request from a
 * build that predates ride types.
 */
const rideTypeArg = v.union(
  v.literal("motorcycle"),
  v.literal("tricycle"),
  v.literal("car"),
  v.literal("van"),
);

const errandItemArg = v.object({
  name: v.string(),
  qty: v.number(),
  note: v.optional(v.string()),
});

const MAX_ITEMS = 20;
const MAX_ITEM_QTY = 99;
const MAX_BUDGET = 50000;

type ErrandItem = { name: string; qty: number; note?: string };

/**
 * Validates and normalizes a shopping list. Never trust the client's shape,
 * quantities, or lengths.
 */
function normalizeItems(list: readonly ErrandItem[]) {
  if (list.length > MAX_ITEMS) {
    throw new Error(`A pasugo request can hold at most ${MAX_ITEMS} items.`);
  }
  return list.map((item) => {
    const name = (item.name ?? "").trim().slice(0, 80);
    if (!name) throw new Error("Every pasugo item needs a name.");
    const qty = Math.floor(item.qty);
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_ITEM_QTY) {
      throw new Error(`Quantity for "${name}" must be 1–${MAX_ITEM_QTY}.`);
    }
    const note = item.note?.trim().slice(0, 120);
    return note ? { name, qty, note } : { name, qty };
  });
}

/** Padala carries one named item, so a list is required. */
function cleanItems(raw: readonly ErrandItem[] | undefined) {
  const list = raw ?? [];
  if (list.length === 0) {
    throw new Error("Tell your rider what to pick up.");
  }
  return normalizeItems(list);
}

/**
 * Pabili takes the shopping list as free text in `notes`, so a structured item
 * list is optional there and only validated when one is sent.
 */
function cleanOptionalItems(raw: readonly ErrandItem[] | undefined) {
  const list = raw ?? [];
  return list.length === 0 ? undefined : normalizeItems(list);
}

const isActive = (status: string) =>
  (ACTIVE_STATUSES as readonly string[]).includes(status);

/**
 * Demand right now, as a fare multiplier.
 *
 * Read from the live tables rather than kept in a counter, because a cached
 * number is a number that was right at some point: a rider going offline or a
 * request being accepted changes the ratio immediately, and a stale multiplier
 * charges a commuter for a peak that has already ended.
 *
 * The same function the booking screen calls, so what is shown and what is
 * charged cannot come from two different definitions of "busy".
 */
async function currentSurgeMultiplier(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const openRequests = await ctx.db
    .query("rides")
    .withIndex("by_status", (q) => q.eq("status", "SEARCHING"))
    .take(50);

  const online = await ctx.db
    .query("riders")
    .withIndex("by_online", (q) => q.eq("isOnline", true))
    .take(200);

  const available = online.filter((rider) => rider.approval === "APPROVED").length;
  return surgeMultiplierFor(openRequests.length, available);
}

/**
 * Live surge, for the booking screen.
 *
 * Separate from `requestRide`'s internal read so the commuter sees the number
 * *before* committing, which is the entire contract of a surge multiplier. A
 * surge the platform applies silently is just a price rise.
 */
export const getSurge = query({
  args: {},
  handler: async (ctx) => ({
    multiplier: await currentSurgeMultiplier(ctx),
  }),
});

/** Rider-driven forward transitions only. Clients can never skip states. */
const RIDER_TRANSITIONS: Record<string, string[]> = {
  ACCEPTED: ["RIDER_ARRIVING"],
  RIDER_ARRIVING: ["RIDER_ARRIVED"],
  RIDER_ARRIVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};

const CANCELLABLE_BY_COMMUTER = ["SEARCHING", "ACCEPTED", "RIDER_ARRIVING", "RIDER_ARRIVED"];

/**
 * Commuter requests a ride. Distance and fare are computed here from raw
 * coordinates — the client estimate is display-only and never trusted.
 */
export const requestRide = mutation({
  args: {
    pickup: point,
    destination: point,
    bookingType: v.optional(bookingTypeArg),
    items: v.optional(v.array(errandItemArg)),
    itemBudget: v.optional(v.number()),
    notes: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    recipientPhone: v.optional(v.string()),
    /** Set by the commuter after the near-store pin warning. */
    storePinConfirmed: v.optional(v.boolean()),
    /** The vehicle class the commuter picked on the booking screen. */
    rideType: v.optional(rideTypeArg),
    /**
     * Length of the road route the commuter was shown, in km.
     *
     * The client draws a real driving route and prices on its length, which is
     * the honest number — a straight line understates a highway trip by a
     * third. It is not *trusted*: `resolveBillableKm` accepts it only inside a
     * band the geometry proves, and falls back to the straight-line distance
     * otherwise, so a tampered body cannot buy a cheaper fare.
     */
    routeDistanceKm: v.optional(v.number()),
    /**
     * Requested pickup time for a booking made ahead. Validated on write by
     * `normalizeScheduledFor`, which turns a time we cannot honour into "now"
     * rather than into a request that sits invisible for a week.
     */
    scheduledFor: v.optional(v.number()),
    /**
     * Whether the commuter intends to pay online. Only honoured when the Super
     * Admin has online payment switched on and a provider is actually
     * configured; otherwise the ride settles in cash.
     */
    paymentMethod: v.optional(v.union(v.literal("cash"), v.literal("online"))),
    /**
     * Who is riding. Absent means "self" — see the ride schema.
     *
     * Typed as a union rather than a loose string so an unknown value is a
     * validation error at the boundary instead of a row nobody knows how to
     * read later.
     */
    passengerType: v.optional(v.union(v.literal("self"), v.literal("other"))),
    /**
     * The passenger's details, used only when `passengerType` is "other".
     *
     * Deliberately *not* accepted for "self": if the client could name its own
     * passenger, a rider picking the job up would ring a number the booker chose
     * rather than the person riding. For "self" the server reads the passenger
     * out of the authenticated profile instead and ignores both fields.
     */
    passengerName: v.optional(v.string()),
    passengerPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("Complete your profile first.");
    if (profile.role !== "commuter") {
      throw new Error("Only commuters can request rides.");
    }
    if (profile.status !== "active") {
      throw new Error("Your account is suspended.");
    }
    // Master switch: the Super Admin can pause new bookings without taking the
    // platform down. Rides already accepted keep running.
    if (!(await isBookingsOpen(ctx))) {
      throw new Error(
        "Fetch is not accepting new bookings right now. Please try again shortly.",
      );
    }
    if (!isValidLatLng(args.pickup) || !isValidLatLng(args.destination)) {
      throw new Error("Pickup or destination is invalid.");
    }

    // Straight-line first: it is the distance we *know* to be true, and it is
    // the floor the client's road distance has to beat. The validation bounds
    // below are expressed against it, so a client claiming a five-kilometre trip
    // between two points a hundred metres apart is rejected on geometry, not
    // believed.
    const straightKm = haversineKm(args.pickup, args.destination);
    if (straightKm < 0.05) {
      throw new Error("Pickup and destination are too close together.");
    }
    if (straightKm > 500) {
      throw new Error("That destination is too far away.");
    }
    const distanceKm = resolveBillableKm(straightKm, args.routeDistanceKm);

    const recent = await ctx.db
      .query("rides")
      .withIndex("by_commuter", (q) => q.eq("commuterId", userId))
      .order("desc")
      .take(10);
    if (recent.some((r) => isActive(r.status))) {
      throw new Error("You already have an active ride.");
    }

    const bookingType = args.bookingType ?? "ride";
    const isErrand = bookingType !== "ride";

    // A "Buy from" pin sitting on the customer's own block nearly always means
    // they dropped the nearest landmark instead of the shop, which prices a
    // real errand as a 200-metre drop-off. Warn first, then require an explicit
    // confirmation before the under-priced request is allowed through.
    const storePinConfirmed = args.storePinConfirmed === true;
    if (isErrand && needsStoreConfirmation(distanceKm, storePinConfirmed)) {
      const metres = Math.round(NEAR_STORE_KM * 1000);
      throw new Error(
        bookingType === "pabili"
          ? `That store is under ${metres} m from your drop-off. Pin the actual shop, or confirm to continue anyway.`
          : `That pickup point is under ${metres} m from the drop-off. Pin the real pickup point, or confirm to continue anyway.`,
      );
    }
    // Pabili: free-text shopping list in `notes`. Padala: structured items.
    const items =
      bookingType === "padala"
        ? cleanItems(args.items)
        : cleanOptionalItems(args.items);

    let itemBudget = args.itemBudget;
    if (itemBudget != null) {
      if (!Number.isFinite(itemBudget) || itemBudget < 0 || itemBudget > MAX_BUDGET) {
        throw new Error("The item budget must be between ₱0 and ₱50,000.");
      }
      itemBudget = Math.round(itemBudget * 100) / 100;
    }
    const notes = args.notes?.trim().slice(0, 600) || undefined;
    if (bookingType === "pabili" && !notes) {
      throw new Error("Tell your rider what to buy.");
    }
    const recipientName = args.recipientName?.trim().slice(0, 80) || undefined;
    const recipientPhone = args.recipientPhone
      ? normalizePhone(args.recipientPhone)
      : undefined;

    /*
     * Who is riding, resolved on the server and never taken on trust.
     *
     * The booker is `userId`, which came from the authenticated session — there
     * is no booker argument on this mutation, so a client cannot book a ride
     * against somebody else's account no matter what it sends. The passenger is
     * the one thing the client may choose, and only between two shapes:
     *
     *   "self"  — the booker is riding. Name and number are read out of the
     *             authenticated profile here, and any name/phone the client
     *             sent alongside "self" is discarded. Otherwise a tampered
     *             body could put someone else's number on the ride and the
     *             rider would call it.
     *   "other" — the booker is paying for somebody else. Name and phone are
     *             validated and stored on the ride; that passenger needs no
     *             Fetch account.
     *
     * A ride with no `passengerType` at all (an older client) resolves to
     * "self", which is what every ride before this field meant.
     */
    const passengerType: "self" | "other" =
      args.passengerType === "other" ? "other" : "self";
    let passengerUserId: Id<"users"> | undefined;
    let passengerName: string;
    let passengerPhone: string;
    if (passengerType === "self") {
      const booker = await getProfile(ctx, userId);
      passengerUserId = userId;
      passengerName = booker?.name?.trim() || "Passenger";
      passengerPhone = booker?.phone ?? "";
    } else {
      const name = (args.passengerName ?? "").trim();
      // Two characters, so "J" is rejected as a typo rather than accepted as a
      // name the rider cannot call.
      if (name.length < 2) {
        throw new Error("Enter the passenger's full name.");
      }
      if (name.length > 80) {
        throw new Error("That passenger name is too long.");
      }
      passengerName = name;
      // `normalizePhone` enforces 10-15 digits and keeps a leading +, which is
      // what makes 09XXXXXXXXX and +639XXXXXXXXX both work and everything else
      // fail. A ride cannot be created without a number the rider can dial.
      passengerPhone = normalizePhone(args.passengerPhone ?? "");
    }

    const tariff = await ensureActiveTariff(ctx);
    // Cash only, for now. Online payment is parked pending a real provider, so
    // this resolves to cash on every path and records that fact on the ride.
    //
    // The guard is kept rather than deleted, because it is the thing that makes
    // "cash only" true regardless of what any client sends: a stale or
    // tampered request carrying paymentMethod: "online" cannot turn a ride into
    // an online one, because both the admin switch and the provider have to
    // agree before `resolvePaymentMethod` will say so, and neither can.
    const payment = resolvePaymentMethod({
      requested: isPaymentMethod(args.paymentMethod)
        ? args.paymentMethod
        : "cash",
      cashlessEnabled: await isCashlessEnabled(ctx),
      providerConfigured: isStripeConfigured(),
    });
    // Surge is decided here, from live supply and demand, and never taken from
    // the client. A request that could name its own multiplier would make the
    // whole mechanism a discount code.
    const surgeMultiplier = await currentSurgeMultiplier(ctx);
    const rideType: RideType = resolveRideType(args.rideType);
    // The same `fareBreakdown` the booking screen called to draw the total, on
    // the same tariff and the same distance. That is the whole point of the
    // module living in `src/lib`: there is no second formula to fall out of
    // step, so the quoted total and the charged total are the same number.
    const breakdown = fareBreakdown({
      distanceKm,
      rideType,
      tariff,
      surgeMultiplier,
      isErrand,
    });
    const fare = breakdown.riderPayout;
    const seq = await nextSeq(ctx, "ride");
    const code = formatRideCode(seq);
    // A time that is in the past, too close, or too far out is not an error:
    // the commuter asked to go sooner or later, and the honest answer is the
    // next thing that can actually happen.
    const scheduledFor = normalizeScheduledFor(args.scheduledFor, Date.now());

    const rideId = await ctx.db.insert("rides", {
      code,
      commuterId: userId,
      status: "SEARCHING",
      bookingType,
      pickup: args.pickup,
      destination: args.destination,
      distanceKm: Math.round(distanceKm * 100) / 100,
      fare,
      rideType,
      surgeMultiplier,
      etaMinutes: breakdown.etaMinutes,
      fareBreakdown: {
        baseFare: breakdown.baseFare,
        distanceFee: breakdown.distanceFee,
        stopFee: breakdown.stopFee,
        surgeFee: breakdown.surgeFee,
        tax: breakdown.tax,
        total: breakdown.total,
        taxRatePct: breakdown.taxRatePct,
      },
      tariffId: tariff.id,
      minFareSnapshot: tariff.minFare,
      includedDistanceSnapshot: tariff.includedDistanceKm,
      ratePerKmSnapshot: tariff.ratePerKm,
      errandMinFareSnapshot: isErrand ? tariff.errandMinFare : undefined,
      stopFeeSnapshot: isErrand ? tariff.stopFee : undefined,
      quotedFare: fare,
      // The method the ride was actually created with, decided server-side from
      // the admin's toggle and whether a provider exists — never taken from
      // the client.
      paymentMethod: payment.method,
      storePinConfirmed: isErrand ? storePinConfirmed : undefined,
      items,
      itemBudget,
      notes,
      recipientName,
      recipientPhone,
      passengerType,
      passengerUserId,
      passengerName,
      passengerPhone,
      scheduledFor: scheduledFor ?? undefined,
      requestedAt: Date.now(),
    });

    const where = args.pickup.address ?? "your pickup point";
    await postSystemLine(ctx, (await ctx.db.get(rideId))!, "SEARCHING");
    await notify(ctx, {
      userId,
      type: "ride_searching",
      title: isErrand ? "Pasugo request sent" : "Searching for a rider",
      body: isErrand
        ? `Looking for a rider to run your pasugo errand near ${where}.`
        : `Looking for an available rider near ${where}.`,
      rideId,
    });

    // Remember both ends for the "recent locations" list. Done here, with the
    // booking, so the list can only ever contain trips that really happened —
    // and it cannot throw, so a shortcut list never fails a ride.
    await rememberRecent(ctx, userId, args.pickup);
    await rememberRecent(ctx, userId, args.destination);

    return rideId;
  },
});

/**
 * The rider reports what they actually spent on a pasugo purchase, so the
 * commuter knows the exact cash to hand over. Service fee stays separate.
 */
export const reportItemCost = mutation({
  args: { rideId: v.id("rides"), itemCost: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.riderId !== userId) {
      throw new Error("This ride is not assigned to you.");
    }
    if (ride.bookingType !== "pabili" && ride.bookingType !== "padala") {
      throw new Error("This booking has no purchase to report.");
    }
    if (ride.status === "COMPLETED" || ride.status === "CANCELLED") {
      throw new Error("This booking is already finished.");
    }
    if (!Number.isFinite(args.itemCost) || args.itemCost < 0 || args.itemCost > MAX_BUDGET) {
      throw new Error("Enter a valid amount spent.");
    }
    if (
      ride.itemBudget != null &&
      args.itemCost > ride.itemBudget &&
      ride.bookingType === "pabili"
    ) {
      throw new Error(
        `That is over the ₱${ride.itemBudget.toFixed(2)} budget the commuter set. Ask them to raise it first.`,
      );
    }

    const itemCostActual = Math.round(args.itemCost * 100) / 100;
    await ctx.db.patch(ride._id, { itemCostActual });

    await notify(ctx, {
      userId: ride.commuterId,
      type: "item_cost_reported",
      title: "Purchase amount reported",
      body: `Your rider spent ₱${itemCostActual.toFixed(2)} on ride ${ride.code}. Prepare it for hand-over.`,
      rideId: ride._id,
    });

    return itemCostActual;
  },
});

/**
 * Rider accepts a ride. The read-check-write runs inside a single Convex
 * mutation, which is transactionally serialized, so if two riders race only the
 * first commit wins and the loser sees "Ride already accepted".
 *
 * A rider may carry a second passenger ("double booking") while the first ride
 * is still live, but only when the new pickup is a short detour off the route
 * they are already running.
 */
export const acceptRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rider = await getRider(ctx, userId);
    if (!rider) throw new Error("Rider profile not found.");
    if (!(await canOperateAsRider(ctx, rider))) {
      throw new Error("Your rider account is not approved yet.");
    }
    if (!rider.isOnline) throw new Error("Go online to accept rides.");

    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.status !== "SEARCHING" || ride.riderId) {
      throw new Error("Ride already accepted.");
    }

    // A blocked rider is told nothing specific. "That ride is no longer
    // available" is the same thing a commuter would see for any other reason
    // the request disappeared, so a block does not confirm the rider exists as
    // far as the blocked account is concerned.
    const blocked = await blockedRiderIds(ctx, ride.commuterId);
    if (blocked.has(userId)) {
      throw new Error("That ride is no longer available.");
    }

    const limits = await bookingLimits(ctx);
    const carried = await activeRidesFor(ctx, userId);

    // How far the new pickup sits off the route the rider is already running.
    // Only meaningful once they are carrying something.
    const detourKm =
      carried.length === 1
        ? distanceToSegmentKm(
            ride.pickup,
            carried[0].pickup,
            carried[0].destination,
          )
        : null;

    if (!canTakeAnotherRide({ carried: carried.length, detourKm, limits })) {
      if (carried.length >= limits.maxConcurrentRides) {
        throw new Error(
          limits.maxConcurrentRides === 1
            ? "You can only run one ride at a time. Finish this one first."
            : `You already have ${carried.length} active rides (max ${limits.maxConcurrentRides}). Finish one to take another.`,
        );
      }
      throw new Error(
        `That pickup is ${detourKm!.toFixed(1)} km off your current route (max ${limits.maxSecondRideDetourKm} km).`,
      );
    }

    const now = Date.now();
    const patch: Partial<Doc<"rides">> = {
      riderId: userId,
      status: "ACCEPTED",
      acceptedAt: now,
    };
    await ctx.db.patch(ride._id, patch);

    await notify(ctx, {
      userId: ride.commuterId,
      type: "ride_accepted",
      title: `${rider.name} accepted your ride`,
      body: `${rider.vehicle.make} ${rider.vehicle.model} · ${rider.vehicle.plate} is on the way.`,
      rideId: ride._id,
    });
    await postSystemLine(ctx, { ...ride, ...patch }, "ACCEPTED");

    return ride._id;
  },
});

/**
 * A rider turns a request down.
 *
 * Records the refusal on the ride rather than deleting or hiding anything, so
 * the request stays open for every other rider and the same one is not offered
 * it again. This is the server half of the auto-reject timer: when the
 * fifteen-second window closes with no tap, the client calls this, so a rider
 * who walks away from their phone is not still shown a request an hour later.
 *
 * Only meaningful before anyone has accepted, and never throws for a ride that
 * has since been taken — the rider tapping "no" at the same instant as another
 * rider taps "yes" is a normal race, not an error, and the losing tap must not
 * surface as a failure toast.
 */
export const rejectRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) return { rejected: false };
    // Someone else is already driving this person. Nothing to record.
    if (ride.riderId) return { rejected: false };
    const already = ride.rejectedBy ?? [];
    if (already.includes(userId)) return { rejected: false };
    await ctx.db.patch(ride._id, { rejectedBy: [...already, userId] });
    return { rejected: true };
  },
});

/**
 * The fifteen-second window closed without an answer.
 *
 * Not a rejection, and that is the whole point of it being a separate mutation.
 * `rejectRide` records a decision and the request is gone from this rider for
 * good; calling it on expiry meant a rider who was mid-junction, or whose phone
 * rang, silently lost that booking permanently — while the passenger kept
 * waiting for somebody who had shown every sign of wanting it.
 *
 * This records only that the *pop-up* has been seen, so the rider is not
 * interrupted by the same request again. `nearbyRequests` still returns the
 * request with `expiredForYou`, and the rider can take it from the list in one
 * tap whenever they are free.
 */
export const passRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) return { passed: false };
    // Somebody else is already driving this person. Nothing to remember.
    if (ride.riderId) return { passed: false };
    const already = ride.passedBy ?? [];
    if (already.includes(userId)) return { passed: false };
    await ctx.db.patch(ride._id, { passedBy: [...already, userId] });
    return { passed: true };
  },
});

/**
 * The rider corrects the "Buy from" pin. Customers drop the nearest landmark far
 * more often than they drop the shop entrance, and the rider is the one who
 * knows where the goods actually are.
 *
 * The rider fixes the route but not the deal: the corrected leg is repriced as
 * an errand and then clamped by clampStoreFare, so the rider is never left short
 * of a fair errand fee and the commuter is never surprised by more than the
 * band in MAX_STORE_REPRICE_RATIO. Only allowed before the goods are picked up.
 */
export const confirmStore = mutation({
  args: { rideId: v.id("rides"), store: point },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.riderId !== userId) {
      throw new Error("This ride is not assigned to you.");
    }
    if (ride.bookingType !== "pabili") {
      throw new Error("Only pabili orders have a store to correct.");
    }
    if (ride.status !== "ACCEPTED" && ride.status !== "RIDER_ARRIVING") {
      throw new Error(
        "You can only correct the store before you pick the goods up.",
      );
    }
    if (!isValidLatLng(args.store)) {
      throw new Error("That store location is invalid.");
    }

    const legKm = haversineKm(args.store, ride.destination);
    if (legKm > 500) throw new Error("That store is too far away.");

    const quotedFare = ride.quotedFare ?? ride.fare;
    const tariff = await ensureActiveTariff(ctx);
    const distanceKm = Math.round(legKm * 100) / 100;
    const fare = clampStoreFare(computeErrandFare(legKm, tariff), quotedFare);

    await ctx.db.patch(ride._id, {
      // Keep the first pin so the receipt can show what was originally asked.
      originalPickup: ride.originalPickup ?? ride.pickup,
      pickup: args.store,
      distanceKm,
      fare,
      storeConfirmedAt: Date.now(),
    });

    const peso = (n: number) => `₱${n.toFixed(2)}`;
    const raised = fare > quotedFare;
    const capPct = Math.round((MAX_STORE_REPRICE_RATIO - 1) * 100);
    await notify(ctx, {
      userId: ride.commuterId,
      type: "ride_store_corrected",
      title: "Your rider corrected the store",
      body: raised
        ? `Store set to ${args.store.address ?? "a new pin"} on ${ride.code}. Service fee ${peso(quotedFare)} → ${peso(fare)} (capped at +${capPct}%).`
        : `Store set to ${args.store.address ?? "a new pin"} on ${ride.code}. Your service fee stays ${peso(fare)}.`,
      rideId: ride._id,
    });

    return { distanceKm, fare };
  },
});

/** Rider advances the ride through validated states. */
export const updateRideStatus = mutation({
  args: {
    rideId: v.id("rides"),
    status: v.union(
      v.literal("RIDER_ARRIVING"),
      v.literal("RIDER_ARRIVED"),
      v.literal("IN_PROGRESS"),
      v.literal("COMPLETED"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.riderId !== userId) {
      throw new Error("This ride is not assigned to you.");
    }

    const allowed = RIDER_TRANSITIONS[ride.status] ?? [];
    if (!allowed.includes(args.status)) {
      throw new Error(`Cannot move a ${ride.status} ride to ${args.status}.`);
    }

    const now = Date.now();
    const patch: Partial<Doc<"rides">> = { status: args.status };
    if (args.status === "IN_PROGRESS") patch.startedAt = now;
    if (args.status === "COMPLETED") patch.completedAt = now;
    await ctx.db.patch(ride._id, patch);
    await postSystemLine(ctx, { ...ride, ...patch }, args.status);

    const messages: Record<string, [string, string]> = {
      RIDER_ARRIVING: ["Your rider is on the way", "Track them live on the map."],
      RIDER_ARRIVED: ["Your rider has arrived", "Meet your rider at the pickup point."],
      IN_PROGRESS: ["Ride started", "You are on your way to the destination."],
      COMPLETED: ["Ride completed", `Final fare: ₱${ride.fare.toFixed(2)}`],
    };
    const [title, body] = messages[args.status];
    await notify(ctx, {
      userId: ride.commuterId,
      type: `ride_${args.status.toLowerCase()}`,
      title,
      body,
      rideId: ride._id,
    });
  },
});

/** Either party can cancel, within the rules for their role. */
export const cancelRide = mutation({
  args: { rideId: v.id("rides"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found.");
    if (!isActive(ride.status)) throw new Error("This ride is already finished.");

    const isCommuter = ride.commuterId === userId;
    const isRider = ride.riderId === userId;
    if (!isCommuter && !isRider) {
      throw new Error("You cannot cancel this ride.");
    }
    if (ride.status === "IN_PROGRESS") {
      throw new Error("A ride in progress cannot be cancelled.");
    }
    if (isCommuter && !CANCELLABLE_BY_COMMUTER.includes(ride.status)) {
      throw new Error("This ride can no longer be cancelled.");
    }

    await ctx.db.patch(ride._id, {
      status: "CANCELLED",
      cancelledAt: Date.now(),
      cancelledBy: isCommuter ? "commuter" : "rider",
      cancelReason: args.reason?.slice(0, 200),
    });
    await postSystemLine(ctx, ride, "CANCELLED");

    const otherParty = isCommuter ? ride.riderId : ride.commuterId;
    if (otherParty) {
      await notify(ctx, {
        userId: otherParty,
        type: "ride_cancelled",
        title: "Ride cancelled",
        body: `Ride ${ride.code} was cancelled by the ${isCommuter ? "commuter" : "rider"}.`,
        rideId: ride._id,
      });
    }
  },
});

/** Enrich a ride with the counterparty info the current viewer is allowed to see. */
/**
 * A rider's star rating, averaged across every trip they have finished.
 *
 * Read at display time rather than denormalised onto the rider row: a rating is
 * written once per completed ride, in a different mutation, by a different
 * person from the one who will read it. Keeping the average derived means a
 * commuter can never be shown a stale score that a backfill would have to
 * repair.
 */
async function riderRating(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{ avg: number; count: number } | null> {
  const rows = await ctx.db
    .query("ratings")
    .withIndex("by_target", (q) => q.eq("targetId", userId))
    .take(MAX_RATING_SCAN);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  return {
    avg: Math.round((total / rows.length) * 10) / 10,
    count: rows.length,
  };
}

/** How many ratings back a rider's average. A cap keeps the query bounded. */
const MAX_RATING_SCAN = 500;

async function enrich(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  ride: Doc<"rides">,
) {
  const role = ride.commuterId === userId ? "commuter" : "rider";
  // Who is riding, answered once for both roles. The rider needs it to know
  // whom to call at the pickup; the booker needs it to see who they booked for.
  const passenger = await ridePassenger(ctx, ride);

  if (role === "commuter") {
    if (!ride.riderId) {
      return { role, ride, passenger, counterparty: null, riderLocation: null };
    }
    const rider = await getRider(ctx, ride.riderId);
    const profile = await getProfile(ctx, ride.riderId);
    if (!rider) {
      return { role, ride, passenger, counterparty: null, riderLocation: null };
    }
    const photoUrl = profile?.photoId
      ? await ctx.storage.getUrl(profile.photoId)
      : null;
    const rating = await riderRating(ctx, ride.riderId);
    return {
      role,
      ride,
      passenger,
      counterparty: {
        name: profile?.name ?? rider.name,
        phone: rider.phone,
        vehicle: rider.vehicle,
        // A face and a score are what turn "a driver" into "this driver", and
        // both are the rider's own profile data — nothing here is inferred
        // from the trip.
        photoUrl,
        rating,
      },
      riderLocation:
        rider.lat != null && rider.lng != null
          ? {
              lat: rider.lat,
              lng: rider.lng,
              at: rider.lastLocationAt ?? 0,
              heading: rider.heading ?? null,
            }
          : null,
    };
  }

  const profile = await getProfile(ctx, ride.commuterId);
  return {
    role,
    ride,
    passenger,
    counterparty: profile ? { name: profile.name, phone: profile.phone } : null,
    // The rider carrying somebody is the one person who needs to know who to
    // call. It is attached to the live ride, so it cannot leak into a past
    // receipt or reach a rider who is not on this trip.
    emergency:
      profile?.emergencyName && profile?.emergencyPhone
        ? { name: profile.emergencyName, phone: profile.emergencyPhone }
        : null,
    riderLocation: null,
  };
}

/** The single live ride for the signed-in user, if any. */
export const getActiveRide = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const commuterRides = await ctx.db
      .query("rides")
      .withIndex("by_commuter", (q) => q.eq("commuterId", userId))
      .order("desc")
      .take(5);
    const asCommuter = commuterRides.find((r) => isActive(r.status));
    if (asCommuter) return await enrich(ctx, userId, asCommuter);

    const riderRides = await ctx.db
      .query("rides")
      .withIndex("by_rider", (q) => q.eq("riderId", userId))
      .order("desc")
      .take(5);
    const asRider = riderRides.find((r) => isActive(r.status));
    if (asRider) return await enrich(ctx, userId, asRider);

    return null;
  },
});

/**
 * Every live ride assigned to the signed-in rider. Riders can carry up to
 * MAX_CONCURRENT_RIDES at once, oldest first so the primary ride stays on top.
 */
export const listActiveRides = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rides = await activeRidesFor(ctx, userId);
    rides.sort(
      (a, b) => (a.acceptedAt ?? a.requestedAt) - (b.acceptedAt ?? b.requestedAt),
    );
    return await Promise.all(rides.map((ride) => enrich(ctx, userId, ride)));
  },
});

/** A single ride with its recorded GPS trail. */
export const getRide = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride) return null;
    if (ride.commuterId !== userId && ride.riderId !== userId) {
      throw new Error("You do not have access to this ride.");
    }
    const trail = await ctx.db
      .query("rideLocations")
      .withIndex("by_ride", (q) => q.eq("rideId", ride._id))
      .order("asc")
      .take(500);
    return { ...(await enrich(ctx, userId, ride)), trail };
  },
});

/** Ride history for the signed-in user. */
export const listMyRides = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) return [];

    const rides =
      profile.role === "rider"
        ? await ctx.db
            .query("rides")
            .withIndex("by_rider", (q) => q.eq("riderId", userId))
            .order("desc")
            .take(50)
        : await ctx.db
            .query("rides")
            .withIndex("by_commuter", (q) => q.eq("commuterId", userId))
            .order("desc")
            .take(50);

    return rides;
  },
});

/** How many completed rides the earnings summary looks back over. */
const EARNINGS_SCAN = 200;

/**
 * The platform's cut of a completed ride's fare. **Zero: the rider collects the
 * exact amount.**
 *
 * FETCH takes no platform fee, so a finished ride pays the rider the whole fare
 * and nothing is withheld from it. The constant stays because it is what the
 * subtraction below is written against: with a rate of 0 the rider's take-home
 * is the fare itself, and if a fee is ever reintroduced it is one number here
 * and one in `src/lib/driver.ts`, which `tests/driver-flow.test.ts` keeps equal.
 */
export const RIDER_PLATFORM_RATE = 0;

/**
 * What the riders actually earned: today, this week, and in total.
 *
 * The rate is applied at read time from one constant rather than stored on each
 * ride, so removing the fee — which is what it is now, 0 — is a decision about
 * every trip at once instead of a backfill. Nothing is deducted, so each figure
 * below is the sum of the fares the rider was handed and can check against
 * their own receipts.
 *
 * Only completed rides count. A cancelled or in-progress ride is not money the
 * rider has earned, and counting it would make the number move up and then
 * disappear.
 */
export const riderEarnings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    // Gated on the server as well as on the screens. `null` rather than a throw
    // is deliberate: the trip receipt reads this query too, and a rider who is
    // suspended part-way through a ride still has to see what that one ride paid.
    // `null` drops the receipt back to its own settlement figures, while an
    // unapproved rider reads no total at all.
    const rider = await getRider(ctx, userId);
    if (!(await canOperateAsRider(ctx, rider))) return null;

    const rides = await ctx.db
      .query("rides")
      .withIndex("by_rider", (q) => q.eq("riderId", userId))
      .order("desc")
      .take(EARNINGS_SCAN);

    const now = Date.now();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = dayStart.getTime() - 6 * 24 * 60 * 60 * 1000;

    // The rider's take-home. With the platform fee removed this is the fare
    // unchanged; the multiplication is kept so the rule has one home.
    const take = (fare: number) =>
      Math.round(fare * (1 - RIDER_PLATFORM_RATE) * 100) / 100;

    let today = 0;
    let week = 0;
    let total = 0;
    let todayCount = 0;
    let weekCount = 0;
    for (const ride of rides) {
      if (ride.status !== "COMPLETED") continue;
      const at = ride.completedAt ?? ride.requestedAt;
      const net = take(ride.fare);
      total += net;
      if (at >= weekStart) {
        week += net;
        weekCount += 1;
      }
      if (at >= dayStart.getTime()) {
        today += net;
        todayCount += 1;
      }
    }

    // Rounding each ride then summing keeps the total equal to the fares listed,
    // rather than drifting by a cent or two against what the rider can see.
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      platformRate: RIDER_PLATFORM_RATE,
      today: round(today),
      todayCount,
      week: round(week),
      weekCount,
      total: round(total),
      totalCount: rides.filter((ride) => ride.status === "COMPLETED").length,
    };
  },
});
