/**
 * Rider booking limits — the numbers behind double booking.
 *
 * Deliberately dependency-free: this module is imported by the admin
 * validation, the accept path, and the test suite, so it must stay pure.
 */

/**
 * Riders may take a second booking while the first is still running, as long as
 * the new pickup is a short detour off the route they are already on.
 *
 * These are only the defaults. The Super Admin sets the live values in
 * `settings`; see bookingLimits() in lib/db.
 */
export const DEFAULT_MAX_CONCURRENT_RIDES = 2;
export const DEFAULT_MAX_SECOND_RIDE_DETOUR_KM = 4;

/** Hard ceiling the admin console enforces on the concurrency limit. */
export const MAX_CONCURRENT_RIDES_CEILING = 5;

/** Widest detour tolerance an admin may set, in km. */
export const MAX_SECOND_RIDE_DETOUR_CEILING_KM = 100;

export type BookingLimits = {
  /** How many live rides one rider may hold at once. */
  maxConcurrentRides: number;
  /** How far off their current route a second pickup may sit, in km. */
  maxSecondRideDetourKm: number;
};

export const DEFAULT_BOOKING_LIMITS: BookingLimits = {
  maxConcurrentRides: DEFAULT_MAX_CONCURRENT_RIDES,
  maxSecondRideDetourKm: DEFAULT_MAX_SECOND_RIDE_DETOUR_KM,
};

/**
 * Validates what a Super Admin submitted. Throws with the same message the
 * mutation shows the admin, so the rules live in exactly one place.
 *
 * Concurrency is a whole number of jobs; detour tolerance may be fractional,
 * because a tight 2.5 km is a legitimate setting for a dense market.
 */
export function normalizeBookingLimits(input: {
  maxConcurrentRides: number;
  maxSecondRideDetourKm: number;
}): BookingLimits {
  if (
    !Number.isFinite(input.maxConcurrentRides) ||
    !Number.isInteger(input.maxConcurrentRides) ||
    input.maxConcurrentRides < 1 ||
    input.maxConcurrentRides > MAX_CONCURRENT_RIDES_CEILING
  ) {
    throw new Error(
      `Rides per rider must be a whole number between 1 and ${MAX_CONCURRENT_RIDES_CEILING}.`,
    );
  }
  if (
    !Number.isFinite(input.maxSecondRideDetourKm) ||
    input.maxSecondRideDetourKm < 0 ||
    input.maxSecondRideDetourKm > MAX_SECOND_RIDE_DETOUR_CEILING_KM
  ) {
    throw new Error(
      `Detour tolerance must be between 0 and ${MAX_SECOND_RIDE_DETOUR_CEILING_KM} km.`,
    );
  }
  return {
    maxConcurrentRides: input.maxConcurrentRides,
    maxSecondRideDetourKm:
      Math.round(input.maxSecondRideDetourKm * 100) / 100,
  };
}

/**
 * Resolves the live limits from raw settings values, falling back to the
 * shipped defaults whenever a key is missing or holds the wrong type. Mirrors
 * what bookingLimits() reads out of the database.
 */
export function limitsFromSettings(values: {
  maxConcurrentRides?: unknown;
  maxSecondRideDetourKm?: unknown;
}): BookingLimits {
  const concurrency =
    typeof values.maxConcurrentRides === "number" &&
    Number.isFinite(values.maxConcurrentRides)
      ? values.maxConcurrentRides
      : DEFAULT_MAX_CONCURRENT_RIDES;
  const detour =
    typeof values.maxSecondRideDetourKm === "number" &&
    Number.isFinite(values.maxSecondRideDetourKm)
      ? values.maxSecondRideDetourKm
      : DEFAULT_MAX_SECOND_RIDE_DETOUR_KM;
  return { maxConcurrentRides: concurrency, maxSecondRideDetourKm: detour };
}

/**
 * Whether a rider may take one more job: they are under the concurrency limit,
 * and if they already carry rides, the new pickup is within the detour
 * tolerance of the route they are running.
 */
export function canTakeAnotherRide(args: {
  carried: number;
  detourKm: number | null;
  limits: BookingLimits;
}): boolean {
  if (args.carried >= args.limits.maxConcurrentRides) return false;
  if (args.carried === 0 || args.detourKm == null) return true;
  return args.detourKm <= args.limits.maxSecondRideDetourKm;
}