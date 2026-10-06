import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

/**
 * FETCH product roles.
 *
 * `admin` is the Super Admin: the single account that controls the tariff and
 * approves riders. It is not self-service — it is granted automatically to the
 * reserved owner address by `profiles.ensureAdminProfile`, and never through
 * onboarding.
 */
export const FETCH_ROLE = v.union(
  v.literal("commuter"),
  v.literal("rider"),
  v.literal("admin"),
);
export type FetchRole = Infer<typeof FETCH_ROLE>;

/**
 * What the commuter is asking for.
 *
 * `ride`   — take me from A to B.
 * `pabili` — buy this at the store and bring it to me ("palit" = to buy).
 * `padala` — pick this item up from A and deliver it to B ("padala" = to send).
 *
 * Both errand types are the local "pasugo" service: a rider runs the errand
 * on the commuter's behalf. They share the ride lifecycle, so only the request
 * payload and the receipt differ.
 */
export const BOOKING_TYPE = v.union(
  v.literal("ride"),
  v.literal("pabili"),
  v.literal("padala"),
);
export type BookingType = Infer<typeof BOOKING_TYPE>;

/** One line of a pasugo shopping list. */
export const errandItem = v.object({
  name: v.string(),
  qty: v.number(),
  note: v.optional(v.string()),
});

export const RIDE_STATUS = v.union(
  v.literal("SEARCHING"),
  v.literal("ACCEPTED"),
  v.literal("RIDER_ARRIVING"),
  v.literal("RIDER_ARRIVED"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED"),
);
export type RideStatus = Infer<typeof RIDE_STATUS>;

/**
 * The vehicle class a ride was booked as.
 *
 * Separate from {@link BOOKING_TYPE} on purpose: that is what the rider is being
 * asked to *do* (drive, shop, collect), this is what they *arrive in*. A
 * pasugo can be fetched by a tricycle and a sedan ride can be an XL, so
 * collapsing the two would need a separate name for every combination.
 *
 * Absent on every ride created before ride types existed, which is exactly what
 * to assume: those were priced on the base tariff with no vehicle class.
 */
export const RIDE_TYPE = v.union(
  v.literal("motorcycle"),
  v.literal("tricycle"),
  v.literal("car"),
  v.literal("van"),
);
export type RideType = Infer<typeof RIDE_TYPE>;

/**
 * The quoted fare, line by line, frozen at request time.
 *
 * Stored rather than recomputed on demand for the same reason the tariff is
 * snapshotted: a receipt that can change what it says after the fact is not a
 * receipt. It is also what a dispute is settled against — "your rider was
 * charged ₱147" is answerable from the four numbers here without trusting
 * either party's arithmetic.
 *
 * Absent on rides created before the breakdown existed.
 */
export const fareBreakdownDoc = v.object({
  baseFare: v.number(),
  distanceFee: v.number(),
  stopFee: v.number(),
  surgeFee: v.number(),
  tax: v.number(),
  total: v.number(),
  taxRatePct: v.number(),
});

export const RIDER_APPROVAL = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("SUSPENDED"),
  v.literal("REJECTED"),
);

const latLng = v.object({
  lat: v.number(),
  lng: v.number(),
  address: v.optional(v.string()),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      /**
       * When the console suspended this account, and why.
       *
       * On the account rather than on the rider row, because a commuter can be
       * suspended too and a suspension that only exists for drivers is a
       * suspension somebody has to work around rather than obey. `undefined`
       * means never suspended — the common case, and the reason it is not a
       * boolean that defaults to false.
       */
      suspendedAt: v.optional(v.number()),
      suspendedReason: v.optional(v.string()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    /** One profile per authenticated FETCH user (commuter or rider). */
    profiles: defineTable({
      userId: v.id("users"),
      role: FETCH_ROLE,
      name: v.string(),
      phone: v.string(),
      status: v.union(v.literal("active"), v.literal("suspended")),
      /**
       * Who to call if this account cannot be reached mid-trip. Shown to the
       * rider only while they are actually carrying the person, never on a
       * past receipt and never to another rider.
       */
      emergencyName: v.optional(v.string()),
      emergencyPhone: v.optional(v.string()),
      /**
       * The profile picture, as a Convex file storage id. Kept here rather than
       * on `users.image` because `users` belongs to Convex Auth — writing our
       * own column on it couples the app to auth internals, and a future auth
       * upgrade is not the moment to find out that a photo upload overwrote
       * something.
       */
      photoId: v.optional(v.id("_storage")),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_phone", ["phone"])
      .index("by_role", ["role"]),

    /** Rider-specific state. Created lazily when a rider completes onboarding. */
    riders: defineTable({
      userId: v.id("users"),
      name: v.string(),
      phone: v.string(),
      approval: RIDER_APPROVAL,
      isOnline: v.boolean(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      /**
       * Which way the rider is facing, in degrees clockwise from north.
       *
       * Optional because the browser Geolocation API only reports a heading when
       * the device has one to report: a phone held still, or a laptop, sends
       * `null` for the whole session. It is stored rather than derived because
       * it cannot be derived — the geometry between two fixes says how far the
       * rider moved, not which way the vehicle is pointing, and a car reversing
       * out of a gate has no bearing in the position history at all.
       */
      heading: v.optional(v.number()),
      lastLocationAt: v.optional(v.number()),
      vehicle: v.object({
        make: v.string(),
        model: v.string(),
        plate: v.string(),
        color: v.string(),
      }),
      // Super Admin review trail.
      reviewedAt: v.optional(v.number()),
      reviewedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      // A rider can carry more than one ride, so there is no single
      // "currentRideId" pointer here: live rides are derived from `rides`.
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_online", ["isOnline"])
      .index("by_approval", ["approval"]),

    /** A single ride request and its lifecycle. */
    rides: defineTable({
      code: v.string(),
      commuterId: v.id("users"),
      riderId: v.optional(v.id("users")),
      status: RIDE_STATUS,
      // Absent on rows created before pasugo existed; treat as "ride".
      bookingType: v.optional(BOOKING_TYPE),
      pickup: latLng,
      destination: latLng,
      // Pasugo payload. `items` is required for pabili and padala.
      items: v.optional(v.array(errandItem)),
      /** Cash the commuter commits up front to cover the purchase. */
      itemBudget: v.optional(v.number()),
      /** What the rider actually spent, reported back for reimbursement. */
      itemCostActual: v.optional(v.number()),
      notes: v.optional(v.string()),
      recipientName: v.optional(v.string()),
      recipientPhone: v.optional(v.string()),
      /**
       * Who is actually taking this ride.
       *
       * `commuterId` above is the *booker* — the Fetch account that paid and
       * that gets the notifications. That is usually the same person, which is
       * exactly why the two used to be indistinguishable: a commuter can book
       * for somebody who has no Fetch account at all, and the rider picking the
       * job up needs to reach the person who will actually be standing at the
       * pickup point.
       *
       * Every field here is optional so that rides created before "Who is
       * riding?" existed still load. A ride with no `passengerType` is treated
       * as "self" — the booker rode it themselves — which is what was true of
       * every ride before this field, so nothing old changes meaning.
       */
      passengerType: v.optional(
        v.union(v.literal("self"), v.literal("other")),
      ),
      /**
       * The passenger's Fetch account, when they have one. Set only for "self";
       * "someone else" does not require an account, so this is absent rather
       * than pointing at the booker.
       */
      passengerUserId: v.optional(v.id("users")),
      /**
       * The passenger's name and number, snapshotted at request time.
       *
       * Snapshot rather than a live read of a profile: the passenger may have
       * no profile at all, and the rider needs the number that was given when
       * the job was posted, not a profile edited a week later.
       */
      passengerName: v.optional(v.string()),
      passengerPhone: v.optional(v.string()),
      distanceKm: v.number(),
      fare: v.number(),
      /**
       * The vehicle the commuter booked, absent on pre-ride-type rides.
       * Snapshotted because the fare depends on it and the breakdown below has
       * to stay readable years later.
       */
      rideType: v.optional(RIDE_TYPE),
      /**
       * What the commuter was shown, line by line, at request time. Absent on
       * older rides, which only ever had a single `fare` number.
       */
      fareBreakdown: v.optional(fareBreakdownDoc),
      /**
       * The demand multiplier this ride was priced under. 1 means no surge.
       *
       * Stored so a later surge — or a rider complaining about it — can be
       * checked against what was actually in force at request time rather than
       * against what the platform looks like now.
       */
      surgeMultiplier: v.optional(v.number()),
      /** Trip time quoted for this ride, in whole minutes. Display, not a promise. */
      etaMinutes: v.optional(v.number()),
      // Tariff snapshot: future tariff edits must never change old rides.
      tariffId: v.optional(v.id("tariffs")),
      minFareSnapshot: v.number(),
      includedDistanceSnapshot: v.number(),
      ratePerKmSnapshot: v.number(),
      // Errand terms, snapshotted for pasugo rides only.
      errandMinFareSnapshot: v.optional(v.number()),
      stopFeeSnapshot: v.optional(v.number()),
      /**
       * The fare the commuter agreed to. `fare` is the live amount: a rider who
       * corrects a pabili store pin can move it, but only within a capped band,
       * so this stays as the reference for the receipt.
       */
      quotedFare: v.optional(v.number()),
      /**
       * How this fare is settled. Absent on every ride created before online
       * payment existed, which is exactly what to assume: those were cash.
       *
       * The Super Admin owns a platform-wide toggle for this. A ride records
       * the method it was actually created with rather than reading the
       * toggle at payment time, so a ride that was agreed in cash is still a
       * cash ride after the toggle is switched on, and vice versa.
       */
      paymentMethod: v.optional(v.union(v.literal("cash"), v.literal("online"))),
      /**
       * The provider's own id for an online payment, once one exists. Absent
       * for cash rides and for online rides that have not been charged yet.
       */
      paymentRef: v.optional(v.string()),
      paidAt: v.optional(v.number()),
      /** The commuter confirmed a store/pickup pin close to the drop-off. */
      storePinConfirmed: v.optional(v.boolean()),
      /** Set once the assigned rider corrects the "Buy from" pin. */
      storeConfirmedAt: v.optional(v.number()),
      originalPickup: v.optional(latLng),
      requestedAt: v.number(),
      acceptedAt: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      cancelReason: v.optional(v.string()),
      cancelledBy: v.optional(v.string()),
      /**
       * When the commuter wants to be picked up, for a booking made ahead of
       * time. Absent means "now", which is every ride booked without choosing a
       * time — so this is optional rather than a default of 0.
       *
       * The ride still starts life as SEARCHING, but riders are not shown it
       * until the window opens: a request for Friday morning has no business in
       * Tuesday's request list, and a rider who took it early would be driving
       * an empty week.
       */
      scheduledFor: v.optional(v.number()),
      /**
       * Riders who have already turned this request down.
       *
       * A rejection has to *stick*, and it has to stick per rider: a shared
       * "rejected" flag would hide a request from every rider because one of
       * them said no, and no flag at all would re-offer the same passenger to
       * the same rider every time their screen refreshed — which reads as a
       * broken app and, at a busy hour, as harassment.
       */
      rejectedBy: v.optional(v.array(v.id("users"))),
      /**
       * Riders whose fifteen-second window closed without an answer.
       *
       * Distinct from `rejectedBy` because the two answers mean opposite things.
       * A rejection is a decision — "not this one" — and must stick. An expiry
       * is an absence: the rider was driving, on a call, or looking at the road.
       * Filing those under `rejectedBy` meant a rider who did not tap in time
       * could never be shown that booking again, which is the same booking they
       * were busy enough to want. So an expiry hides the request from the
       * *pop-up* only; it stays in the list below it, where taking it is one tap
       * whenever the rider is free.
       */
      passedBy: v.optional(v.array(v.id("users"))),
    })
      .index("by_commuter", ["commuterId"])
      .index("by_rider", ["riderId"])
      .index("by_status", ["status"]),

    /**
     * One star rating, from the commuter about the rider on a finished ride.
     *
     * A separate table rather than a column on the ride, because a rating is
     * about the rider across every trip and a rider's average is the number
     * the console and the booking screen both need.
     */
    ratings: defineTable({
      rideId: v.id("rides"),
      /** Who left it. */
      raterId: v.id("users"),
      /** Always the rider, for now; the column keeps that from being implicit. */
      targetId: v.id("users"),
      /** 1 to 5, inclusive. Enforced on write. */
      score: v.number(),
      comment: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_ride", ["rideId"])
      .index("by_target", ["targetId"]),

    /**
     * Rider <-> commuter messages, scoped to a single ride. Append-only and
     * never edited: chat about a trip is part of that trip's record.
     */
    messages: defineTable({
      rideId: v.id("rides"),
      senderId: v.id("users"),
      /** Trimmed length on write; see MAX_MESSAGE_LENGTH in lib/chat. */
      body: v.string(),
      createdAt: v.number(),
      /**
       * Who wrote it. Absent on every row written before the timeline existed,
       * which is exactly what should be assumed: those are all chat messages.
       */
      kind: v.optional(v.union(v.literal("user"), v.literal("system"))),
    })
      .index("by_ride", ["rideId"])
      .index("by_ride_time", ["rideId", "createdAt"]),

    /**
     * How far this account has read each ride's thread.
     *
     * Storing the timestamp rather than a boolean per message is what lets the
     * Chats tab carry an unread badge: a thread is unread when its newest
     * message is newer than this, and no query has to walk the messages.
     */
    chatReads: defineTable({
      userId: v.id("users"),
      rideId: v.id("rides"),
      readAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_ride", ["userId", "rideId"]),

    /**
     * A commuter has blocked a rider from their trips.
     *
     * Separate from the suspended profile: a block is private and per-rider, so
     * it never shows on the console and never stops anyone else taking rides.
     */
    blocks: defineTable({
      blockerId: v.id("users"),
      blockedId: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_blocker", ["blockerId"])
      .index("by_blocker_blocked", ["blockerId", "blockedId"]),

    /** Append-only track points written while a rider is on an active ride. */
    rideLocations: defineTable({
      rideId: v.id("rides"),
      riderId: v.id("users"),
      lat: v.number(),
      lng: v.number(),
      at: v.number(),
    }).index("by_ride", ["rideId"]),

    /**
     * One stretch of time a rider was online: the session they opened when they
     * flipped the switch, closed when they flipped it back.
     *
     * A table of its own rather than a counter on the rider row, because the
     * question a driver actually asks — "was this a worthwhile morning?" — is
     * about a *particular* shift, and a running total cannot answer it. Only
     * one row is open at a time; `endedAt` absent means still online.
     */
    driverSessions: defineTable({
      driverId: v.id("users"),
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
    }).index("by_driver", ["driverId"]),

    /** Configurable tariff. New versions are inserted; old ones are deactivated. */
    tariffs: defineTable({
      minFare: v.number(),
      includedDistanceKm: v.number(),
      ratePerKm: v.number(),
      /**
       * Long-trip band: distance at which `longTripRatePerKm` takes over, and
       * the rate beyond it. Optional on rows published before long trips were
       * priced separately — those stay on the flat rate, which is what they
       * were quoted at.
       */
      longTripThresholdKm: v.optional(v.number()),
      longTripRatePerKm: v.optional(v.number()),
      /** Pasugo floor and store-stop fee. Optional on rows seeded before errands. */
      errandMinFare: v.optional(v.number()),
      stopFee: v.optional(v.number()),
      /** Why this version exists, e.g. "fuel spike". Shown in admin history. */
      note: v.optional(v.string()),
      isActive: v.boolean(),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
    }).index("by_active", ["isActive"]),

    /**
     * Messages the Super Admin sends to everybody at once — a tariff change or
     * a hand-written notice. The row is the record the admin sees afterwards;
     * the per-user copies live in `notifications`, which is what the app
     * actually reads.
     */
    broadcasts: defineTable({
      title: v.string(),
      body: v.string(),
      kind: v.union(v.literal("announcement"), v.literal("tariff")),
      audience: v.union(
        v.literal("all"),
        v.literal("commuters"),
        v.literal("riders"),
      ),
      createdBy: v.id("users"),
      /** How many people actually received it, recorded at send time. */
      recipients: v.number(),
      createdAt: v.number(),
    }).index("by_createdAt", ["createdAt"]),

    /** In-app notifications per user. */
    notifications: defineTable({
      userId: v.id("users"),
      type: v.string(),
      title: v.string(),
      body: v.string(),
      rideId: v.optional(v.id("rides")),
      read: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_read", ["userId", "read"]),

    /** Tiny sequential counter for human-readable ride codes. */
    /**
     * A place the commuter books from often — "Home", "Work", a shop. Saved
     * under a label so re-saving the same label moves the existing pin instead
     * of piling up duplicates.
     */
    savedPlaces: defineTable({
      userId: v.id("users"),
      label: v.string(),
      point: latLng,
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    /**
     * Places this commuter has actually booked, newest first — the "recent
     * locations" list on the booking screen.
     *
     * Deliberately not `savedPlaces`. A saved place is one the commuter chose to
     * name and keep (Home, Work); a recent is what the app noticed on its own,
     * which is a different promise and a different list. Reusing one table for
     * both would mean a commuter's curated shortcut list slowly filling up with
     * every drop-off they have ever had.
     *
     * Written inside the booking itself, so it cannot drift from what actually
     * happened, and capped so it cannot grow without bound.
     */
    recentPlaces: defineTable({
      userId: v.id("users"),
      /** The address as the commuter saw it, which is also the dedupe key. */
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
      /** Bookings to this place, so a daily commute outranks a one-off. */
      uses: v.number(),
      usedAt: v.number(),
    }).index("by_user", ["userId"]),

    /**
     * Single-row platform controls the Super Admin owns: whether bookings are
     * open, how many rides a rider may hold at once, and how far off their
     * route a second pickup may sit. Absent keys fall back to shipped defaults.
     */
    settings: defineTable({
      key: v.string(),
      value: v.union(v.boolean(), v.number()),
      updatedAt: v.number(),
      updatedBy: v.optional(v.id("users")),
    }).index("by_key", ["key"]),

    counters: defineTable({
      name: v.string(),
      value: v.number(),
    }).index("by_name", ["name"]),

    /**
     * Every consequential thing an admin did, and to whom.
     *
     * Append-only, and never edited. The console is the one part of the app
     * where somebody can change another person's account, so "who suspended
     * this rider and why" has to be answerable after the fact without trusting
     * anybody's memory — including the admin's. Stored as free text plus a
     * machine-readable `action`, because the log has to be searchable by
     * "suspend" long before anyone agrees on a taxonomy.
     */
    adminLogs: defineTable({
      /** Who did it. Never deleted, even if the admin is. */
      adminId: v.id("users"),
      adminName: v.string(),
      /** Machine-readable verb: suspend, approve_rider, update_tariff, … */
      action: v.string(),
      /** Who it was done to, when there was a somebody. */
      targetId: v.optional(v.id("users")),
      targetName: v.optional(v.string()),
      /** What happened, in words a human wrote. */
      details: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_created", ["createdAt"])
      .index("by_action", ["action"])
      .index("by_admin", ["adminId"]),

    /**
     * A support conversation, opened by a user or by the console.
     *
     * A table rather than a chat message with a flag, because a ticket has a
     * lifecycle of its own — open, in progress, resolved — and a resolved
     * ticket has to stay resolvable while the conversation under it keeps
     * growing.
     */
    tickets: defineTable({
      /** Who raised it. Null when the console opened it on someone's behalf. */
      userId: v.optional(v.id("users")),
      subject: v.string(),
      status: v.optional(
        v.union(
          v.literal("OPEN"),
          v.literal("IN_PROGRESS"),
          v.literal("RESOLVED"),
        ),
      ),
      /** 1 (low) to 3 (urgent). The badge a console sorts by. */
      priority: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      /** Who is on it, so two admins do not answer the same person twice. */
      assignedTo: v.optional(v.id("users")),
      resolvedAt: v.optional(v.number()),
    })
      .index("by_status", ["status"])
      .index("by_updated", ["updatedAt"]),

    /**
     * One message in a support conversation.
     *
     * A table of its own rather than a flag on the ride-chat `messages` table,
     * because that table is scoped by `rideId` and a ticket has no ride. An
     * admin reply and a user reply are the same shape, so one renderer serves
     * both sides of the thread.
     */
    ticketMessages: defineTable({
      ticketId: v.id("tickets"),
      /** Null for an admin; the ticket's user otherwise. */
      senderId: v.optional(v.id("users")),
      /** Display name, kept so a deleted account does not blank a thread. */
      senderName: v.string(),
      /** True for the note an admin adds when resolving or rejecting. */
      fromAdmin: v.optional(v.boolean()),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_ticket", ["ticketId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
