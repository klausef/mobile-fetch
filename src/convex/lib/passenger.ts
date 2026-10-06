/**
 * Who is actually riding a ride.
 *
 * One place answers this, because the two sides of the trip need it to agree.
 * The rider has to know whose name goes on the call button at the pickup point,
 * and the booker has to see who the money was spent on. If those two were
 * computed separately they would drift, and the worst version of that drift is
 * the rider standing at a pickup ringing the person who *paid* while somebody
 * else waits.
 *
 * ── Backward compatibility ──────────────────────────────────────────────────
 * Rides created before "Who is riding?" existed have no `passengerType`. They
 * are treated as "self", which is exactly what was true of every one of them:
 * there was only ever the booker on the ride. Nothing old changes meaning and
 * no record is rewritten.
 *
 * This module is shared by `rides.ts` (the live ride screens) and `riders.ts`
 * (the request list a rider accepts from), and is deliberately free of fare,
 * geo and notification logic so neither of them has to import the other.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getProfile } from "./db";

export type Ctx = QueryCtx | MutationCtx;

/** Which of the two shapes a ride's passenger has. */
export type PassengerType = "self" | "other";

/** The passenger, as the two sides of the trip need to see them. */
export type RidePassenger = {
  type: PassengerType;
  name: string;
  phone: string;
  /**
   * The booker's name, set only when the passenger is somebody else.
   *
   * The rider needs this to answer "who am I collecting?" when the two differ,
   * and null is the honest value when they do not — an empty string would read
   * as a person with a blank name.
   */
  bookedByName: string | null;
  /** True when the passenger's Fetch account is the booker's own. */
  isBooker: boolean;
};

/** Reads the passenger off a ride, falling back to the booker on old rows. */
export async function ridePassenger(
  ctx: Ctx,
  ride: Doc<"rides">,
): Promise<RidePassenger> {
  const bookerProfile = await getProfile(ctx, ride.commuterId);
  return passengerFromFields(ride, bookerProfile);
}

/**
 * The same answer, from the fields alone plus the booker's name.
 *
 * Split out so a caller that has *already* loaded the booker profile — the
 * rider's request list loads it for the avatar and the rating — does not read it
 * twice just to ask who is riding. `bookerProfile` is optional because the only
 * thing it is needed for is the fallback for rides that predate the field.
 */
export function passengerFromFields(
  ride: {
    passengerType?: PassengerType;
    passengerName?: string;
    passengerPhone?: string;
  },
  bookerProfile?: { name?: string; phone?: string } | null,
): RidePassenger {
  const bookerName = bookerProfile?.name?.trim() || "the booker";

  // Absent on every ride predating the field, and "other" is the only value
  // that can bring its own identity — so anything else means the booker rode it.
  if (ride.passengerType !== "other") {
    // Prefer the stored snapshot: it is what the rider agreed to at request
    // time. Fall back to the live profile only for old rows that have none.
    const name = ride.passengerName?.trim() || bookerProfile?.name?.trim();
    return {
      type: "self",
      name: name || "Passenger",
      phone: ride.passengerPhone || bookerProfile?.phone || "",
      bookedByName: null,
      isBooker: true,
    };
  }

  return {
    type: "other",
    // Never empty: a passenger with no name is unreachable and unreadable, so
    // an incomplete row falls back to something the rider can still act on.
    name: ride.passengerName?.trim() || "Passenger",
    phone: ride.passengerPhone || "",
    bookedByName: bookerName,
    isBooker: false,
  };
}

/**
 * What the booker is told when a ride is accepted.
 *
 * "Your ride is confirmed." when they are riding it themselves, and names the
 * passenger when they are not — because "confirmed" on its own is the reply to
 * the wrong question when the person waiting at the pickup is somebody else.
 */
export function acceptanceLine(passenger: RidePassenger): string {
  return passenger.isBooker
    ? "Your ride is confirmed."
    : `Your ride is booked for ${passenger.name}.`;
}

/** The rider's own id for a ride's passenger account, when they have one. */
export function passengerUserId(ride: Doc<"rides">): Id<"users"> | null {
  if (ride.passengerType === "other") return null;
  return ride.passengerUserId ?? ride.commuterId;
}