import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireUserId, requireNonEmpty } from "./lib/auth";
import {
  activeRidesFor,
  bookingLimits,
  canOperateAsRider,
  getProfile,
  getRider,
} from "./lib/db";
import { canTakeAnotherRide } from "./lib/limits";
import { passengerFromFields } from "./lib/passenger";
import { isRiderVisibleNow } from "../lib/schedule";
import {
  distanceToSegmentKm,
  haversineKm,
  isValidLatLng,
} from "./lib/geo";

/**
 * How many open requests a rider's screen is handed at once.
 *
 * The dashboard only ever shows the nearest one prominently and a short list
 * beneath it, but each entry costs a profile read and a rating scan to enrich.
 * Six is enough to fill the screen on a busy hour and bounds the enrichment
 * work per query rather than letting a hundred open requests fan out into a
 * hundred reads.
 */
const MAX_SHOWN_REQUESTS = 6;

/** How many ratings back a rider's average when shown on a request card. */
const REQUEST_RATING_SCAN = 200;

/**
 * A passenger's average rating, if they have one.
 *
 * Riders are rated by commuters today, but the reverse is just as reachable
 * from this table — it is keyed by target, and "who is this person I am about
 * to pick up" is the same question either way.
 */
async function userRating(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ avg: number; count: number } | null> {
  const rows = await ctx.db
    .query("ratings")
    .withIndex("by_target", (q) => q.eq("targetId", userId))
    .take(REQUEST_RATING_SCAN);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  return {
    avg: Math.round((total / rows.length) * 10) / 10,
    count: rows.length,
  };
}

/** Rider record for the signed-in user (null until onboarding completes). */
export const getMyRider = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) return null;
    if (profile.role !== "rider") return null;
    return await getRider(ctx, userId);
  },
});

/** Save vehicle details. Only the rider's own record can be changed. */
export const saveVehicle = mutation({
  args: {
    make: v.string(),
    model: v.string(),
    plate: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rider = await getRider(ctx, userId);
    if (!rider) throw new Error("Rider profile not found.");
    await ctx.db.patch(rider._id, {
      vehicle: {
        make: requireNonEmpty(args.make, "Vehicle make"),
        model: requireNonEmpty(args.model, "Vehicle model"),
        plate: requireNonEmpty(args.plate, "Plate number"),
        color: requireNonEmpty(args.color, "Vehicle color"),
      },
    });
  },
});

/**
 * Toggle availability. Riders may not go offline while a ride is in progress,
 * because the commuter is actively tracking them.
 */
export const setOnline = mutation({
  args: { isOnline: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("Complete your profile first.");
    if (profile.status !== "active") {
      throw new Error("Your account is suspended.");
    }
    const rider = await getRider(ctx, userId);
    if (!rider) throw new Error("Rider profile not found.");
    if (!(await canOperateAsRider(ctx, rider))) {
      throw new Error("Your rider account is awaiting approval.");
    }
    if (!args.isOnline) {
      const carried = await activeRidesFor(ctx, userId);
      if (carried.length > 0) {
        throw new Error("Finish or cancel your active rides first.");
      }
    }
    if (args.isOnline && rider.vehicle.make === "—") {
      throw new Error("Add your vehicle details before going online.");
    }

    const wasOnline = rider.isOnline;
    await ctx.db.patch(rider._id, { isOnline: args.isOnline });

    // Keep the shift book: opening a session on the way online, closing it on
    // the way off. Guarded on the previous value so a double-tap or a retried
    // mutation cannot stack two open sessions, which would double-count the
    // rider's online hours for the rest of the day.
    const now = Date.now();
    if (args.isOnline && !wasOnline) {
      await ctx.db.insert("driverSessions", {
        driverId: userId,
        startedAt: now,
      });
    } else if (!args.isOnline && wasOnline) {
      const open = await ctx.db
        .query("driverSessions")
        .withIndex("by_driver", (q) => q.eq("driverId", userId))
        .order("desc")
        .first();
      if (open && open.endedAt == null) {
        await ctx.db.patch(open._id, { endedAt: now });
      }
    }
  },
});

/**
 * Streaming GPS. Only online riders report positions. Writes are throttled by a
 * distance/time threshold so we do not hammer the database every tick.
 */
export const updateLocation = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    /**
     * Compass heading in degrees clockwise from north.
     *
     * Optional and validated rather than trusted: the value comes from the
     * browser, and a `heading` of 400 or NaN would spin the commuter’s car
     * marker to a random angle for as long as the ride lasts. An absent or
     * unusable heading leaves the previous one alone, so a device that reports
     * a bearing only sometimes still shows a correct car on the good frames.
     */
    heading: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!isValidLatLng(args)) throw new Error("Invalid location.");
    const rider = await getRider(ctx, userId);
    if (!rider || !rider.isOnline) return { skipped: true };

    const now = Date.now();
    const movedKm = rider.lat != null && rider.lng != null
      ? haversineKm({ lat: rider.lat, lng: rider.lng }, args)
      : Infinity;
    const staleFor = now - (rider.lastLocationAt ?? 0);
    const heading =
      typeof args.heading === "number" &&
      Number.isFinite(args.heading) &&
      args.heading >= 0 &&
      args.heading < 360
        ? args.heading
        : undefined;

    // Keep the live marker fresh but avoid pointless writes. A heading change on
    // its own is worth a write even at the same spot: a rider turning in place
    // has not moved a metre and still needs the car on the map to swing round.
    const turned =
      heading !== undefined &&
      (rider.heading == null ||
        Math.abs(((heading - rider.heading + 540) % 360) - 180) > 15);
    if (movedKm > 0.01 || staleFor > 5000 || turned) {
      await ctx.db.patch(rider._id, {
        lat: args.lat,
        lng: args.lng,
        lastLocationAt: now,
        ...(heading !== undefined ? { heading } : {}),
      });
    }

    // Append a track point for every live ride (lower frequency than the
    // marker). A rider can be running two rides at once, so this is a loop.
    const carried = await activeRidesFor(ctx, userId);
    for (const ride of carried) {
      const lastPoint = await ctx.db
        .query("rideLocations")
        .withIndex("by_ride", (q) => q.eq("rideId", ride._id))
        .order("desc")
        .first();
      const movedFromPoint =
        lastPoint != null
          ? haversineKm({ lat: lastPoint.lat, lng: lastPoint.lng }, args)
          : Infinity;
      if (movedFromPoint > 0.03 || now - (lastPoint?.at ?? 0) > 20000) {
        await ctx.db.insert("rideLocations", {
          rideId: ride._id,
          riderId: userId,
          lat: args.lat,
          lng: args.lng,
          at: now,
        });
      }
    }

    return { skipped: false };
  },
});

/**
 * Booking limits the rider UI needs, so the client never hardcodes them. These
 * are the live Super Admin settings, not the shipped defaults.
 */
export const getBookingPolicy = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await bookingLimits(ctx);
  },
});

/**
 * Open ride requests the rider can actually take. Only approved + online riders
 * browse, and a rider who is already carrying one ride only sees requests whose
 * pickup is a short detour off their current route (a double booking), so the
 * list never offers something `acceptRide` would refuse.
 */
export const nearbyRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rider = await getRider(ctx, userId);
    if (!rider) return [];
    if (!rider.isOnline || !(await canOperateAsRider(ctx, rider))) return [];

    const carried = await activeRidesFor(ctx, userId);
    const limits = await bookingLimits(ctx);
    if (carried.length >= limits.maxConcurrentRides) return [];

    const searching = await ctx.db
      .query("rides")
      .withIndex("by_status", (q) => q.eq("status", "SEARCHING"))
      .order("desc")
      .take(20);

    const origin =
      rider.lat != null && rider.lng != null
        ? { lat: rider.lat, lng: rider.lng }
        : null;

    const ranked = searching
      // A booking made for later stays out of the list until its window opens.
      // A rider who took Friday's trip on Tuesday would be driving into an
      // empty week, and the commuter would be waiting an hour past a pickup
      // that nobody was ever offered.
      .filter((ride) => isRiderVisibleNow(ride.scheduledFor, Date.now()))
      // A request this rider has already turned down is not re-offered. It
      // stays visible to every other rider; see `rejectRide`.
      .filter((ride) => !(ride.rejectedBy ?? []).includes(userId))
      .map((ride) => {
        // How far the pickup sits from the route the rider is already running.
        const detourKm = carried.length
          ? Math.min(
              ...carried.map((active) =>
                distanceToSegmentKm(
                  ride.pickup,
                  active.pickup,
                  active.destination,
                ),
              ),
            )
          : null;
        const pickupDistanceKm = origin
          ? haversineKm(origin, ride.pickup)
          : null;
        return {
          _id: ride._id,
          code: ride.code,
          commuterId: ride.commuterId,
          bookingType: ride.bookingType ?? "ride",
          items: ride.items ?? [],
          notes: ride.notes,
          hasBudget: ride.itemBudget != null,
          pickup: ride.pickup,
          destination: ride.destination,
          distanceKm: ride.distanceKm,
          fare: ride.fare,
          rideType: ride.rideType ?? "tricycle",
          etaMinutes: ride.etaMinutes,
          requestedAt: ride.requestedAt,
          pickupDistanceKm,
          detourKm,
          /** True when this would be the rider's second, on-route booking. */
          doubleBooking: carried.length >= 1 && carried.length < limits.maxConcurrentRides,
          /**
           * This rider let the fifteen-second window close on this request.
           *
           * Sent to the client rather than used to filter the row out, because
           * the answer differs by surface: the pop-up must not nag a rider who
           * was busy, but the request itself is still theirs to take. Dropping
           * the row here is what made a missed tap permanent.
           */
          expiredForYou: (ride.passedBy ?? []).includes(userId),
          /**
           * The person waiting at the pickup, and who paid for the trip when
           * that is somebody else.
           *
           * Resolved per request here rather than left to the card, because
           * this is the one screen where the two being different is dangerous:
           * a rider who accepts "Juan, booked by Ranniel" and then rings Ranniel
           * at the pickup has misunderstood the job.
           */
          passengerFields: {
            passengerType: ride.passengerType,
            passengerName: ride.passengerName,
            passengerPhone: ride.passengerPhone,
          },
        };
      })
      .filter((ride) =>
        canTakeAnotherRide({
          carried: carried.length,
          detourKm: ride.detourKm,
          limits,
        }),
      )
      .sort((a, b) => (a.pickupDistanceKm ?? Infinity) - (b.pickupDistanceKm ?? Infinity))
      .slice(0, MAX_SHOWN_REQUESTS);

    // The face and the score are what turn "a request" into "this passenger".
    // Read here rather than trusted from the client, and read for the shortlist
    // only — see MAX_SHOWN_REQUESTS for why the list is bounded first.
    return await Promise.all(
      ranked.map(async (request) => {
        const profile = await getProfile(ctx, request.commuterId);
        const photoUrl = profile?.photoId
          ? await ctx.storage.getUrl(profile.photoId)
          : null;
        const passenger = passengerFromFields(request.passengerFields, profile);
        return {
          ...request,
          // `passengerFields` is scaffolding for the resolver above, not part of
          // the answer. Left in, it would ship the same name and number twice
          // over the wire for every shortlisted request.
          passengerFields: undefined,
          // The passenger's name and number, falling back to the booker on rides
          // created before "Who is riding?" existed.
          name: passenger.name,
          phone: passenger.phone,
          bookedByName: passenger.bookedByName,
          /*
           * The face and the score belong to the *account*, so they are only
           * right beside this name when the passenger is that account.
           *
           * A "someone else" passenger has no profile at all, so showing the
           * booker's photo next to Juan's name — and worse, the booker's rating,
           * which is a judgement about a different person — describes somebody
           * who is not in the car. Null falls back to the passenger's initials,
           * which is honest.
           */
          photoUrl: passenger.isBooker ? photoUrl : null,
          rating: passenger.isBooker
            ? await userRating(ctx, request.commuterId)
            : null,
        };
      }),
    );
  },
});

/**
 * Where demand is right now, for the rider's busy-area heatmap.
 *
 * Deliberately built from *open* requests rather than from a history of
 * completed trips. Open requests are at most a handful of rows, so the query is
 * bounded and cheap; a trip history would mean scanning every ride ever taken
 * to answer a question whose whole point is "where should I be in the next ten
 * minutes", and yesterday's market is not necessarily today's.
 *
 * Coordinates only. Turning them into a heatmap is `demandCells` on the client,
 * so the grid resolution is a rendering decision and not a round trip.
 */
export const demandHeatmap = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const open = await ctx.db
      .query("rides")
      .withIndex("by_status", (q) => q.eq("status", "SEARCHING"))
      .order("desc")
      .take(50);
    return open.map((ride) => ({
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
    }));
  },
});

/**
 * The numbers on a rider's profile card: their rating, how many trips they have
 * finished, and how long they have been online today.
 *
 * Separate from `riderEarnings` because it answers a different question — that
 * one is about money, this one is about standing — and because a driver card is
 * read on every render, so it wants to be one bounded query rather than three.
 */
export const getDriverStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rider = await getRider(ctx, userId);
    if (!rider) return null;
    // Rating, completed trips and online time are a rider's standing, so they
    // wait for approval like taking a passenger does. The `null` is the same
    // shape the missing-rider case above already returns, and every screen
    // reading this query already renders an unknown value rather than assuming
    // it is there.
    if (!(await canOperateAsRider(ctx, rider))) return null;

    const ratings = await ctx.db
      .query("ratings")
      .withIndex("by_target", (q) => q.eq("targetId", userId))
      .take(500);
    const rating =
      ratings.length > 0
        ? {
            avg:
              Math.round(
                (ratings.reduce((sum, row) => sum + row.score, 0) /
                  ratings.length) *
                  10,
              ) / 10,
            count: ratings.length,
          }
        : null;

    const completed = await ctx.db
      .query("rides")
      .withIndex("by_rider", (q) => q.eq("riderId", userId))
      .take(300);
    const completedCount = completed.filter(
      (ride) => ride.status === "COMPLETED",
    ).length;

    // Online time today, summed from the sessions table. The open session is
    // counted up to now, which is what makes the figure tick upward while the
    // rider watches it rather than only updating when they go offline.
    const now = Date.now();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const sessions = await ctx.db
      .query("driverSessions")
      .withIndex("by_driver", (q) => q.eq("driverId", userId))
      .order("desc")
      .take(50);
    let onlineMs = 0;
    for (const session of sessions) {
      const end = session.endedAt ?? now;
      const start = Math.max(session.startedAt, dayStart.getTime());
      if (end > start) onlineMs += end - start;
    }

    return {
      rating,
      completedCount,
      onlineMsToday: onlineMs,
    };
  },
});
