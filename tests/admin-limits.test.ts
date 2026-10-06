/**
 * Targeted checks for the Super Admin controls added for rider booking limits
 * and the pasugo store-pin confirmation.
 *
 * Both rules used to live inline in Convex mutation handlers, where they could
 * not be exercised without a database. They now live in pure modules
 * (`lib/limits.ts` and `lib/fare.ts`) that these tests drive directly, so a
 * regression in the rules fails here rather than in production.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  canTakeAnotherRide,
  DEFAULT_BOOKING_LIMITS,
  DEFAULT_MAX_CONCURRENT_RIDES,
  DEFAULT_MAX_SECOND_RIDE_DETOUR_KM,
  limitsFromSettings,
  MAX_CONCURRENT_RIDES_CEILING,
  normalizeBookingLimits,
} from "../src/convex/lib/limits.ts";
import {
  needsStoreConfirmation,
  NEAR_STORE_KM,
} from "../src/convex/lib/fare.ts";

const LIMITS = DEFAULT_BOOKING_LIMITS;

test("shipped defaults are the double-booking behaviour we launched with", () => {
  expect(DEFAULT_MAX_CONCURRENT_RIDES).toBe(2);
  expect(DEFAULT_MAX_SECOND_RIDE_DETOUR_KM).toBe(4);
  expect(LIMITS).toEqual({
    maxConcurrentRides: 2,
    maxSecondRideDetourKm: 4,
  });
});

test("the admin console accepts the whole legal range", () => {
  for (let rides = 1; rides <= MAX_CONCURRENT_RIDES_CEILING; rides++) {
    expect(
      normalizeBookingLimits({
        maxConcurrentRides: rides,
        maxSecondRideDetourKm: 4,
      }),
    ).toEqual({ maxConcurrentRides: rides, maxSecondRideDetourKm: 4 });
  }
  // Fractional detour tolerances are legitimate for a dense market.
  expect(
    normalizeBookingLimits({
      maxConcurrentRides: 2,
      maxSecondRideDetourKm: 2.55,
    }),
  ).toEqual({ maxConcurrentRides: 2, maxSecondRideDetourKm: 2.55 });
  // Zero means "strictly on the way", and is legal.
  expect(
    normalizeBookingLimits({
      maxConcurrentRides: 3,
      maxSecondRideDetourKm: 0,
    }),
  ).toEqual({ maxConcurrentRides: 3, maxSecondRideDetourKm: 0 });
});

test("the admin console rejects limits that would break the accept path", () => {
  const bad = [
    { maxConcurrentRides: 0, maxSecondRideDetourKm: 4 },
    { maxConcurrentRides: -1, maxSecondRideDetourKm: 4 },
    { maxConcurrentRides: 2.5, maxSecondRideDetourKm: 4 },
    { maxConcurrentRides: NaN, maxSecondRideDetourKm: 4 },
    { maxConcurrentRides: Infinity, maxSecondRideDetourKm: 4 },
    { maxConcurrentRides: MAX_CONCURRENT_RIDES_CEILING + 1, maxSecondRideDetourKm: 4 },
  ];
  for (const input of bad) {
    expect(() => normalizeBookingLimits(input)).toThrow(/whole number between 1/);
  }

  for (const detour of [-0.1, 100.1, NaN, Infinity]) {
    expect(() =>
      normalizeBookingLimits({
        maxConcurrentRides: 2,
        maxSecondRideDetourKm: detour,
      }),
    ).toThrow(/Detour tolerance must be between 0 and 100 km/);
  }
});

/**
 * A missing or mistyped settings row must fall back to the shipped defaults,
 * never to NaN — the accept path compares distances against this number.
 */
test("missing or mistyped settings fall back to the defaults", () => {
  expect(limitsFromSettings({})).toEqual(LIMITS);
  expect(
    limitsFromSettings({
      maxConcurrentRides: undefined,
      maxSecondRideDetourKm: undefined,
    }),
  ).toEqual(LIMITS);
  expect(
    limitsFromSettings({
      maxConcurrentRides: true,
      maxSecondRideDetourKm: "4",
    }),
  ).toEqual(LIMITS);
  expect(
    limitsFromSettings({
      maxConcurrentRides: NaN,
      maxSecondRideDetourKm: Infinity,
    }),
  ).toEqual(LIMITS);
  // A partially saved pair keeps the saved half and defaults the rest.
  expect(limitsFromSettings({ maxConcurrentRides: 1 })).toEqual({
    maxConcurrentRides: 1,
    maxSecondRideDetourKm: 4,
  });
});

test("a rider under the limit may always take one more job", () => {
  expect(canTakeAnotherRide({ carried: 0, detourKm: null, limits: LIMITS })).toBe(
    true,
  );
  // No route to measure against, so distance cannot block them.
  expect(canTakeAnotherRide({ carried: 1, detourKm: null, limits: LIMITS })).toBe(
    true,
  );
  // On the way: 3.9 km off route, tolerance 4.
  expect(canTakeAnotherRide({ carried: 1, detourKm: 3.9, limits: LIMITS })).toBe(
    true,
  );
});

test("a rider at the limit is refused, whatever the detour looks like", () => {
  expect(canTakeAnotherRide({ carried: 2, detourKm: 0, limits: LIMITS })).toBe(
    false,
  );
  expect(canTakeAnotherRide({ carried: 5, detourKm: null, limits: LIMITS })).toBe(
    false,
  );
  // Turning the limit down to 1 switches double booking off entirely.
  const solo = { maxConcurrentRides: 1, maxSecondRideDetourKm: 4 };
  expect(canTakeAnotherRide({ carried: 0, detourKm: null, limits: solo })).toBe(
    true,
  );
  expect(canTakeAnotherRide({ carried: 1, detourKm: 0, limits: solo })).toBe(
    false,
  );
});

test("a second pickup beyond the detour tolerance is refused", () => {
  expect(canTakeAnotherRide({ carried: 1, detourKm: 4, limits: LIMITS })).toBe(
    true,
  );
  expect(canTakeAnotherRide({ carried: 1, detourKm: 4.01, limits: LIMITS })).toBe(
    false,
  );
  expect(
    canTakeAnotherRide({
      carried: 1,
      detourKm: 7.2,
      limits: { maxConcurrentRides: 2, maxSecondRideDetourKm: 2.5 },
    }),
  ).toBe(false);
  // Tightened to zero: only a pickup exactly on the route passes.
  const strict = { maxConcurrentRides: 2, maxSecondRideDetourKm: 0 };
  expect(canTakeAnotherRide({ carried: 1, detourKm: 0, limits: strict })).toBe(true);
  expect(canTakeAnotherRide({ carried: 1, detourKm: 0.01, limits: strict })).toBe(
    false,
  );
});

/**
 * The near-store warning: a pasugo pin this close to the drop-off is usually
 * the nearest landmark rather than the shop, so it needs an explicit yes.
 */
test("a pasugo pin next to the drop-off needs confirmation", () => {
  expect(needsStoreConfirmation(0.2, false)).toBe(true);
  expect(needsStoreConfirmation(NEAR_STORE_KM - 0.001, false)).toBe(true);
  // At or beyond the threshold the pin is taken at face value.
  expect(needsStoreConfirmation(NEAR_STORE_KM, false)).toBe(false);
  expect(needsStoreConfirmation(3, false)).toBe(false);
  // Confirmed by the commuter: no second prompt.
  expect(needsStoreConfirmation(0.2, true)).toBe(false);
  // Identical points are rejected earlier in requestRide, so they are not a
  // "confirmation" case and must not be counted as one here.
  expect(needsStoreConfirmation(0, false)).toBe(false);
  expect(needsStoreConfirmation(NaN, false)).toBe(false);
});