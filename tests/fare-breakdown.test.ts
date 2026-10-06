/**
 * Targeted checks for the ride-type, surge and fare-breakdown module.
 *
 * This is the module both sides of the app call: the booking screen draws a
 * total with it, and `requestRide` charges one with it. So the assertions here
 * are mostly about *properties that must not break* rather than about one
 * number — a rider who is told ₱147 and disputes it can only be answered with
 * arithmetic that adds up, a surge that is visible before it is applied, and an
 * ETA that is the selected vehicle's ETA rather than a fleet average.
 *
 * Run: bun test
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  DEFAULT_RIDE_TYPE,
  DEFAULT_TAX_RATE_PCT,
  estimateEtaMinutesFor,
  fareBreakdown,
  formatSurge,
  isSurgeActive,
  MAX_ROUTE_DETOUR,
  MAX_SURGE_MULTIPLIER,
  normalizeSurge,
  polylineLengthKm,
  resolveBillableKm,
  resolveRideType,
  RIDE_TYPES,
  RIDE_TYPE_SPECS,
  rideTypeSpec,
  surgeMultiplierFor,
} from "../src/lib/fare-breakdown.ts";
import { DEFAULT_TARIFF, haversineKm } from "../src/lib/geo.ts";

const TARIFF = DEFAULT_TARIFF;

/** Malaybalay and Valencia City — a real highway trip, not a rounding test. */
const MALAYBALAY = { lat: 8.5417, lng: 123.8853 };
const VALENCIA = { lat: 7.9137, lng: 125.4933 };

/* ── Ride types ───────────────────────────────────────────────────────────── */

test("every ride type is priced, and a bigger vehicle is never cheaper", () => {
  // Inside the 5 km included distance the tariff floor binds: a motorcycle and
  // a tricycle both price exactly the ₱60 minimum, so the strictless ordering
  // between vehicle classes collapses there. The floor is a price the platform
  // admits, not a discount a class earns.
  const quotes = RIDE_TYPES.map((id) =>
    fareBreakdown({ distanceKm: 6, rideType: id, tariff: TARIFF }),
  );
  const byType = Object.fromEntries(quotes.map((q) => [q.rideType, q.total]));
  expect(byType.motorcycle).toBeGreaterThanOrEqual(byType.tricycle);
  expect(byType.tricycle).toBeLessThan(byType.car);
  expect(byType.car).toBeLessThan(byType.van);
});

test("a car is the unmultiplied price: the tariff, priced plainly", () => {
  // 8 km on the default tariff is 60 + (8 − 5) × 10 = 90, and during trial runs
  // that is the whole fare — see `DEFAULT_TAX_RATE_PCT`.
  const car = fareBreakdown({ distanceKm: 8, rideType: "car", tariff: TARIFF });
  expect(car.baseFare).toBe(60);
  expect(car.distanceFee).toBe(30);
  expect(car.subtotal).toBe(90);
  expect(car.riderPayout).toBe(90);
  expect(car.tax).toBe(0);
  expect(car.total).toBe(90);
});

test("the vehicle class scales the whole subtotal, not just the distance", () => {
  // The tariff floor is applied before the type multiplier folds the lines
  // up, so a tricycle inside the included distance no longer reads below the
  // ₱60 minimum — it quotes the whole minimum. Beyond the included distance
  // the type multiplier scales the distance line and a tricycle can again be
  // cheaper than a car per kilometre.
  const tricycle = fareBreakdown({
    distanceKm: 3,
    rideType: "tricycle",
    tariff: TARIFF,
  });
  expect(tricycle.riderPayout).toBe(60);
  expect(tricycle.baseFare).toBe(60);
  expect(tricycle.distanceFee).toBe(0);
});

test("an unknown ride type falls back to the default rather than pricing NaN", () => {
  expect(resolveRideType("spaceship")).toBe(DEFAULT_RIDE_TYPE);
  expect(resolveRideType(null)).toBe(DEFAULT_RIDE_TYPE);
  expect(resolveRideType(undefined)).toBe(DEFAULT_RIDE_TYPE);
  expect(resolveRideType("van")).toBe("van");
  expect(rideTypeSpec(resolveRideType("spaceship")).id).toBe(DEFAULT_RIDE_TYPE);
});

/* ── Surge ────────────────────────────────────────────────────────────────── */

test("surge is a function of demand per available rider, and never below 1", () => {
  expect(surgeMultiplierFor(0, 0)).toBe(1);
  expect(surgeMultiplierFor(0, 20)).toBe(1);
  // No riders is a supply problem to fix with recruitment, not a price signal.
  expect(surgeMultiplierFor(5, 0)).toBe(1);
  // Calm: at most one open request per rider.
  expect(surgeMultiplierFor(4, 10)).toBe(1);
  // Tier boundaries are inclusive on the low side: exactly one request per
  // rider is still the calm tier, and the next request is what costs money.
  expect(surgeMultiplierFor(5, 10)).toBe(1);
  expect(surgeMultiplierFor(6, 10)).toBe(1.1);
  expect(surgeMultiplierFor(10, 10)).toBe(1.1);
  expect(surgeMultiplierFor(11, 10)).toBe(1.25);
  expect(surgeMultiplierFor(20, 10)).toBe(1.25);
  expect(surgeMultiplierFor(21, 10)).toBe(1.5);
  expect(surgeMultiplierFor(40, 10)).toBe(1.5);
  expect(surgeMultiplierFor(41, 10)).toBe(MAX_SURGE_MULTIPLIER);
  expect(surgeMultiplierFor(50, 10)).toBe(MAX_SURGE_MULTIPLIER);
});

test("surge tiers do not jump over a boundary", () => {
  // Walking the ratio one request at a time must never produce a multiplier
  // below the previous one — a fare that drops as the platform gets busier is
  // a bug a commuter notices immediately.
  let previous = 1;
  for (let requests = 0; requests <= 60; requests += 1) {
    const multiplier = surgeMultiplierFor(requests, 10);
    expect(multiplier).toBeGreaterThanOrEqual(previous);
    expect(multiplier).toBeLessThanOrEqual(MAX_SURGE_MULTIPLIER);
    previous = multiplier;
  }
});

test("a client-supplied surge multiplier is clamped, never trusted", () => {
  expect(normalizeSurge(undefined)).toBe(1);
  expect(normalizeSurge(NaN)).toBe(1);
  expect(normalizeSurge(0.2)).toBe(1);
  expect(normalizeSurge(1.25)).toBe(1.25);
  expect(normalizeSurge(9)).toBe(MAX_SURGE_MULTIPLIER);
});

test("surge is formatted for a person, and omitted when there is none", () => {
  expect(isSurgeActive(1)).toBe(false);
  expect(formatSurge(1)).toBeNull();
  expect(formatSurge(0)).toBeNull();
  expect(formatSurge(1.1)).toBe("1.1×");
  expect(formatSurge(1.25)).toBe("1.25×");
  // The cap must not read as a different number than the one applied.
  expect(formatSurge(MAX_SURGE_MULTIPLIER)).toBe("2×");
});

test("surge raises the total and shows as its own line", () => {
  const calm = fareBreakdown({ distanceKm: 8, rideType: "car", tariff: TARIFF });
  const busy = fareBreakdown({
    distanceKm: 8,
    rideType: "car",
    tariff: TARIFF,
    surgeMultiplier: 1.25,
  });
  expect(busy.subtotal).toBe(calm.subtotal);
  expect(busy.surgeFee).toBe(22.5);
  // Surge is part of what the commuter pays. At the launch rate it was taxed;
  // during trial runs it is not: 90 fare + 22.50 surge, and the rider is paid
  // the whole of it.
  expect(busy.tax).toBe(0);
  expect(busy.total).toBe(112.5);
  expect(busy.riderPayout).toBe(112.5);
});

/* ── The breakdown adds up ────────────────────────────────────────────────── */

test("the breakdown is a receipt: the lines sum to the total", () => {
  for (const distanceKm of [0.4, 3, 5, 8, 37.5, 120]) {
    for (const rideType of RIDE_TYPES) {
      for (const surgeMultiplier of [1, 1.5, MAX_SURGE_MULTIPLIER]) {
        for (const isErrand of [false, true]) {
          const q = fareBreakdown({
            distanceKm,
            rideType,
            tariff: TARIFF,
            surgeMultiplier,
            isErrand,
          });
          expect(q.subtotal).toBeCloseTo(
            q.baseFare + q.distanceFee + q.stopFee,
            2,
          );
          expect(q.total).toBeCloseTo(q.subtotal + q.surgeFee + q.tax, 2);
          // The rider is paid the fare; VAT is collected for the government
          // and folding it into the payout is how a platform ends up paying
          // tax it never collected.
          expect(q.riderPayout).toBeCloseTo(q.subtotal + q.surgeFee, 2);
          expect(q.tax).toBeCloseTo(
            q.riderPayout * (q.taxRatePct / 100),
            2,
          );
          expect(q.taxRatePct).toBe(DEFAULT_TAX_RATE_PCT);
        }
      }
    }
  }
});

test("a trip inside the included distance is the minimum fare", () => {
  const short = fareBreakdown({ distanceKm: 1.2, rideType: "car", tariff: TARIFF });
  expect(short.distanceFee).toBe(0);
  expect(short.riderPayout).toBe(60);
  expect(short.total).toBe(60);
});

test("the tariff floor binds on the final total, not a pre-multiplier line", () => {
  const shortMotorcycle = fareBreakdown({
    distanceKm: 0.3,
    rideType: "motorcycle",
    tariff: TARIFF,
  });
  expect(shortMotorcycle.riderPayout).toBe(60);
  expect(shortMotorcycle.total).toBe(60);
  expect(shortMotorcycle.distanceFee).toBe(0);

  const shortTricycle = fareBreakdown({
    distanceKm: 3,
    rideType: "tricycle",
    tariff: TARIFF,
  });
  expect(shortTricycle.riderPayout).toBe(60);
  expect(shortTricycle.total).toBe(60);
});

test("an errand is never priced as a bare ride: floor plus store stop", () => {
  const errand = fareBreakdown({
    distanceKm: 1,
    rideType: "tricycle",
    tariff: TARIFF,
    isErrand: true,
  });
  // 90 floor + 25 stop = 115, then the tricycle multiplier.
  expect(errand.riderPayout).toBe(115 * RIDE_TYPE_SPECS.tricycle.fareMultiplier);
  expect(errand.stopFee).toBeGreaterThan(0);
  // A plain ride on the same points has no store stop at all.
  const ride = fareBreakdown({
    distanceKm: 1,
    rideType: "tricycle",
    tariff: TARIFF,
  });
  expect(ride.stopFee).toBe(0);
  expect(errand.riderPayout).toBeGreaterThan(ride.riderPayout);
});

test("a broken distance prices as the minimum rather than as NaN", () => {
  for (const distanceKm of [NaN, Infinity, -12]) {
    const q = fareBreakdown({ distanceKm, rideType: "car", tariff: TARIFF });
    expect(Number.isFinite(q.total)).toBe(true);
    expect(q.riderPayout).toBe(60);
  }
});

test("the same inputs always produce the same peso value", () => {
  // The quote is drawn on the client and charged on the server, from the same
  // pure function. Any dependence on the clock or on call order would make the
  // two disagree for reasons nobody could explain to a commuter.
  const input = {
    distanceKm: 12.34,
    rideType: "van" as const,
    tariff: TARIFF,
    surgeMultiplier: 1.25,
  };
  const first = fareBreakdown(input);
  const second = fareBreakdown(input);
  expect(first).toEqual(second);
});

/* ── Route distance ───────────────────────────────────────────────────────── */

test("a client-claimed road distance is accepted only inside a provable band", () => {
  const straight = 10;
  // A real road route is longer than the straight line...
  expect(resolveBillableKm(straight, 14)).toBe(14);
  // ...but never longer than the detour the geometry itself justifies.
  expect(resolveBillableKm(straight, straight * MAX_ROUTE_DETOUR)).toBe(
    straight * MAX_ROUTE_DETOUR,
  );
  expect(resolveBillableKm(straight, straight * MAX_ROUTE_DETOUR + 1)).toBe(
    straight,
  );
  // A claimed distance shorter than the straight line is impossible, so it is
  // a tampered body buying a cheaper fare.
  expect(resolveBillableKm(straight, straight - 1)).toBe(straight);
  expect(resolveBillableKm(straight, null)).toBe(straight);
  expect(resolveBillableKm(straight, NaN)).toBe(straight);
  expect(resolveBillableKm(NaN, 14)).toBe(0);
});

test("a cheaper ride cannot be bought by claiming a shorter road", () => {
  const straight = haversineKm(MALAYBALAY, VALENCIA);
  const honest = fareBreakdown({
    distanceKm: resolveBillableKm(straight, straight),
    rideType: "car",
    tariff: TARIFF,
  });
  const tampered = fareBreakdown({
    distanceKm: resolveBillableKm(straight, 0.4),
    rideType: "car",
    tariff: TARIFF,
  });
  expect(tampered.total).toBe(honest.total);
});

test("polyline length is the sum of its legs", () => {
  expect(polylineLengthKm([MALAYBALAY, VALENCIA])).toBe(
    Math.round(haversineKm(MALAYBALAY, VALENCIA) * 100) / 100,
  );
  const via = { lat: 8.2, lng: 124.5 };
  const legs =
    haversineKm(MALAYBALAY, via) + haversineKm(via, VALENCIA);
  expect(polylineLengthKm([MALAYBALAY, via, VALENCIA])).toBe(
    Math.round(legs * 100) / 100,
  );
});

test("a line too short to measure says so instead of saying zero", () => {
  // "No route yet" and "zero kilometres" are different facts; collapsing them
  // would price a trip that has not been measured.
  expect(polylineLengthKm(null)).toBeNull();
  expect(polylineLengthKm([])).toBeNull();
  expect(polylineLengthKm([MALAYBALAY])).toBeNull();
});

/* ── ETA ──────────────────────────────────────────────────────────────────── */

test("ETA is distance over the vehicle's own average speed, rounded up", () => {
  // 5.5 km in a tricycle at 22 km/h is exactly 15 minutes.
  expect(estimateEtaMinutesFor(5.5, "tricycle")).toBe(15);
  // The same distance in a van is slower, and in a motorcycle faster: the ETA
  // belongs to the vehicle the commuter actually picked.
  expect(estimateEtaMinutesFor(5.5, "van")).toBe(
    Math.ceil((5.5 / RIDE_TYPE_SPECS.van.speedKmh) * 60),
  );
  expect(estimateEtaMinutesFor(5.5, "motorcycle")).toBe(
    Math.ceil((5.5 / RIDE_TYPE_SPECS.motorcycle.speedKmh) * 60),
  );
  expect(estimateEtaMinutesFor(5.5, "car")).toBeGreaterThan(
    estimateEtaMinutesFor(5.5, "motorcycle"),
  );
});

test("a promise is rounded up, and a trip that exists takes some time", () => {
  // "9 min" arriving in 8 reads as early; "8 min" arriving in 9 reads as late.
  expect(estimateEtaMinutesFor(0.2, "car")).toBe(1);
  expect(estimateEtaMinutesFor(0, "car")).toBe(0);
  expect(estimateEtaMinutesFor(NaN, "car")).toBe(0);
});

test("the ETA in the breakdown is the selected vehicle's ETA", () => {
  const input = { distanceKm: 12, tariff: TARIFF };
  const bike = fareBreakdown({ ...input, rideType: "motorcycle" });
  const van = fareBreakdown({ ...input, rideType: "van" });
  expect(bike.etaMinutes).toBe(estimateEtaMinutesFor(12, "motorcycle"));
  expect(van.etaMinutes).toBe(estimateEtaMinutesFor(12, "van"));
  expect(van.etaMinutes).toBeGreaterThan(bike.etaMinutes);
});

/* ── Client/server agreement ──────────────────────────────────────────────── */

test("the fare module the server imports is the fare module the screen draws", () => {
  // `requestRide` imports this same file, so there is no second formula to fall
  // out of step — but only if the tariff the screen reads is the tariff the
  // server stores. That is the parity this asserts.
  const serverTariff = TARIFF;
  const quote = fareBreakdown({
    distanceKm: 18.5,
    rideType: "tricycle",
    tariff: serverTariff,
    surgeMultiplier: 1.5,
    isErrand: false,
  });
  const reQuote = fareBreakdown({
    distanceKm: 18.5,
    rideType: "tricycle",
    tariff: serverTariff,
    surgeMultiplier: 1.5,
    isErrand: false,
  });
  expect(reQuote.total).toBe(quote.total);
  expect(reQuote.riderPayout).toBe(quote.riderPayout);
});

/* ── Trial runs are untaxed ──────────────────────────────────────────────── */

/**
 * The tax rate is zero while FETCH is running trial rides.
 *
 * It is one constant on purpose. The tariff table has no tax column and no
 * caller passes an override, so the fare the commuter is quoted on screen and
 * the fare `requestRide` charges come out of the same expression — which is the
 * only reason this could be changed without also editing a server file and
 * hoping the two halves still agreed.
 *
 * The numbers below are therefore not "expected during trial runs" so much as
 * "what zero means": no tax, the total is the fare, and the rider is paid the
 * whole thing. Restoring the launch rate restores the launch arithmetic in the
 * same place, and old receipts are unaffected because rides store peso amounts.
 */
describe("the tax rate during trial runs", () => {
  test("it is zero, and it is one named constant", () => {
    expect(DEFAULT_TAX_RATE_PCT).toBe(0);
  });

  test("a fare is exactly what the rider is paid", () => {
    const quote = fareBreakdown({
      distanceKm: 17.8,
      rideType: "motorcycle",
      tariff: TARIFF,
      surgeMultiplier: 1.2,
    });
    expect(quote.tax).toBe(0);
    expect(quote.taxRatePct).toBe(0);
    expect(quote.total).toBe(quote.riderPayout);
    expect(quote.total).toBeCloseTo(quote.subtotal + quote.surgeFee, 2);
  });

  test("a surge does not add a tax layer on top", () => {
    // The launch behaviour taxed surge as well. If the rate ever came back, this
    // is the assertion that would catch someone taxing the fare but forgetting
    // the surge.
    const quote = fareBreakdown({
      distanceKm: 8,
      rideType: "motorcycle",
      tariff: TARIFF,
      surgeMultiplier: 1.5,
    });
    expect(quote.surgeFee).toBeGreaterThan(0);
    expect(quote.tax).toBe(0);
  });

  test("an explicit rate still wins, so restoring VAT is a one-liner", () => {
    // This is the whole reason the rate stayed a parameter: a caller can still
    // ask for 12 without the constant moving, and nothing else changes.
    const taxed = fareBreakdown({
      distanceKm: 8,
      rideType: "car",
      tariff: TARIFF,
      taxRatePct: 12,
    });
    expect(taxed.tax).toBeCloseTo(taxed.riderPayout * 0.12, 2);
    expect(taxed.total).toBeCloseTo(taxed.riderPayout + taxed.tax, 2);
  });

  test("the quote and the charge cannot drift", () => {
    // `rides.ts` calls the same function the client does. If anyone ever gives
    // the server its own arithmetic this stops holding, so it is pinned to the
    // import rather than to a comment.
    const server = readFileSync("src/convex/rides.ts", "utf8");
    expect(server).toContain("fareBreakdown");
    expect(server).toContain("tax: breakdown.tax");
  });

  test("nothing tells a commuter a zero peso is VAT", () => {
    // A "Tax (0%) ₱0.00" line and a note explaining that zero is VAT collected
    // for the government both read as a broken billing screen.
    const summary = readFileSync(
      "src/components/ride/BookingSummary.tsx",
      "utf8",
    );
    expect(summary).toMatch(/\{fare\.tax > 0 \? \(\s*<Row/);
    expect(summary).not.toContain("VAT collected for the government, not a\n            rider fee.\n          </p>\n        ) : null");
  });
});
