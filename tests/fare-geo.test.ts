/**
 * Targeted checks for the fare engine and the geo helpers.
 *
 * The client ships its own copies of the tariff defaults and of the haversine
 * formula, so the point of this suite is parity: whatever the commuter sees
 * before requesting must match what the server recomputes from raw coordinates.
 *
 * Run: bun test
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  clampStoreFare,
  computeErrandFare,
  computeFare,
  formatRideCode,
  DEFAULT_TARIFF,
  MAX_STORE_REPRICE_RATIO,
  NEAR_STORE_KM,
} from "../src/convex/lib/fare.ts";
import { haversineKm as serverHaversine, isValidLatLng, distanceToSegmentKm } from "../src/convex/lib/geo.ts";
import {
  AVERAGE_SPEED_KMH,
  DEFAULT_TARIFF as CLIENT_TARIFF,
  estimateErrandFare,
  estimateEtaMinutes,
  estimateFare,
  formatDistance,
  formatEta,
  formatPeso,
  haversineKm as clientHaversine,
  NEAR_STORE_KM as CLIENT_NEAR_STORE_KM,
} from "../src/lib/geo.ts";

const TARIFF = DEFAULT_TARIFF;

/** Bukidnon landmarks, used to compare the two haversine implementations. */
const POINTS = [
  { lat: 8.5417, lng: 123.8853 }, // Malaybalay
  { lat: 7.9137, lng: 125.4933 }, // Valencia City
  { lat: 8.0, lng: 125.0 },
  { lat: 7.5, lng: 124.0 },
];

test("server fare engine clamps bad distances to the minimum", () => {
  expect(computeFare(0, TARIFF)).toBe(60);
  expect(computeFare(-5, TARIFF)).toBe(60);
  expect(computeFare(NaN, TARIFF)).toBe(60);
  expect(computeFare(Infinity, TARIFF)).toBe(60);
});

test("server fare engine applies the included distance and per-km rate", () => {
  expect(computeFare(5, TARIFF)).toBe(60);
  expect(computeFare(5.1, TARIFF)).toBe(61);
  // Past the band: 5 km at ₱10 (₱50) plus 7.345 km at ₱20 (₱146.90), on top of
  // the ₱60 base.
  expect(computeFare(12.345, TARIFF)).toBe(156.9);
  expect(computeFare(37.7777, TARIFF)).toBe(665.55);
});

/**
 * A customer who pins the nearest landmark instead of the shop collapses the
 * store → drop-off leg. The errand minimum plus the store stop fee are what
 * stop that from being priced as a bare 200-metre drop-off.
 */
test("an errand never prices below the errand minimum plus the store stop", () => {
  for (const distance of [0, 0.05, 0.2, 0.49, 1, 4.9, 5]) {
    const errand = computeErrandFare(distance, TARIFF);
    expect(errand).toBe(TARIFF.errandMinFare + TARIFF.stopFee);
    // And it is always worth more than the bare distance fare.
    expect(errand).toBeGreaterThanOrEqual(computeFare(distance, TARIFF));
  }
  expect(computeErrandFare(0, TARIFF)).toBe(115);
  expect(computeErrandFare(0.25, TARIFF)).toBe(115);
});

test("an errand adds the store stop to the distance fare once past the minimum", () => {
  // The distance fare only overtakes the ₱90 floor past 8 km (60 + 3×10).
  expect(computeErrandFare(5.5, TARIFF)).toBe(115);
  expect(computeErrandFare(8, TARIFF)).toBe(115);
  expect(computeErrandFare(8.5, TARIFF)).toBe(120);
  expect(computeErrandFare(12.345, TARIFF)).toBe(181.9);
  expect(computeErrandFare(NaN, TARIFF)).toBe(115);
  expect(computeErrandFare(-3, TARIFF)).toBe(115);
});

test("client errand estimate never diverges from the server errand fare", () => {
  for (const distance of [0, 1e-9, 0.5, 1, 5, 5.5, 12.345, 37.7777, -5, NaN, Infinity]) {
    expect(estimateErrandFare(distance, TARIFF)).toBe(computeErrandFare(distance, TARIFF));
  }
  expect(formatPeso(estimateErrandFare(NaN, TARIFF))).toBe("\u20b1115.00");
});

/**
 * The rider may fix the route, never the deal: the corrected route is repriced
 * but stays inside a capped band around what the commuter agreed to.
 */
test("a corrected store cannot drop the fee below the quote or raise it past the cap", () => {
  expect(MAX_STORE_REPRICE_RATIO).toBe(1.25);
  // Correcting to a shorter route never refunds the rider.
  expect(clampStoreFare(computeErrandFare(0.3, TARIFF), 200)).toBe(200);
  // A modest correction passes through untouched.
  expect(clampStoreFare(140, 115)).toBe(140);
  // A wild correction is capped, not honoured.
  expect(clampStoreFare(500, 115)).toBe(143.75);
  expect(clampStoreFare(Infinity, 115)).toBe(143.75);
  // Nothing sensible to clamp against: take the computed fare.
  expect(clampStoreFare(137.5, 0)).toBe(137.5);
});

test("the near-store warning threshold is the same on client and server", () => {
  expect(CLIENT_NEAR_STORE_KM).toBe(NEAR_STORE_KM);
  expect(NEAR_STORE_KM).toBe(0.5);
});

/**
 * The Super Admin publishes a tariff and every published price must follow it.
 * Both engines are driven with the *new* tariff here, which is what the client
 * does after the reactive `getActiveTariff` query pushes a change.
 */
test("a published tariff reprices rides and errands everywhere", () => {
  const hike = {
    minFare: 90,
    includedDistanceKm: 3,
    ratePerKm: 15,
    errandMinFare: 150,
    stopFee: 40,
  };

  // Rides: a short hop now costs the new floor, a long one the new rate.
  // 90 + (12.345 - 3) x 15 = 230.175, which the engine rounds to 2dp.
  expect(computeFare(2, TARIFF)).toBe(60);
  expect(computeFare(2, hike)).toBe(90);
  expect(computeFare(12.345, TARIFF)).toBe(156.9);
  // `hike` sets no long-trip band, so it stays on the flat rate all the way —
  // which is what a tariff published before long trips were priced does.
  expect(computeFare(12.345, hike)).toBe(230.18);

  // And the client estimate the commuter is shown agrees, so the number on
  // screen cannot disagree with the number charged.
  expect(estimateFare(12.345, hike)).toBe(computeFare(12.345, hike));
  expect(estimateFare(2, hike)).toBe(computeFare(2, hike));

  // Errands move with it, floor and store fee both.
  expect(computeErrandFare(0.3, TARIFF)).toBe(115);
  expect(computeErrandFare(0.3, hike)).toBe(190);
  expect(estimateErrandFare(0.3, hike)).toBe(computeErrandFare(0.3, hike));
  expect(computeErrandFare(12.345, hike)).toBe(230.18 + 40);
});

test("ride codes are zero padded", () => {
  expect(formatRideCode(7)).toBe("FETCH-000007");
  expect(formatRideCode(1234567)).toBe("FETCH-1234567");
});

test("client tariff defaults mirror the seeded server defaults", () => {
  expect(CLIENT_TARIFF).toEqual(DEFAULT_TARIFF);
});

test("client estimate never diverges from the server fare", () => {
  for (const distance of [0, 1e-9, 5, 5.1, 12.345, 37.7777, -5, NaN, Infinity, -Infinity]) {
    expect(estimateFare(distance, TARIFF)).toBe(computeFare(distance, TARIFF));
  }
});

test("client estimate renders a peso amount for any distance", () => {
  expect(formatPeso(estimateFare(NaN, TARIFF))).toBe("\u20b160.00");
});

test("both haversine implementations agree", () => {
  for (let i = 0; i < POINTS.length; i++) {
    for (let j = i + 1; j < POINTS.length; j++) {
      expect(clientHaversine(POINTS[i], POINTS[j])).toBeCloseTo(
        serverHaversine(POINTS[i], POINTS[j]),
        9,
      );
    }
  }
  expect(clientHaversine(POINTS[0], POINTS[0])).toBe(0);
  // 0.01 degrees of latitude is a little over 1.1 km.
  expect(clientHaversine({ lat: 8, lng: 123 }, { lat: 8.01, lng: 123 })).toBeCloseTo(1.112, 3);
});

test("coordinate validation rejects unusable fixes", () => {
  expect(isValidLatLng(null)).toBe(false);
  expect(isValidLatLng({ lat: NaN, lng: 0 })).toBe(false);
  expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
  expect(isValidLatLng(POINTS[0])).toBe(true);
});

/**
 * distanceToSegmentKm decides whether a second booking is a short detour off a
 * rider's current route, so it has to behave at the edges of the segment.
 */
test("detour distance is measured to the route segment, clamped at its ends", () => {
  const start = { lat: 7.9137, lng: 125.4933 }; // Valencia City
  const end = { lat: 7.9137, lng: 125.6 }; // due east of it

  // On the route itself.
  expect(distanceToSegmentKm(start, start, end)).toBe(0);
  expect(distanceToSegmentKm(end, start, end)).toBe(0);
  expect(
    distanceToSegmentKm({ lat: 7.9137, lng: 125.5466 }, start, end),
  ).toBeLessThan(0.01);

  // 0.01 degrees of latitude north of the middle of the route.
  expect(
    distanceToSegmentKm({ lat: 7.9237, lng: 125.5466 }, start, end),
  ).toBeCloseTo(1.106, 2);

  // Past the end of the route: distance is measured back to the endpoint.
  expect(
    distanceToSegmentKm({ lat: 7.9137, lng: 125.7 }, start, end),
  ).toBeCloseTo(11.03, 1);

  // A zero-length route falls back to the point distance.
  expect(
    distanceToSegmentKm({ lat: 7.9237, lng: 125.4933 }, start, start),
  ).toBeCloseTo(1.106, 2);
});

/**
 * The ETA sits next to the distance and the fare on the booking screen, and it
 * is the only one of the three that is a promise about *time*. Two properties
 * matter: it comes from the distance at the documented blended speed, and it
 * rounds up, so it never promises an arrival sooner than the road can deliver.
 */
test("the ETA is the distance at the documented blended speed", () => {
  expect(AVERAGE_SPEED_KMH).toBe(22);
  // 22 km at 22 km/h is exactly one hour, and everything else follows.
  expect(estimateEtaMinutes(22)).toBe(60);
  expect(estimateEtaMinutes(11)).toBe(30);
  expect(estimateEtaMinutes(220)).toBe(600);
});

test("the ETA rounds up, so it never under-promises", () => {
  // 1 km at 22 km/h is 2.7 minutes: round to the next whole minute, not 2.
  expect(estimateEtaMinutes(1)).toBe(3);
  expect(estimateEtaMinutes(5)).toBe(14);
  expect(estimateEtaMinutes(5.1)).toBe(14);
  expect(estimateEtaMinutes(7)).toBe(20);

  // Whatever the distance, the rounded answer covers it at the blended speed.
  for (const km of [0.1, 1, 5.1, 12.345, 27.4, 60, 123.4]) {
    const minutes = estimateEtaMinutes(km);
    expect((minutes * AVERAGE_SPEED_KMH) / 60).toBeGreaterThanOrEqual(km);
  }
});

test("any real trip is at least a minute away", () => {
  // 0.1 km is about sixteen seconds; "0 min" would read as "already here".
  expect(estimateEtaMinutes(0.1)).toBe(1);
  expect(estimateEtaMinutes(0.001)).toBe(1);
});

test("a longer trip never shows as a shorter one", () => {
  let previous = 0;
  for (const km of [1, 2, 5, 10, 20, 40]) {
    const minutes = estimateEtaMinutes(km);
    expect(minutes).toBeGreaterThan(previous);
    previous = minutes;
  }
});

test("an unusable distance has no ETA to show, and says so", () => {
  for (const distance of [0, -5, NaN, Infinity, -Infinity]) {
    expect(estimateEtaMinutes(distance)).toBe(0);
    // A dash, not "0 min": there is nothing to promise here.
    expect(formatEta(estimateEtaMinutes(distance))).toBe("—");
  }
});

test("the ETA renders minutes, then whole hours and minutes", () => {
  expect(formatEta(1)).toBe("1 min");
  expect(formatEta(59)).toBe("59 min");
  expect(formatEta(60)).toBe("1 hr");
  expect(formatEta(61)).toBe("1 hr 1 min");
  expect(formatEta(75)).toBe("1 hr 15 min");
  expect(formatEta(120)).toBe("2 hr");
  expect(formatEta(0)).toBe("—");
});

test("distance renders to one decimal place with a unit", () => {
  expect(formatDistance(0)).toBe("0.0 km");
  expect(formatDistance(12.345)).toBe("12.3 km");
  expect(formatDistance(27.4)).toBe("27.4 km");
});
/**
 * The long-trip band.
 *
 * A trip is priced in two bands: the standard per-km rate up to a threshold,
 * and a higher rate beyond it. It is a per-kilometre step, not a surcharge on
 * top — a rider running Malaybalay to Valencia is on the road long enough that
 * fuel and time both cost more, and a flat rate quietly under-pays them.
 *
 * The thing worth pinning hardest is that there is only *one* implementation.
 * This file used to hold a second copy of the arithmetic (`computeFare`) and
 * `geo.ts` a third (`estimateFare`), with the server charging from the first and
 * the commuter being shown the third. A band added to one of them would have
 * priced the quote and the charge differently, so all three now call
 * `distanceFareFor`.
 */
describe("the long-trip band", () => {
  const banded = { ...DEFAULT_TARIFF };

  test("the distance inside the allowance is still free", () => {
    expect(computeFare(4, banded)).toBe(60);
    expect(computeFare(5, banded)).toBe(60);
  });

  test("the first band is the standard rate", () => {
    // 8 km: 3 km past the 5 km allowance at ₱10.
    expect(computeFare(8, banded)).toBe(90);
  });

  test("the threshold itself is not yet the long rate", () => {
    // Exactly 10 km: 5 km over at ₱10 = ₱50, and not one peso of the ₱20 band.
    // Off-by-one here would make a commuter who is one metre under the
    // threshold jump a tier.
    expect(computeFare(10, banded)).toBe(110);
    expect(computeFare(10.01, banded)).toBeCloseTo(110.2, 2);
  });

  test("past the threshold the higher rate applies, to the rest of the trip", () => {
    // 15 km: 5 km at ₱10 and 5 km at ₱20 = ₱150, on top of ₱60.
    expect(computeFare(15, banded)).toBe(210);
    // The first 10 km are *not* repriced; only the distance beyond the mark is.
    expect(computeFare(15, banded)).toBeGreaterThan(60 + (15 - 5) * 10);
  });

  test("a tariff with no band behaves exactly as it always did", () => {
    // This is every tariff row published before long trips were priced, and it
    // is the reason the fields are optional rather than defaulted to zero.
    const flat = { ...DEFAULT_TARIFF };
    delete (flat as { longTripThresholdKm?: number }).longTripThresholdKm;
    delete (flat as { longTripRatePerKm?: number }).longTripRatePerKm;
    expect(computeFare(15, flat)).toBe(60 + (15 - 5) * 10);
    expect(computeFare(12.345, flat)).toBe(133.45);
  });

  test("a band that would start inside the allowance is ignored, not applied", () => {
    // An admin typing "3 km" means "after the base fare's 5 km is used up",
    // and the server rejects it. This is the second line of defence for a
    // tariff that reached the database another way: an empty first band would
    // price the first kilometres at the long rate.
    const nonsense = { ...DEFAULT_TARIFF, longTripThresholdKm: 3 };
    expect(computeFare(15, nonsense)).toBe(60 + (15 - 5) * 10);
  });

  test("errands band too, not just rides", () => {
    // The store → drop-off leg is what gets priced, so a long errand leg is a
    // long trip. 12.345 km = ₱156.90, and that is above the ₱90 errand floor,
    // so the floor does not mask it: + ₱25 stop fee.
    expect(computeErrandFare(12.345, banded)).toBe(181.9);
  });

  test("the client's estimate and the server's engine cannot drift", () => {
    // Same numbers, same function. If these ever disagree, a commuter is shown
    // a fare the server will not honour.
    for (const km of [1, 5, 8, 10, 10.5, 15, 37.8]) {
      expect(estimateFare(km, banded)).toBeCloseTo(computeFare(km, banded), 2);
    }
  });

  test("there is one implementation of the distance maths", () => {
    // Guard against a second copy creeping back in. `computeFare` used to do the
    // arithmetic itself, and `estimateFare` mirrored it in `geo.ts`.
    const server = readFileSync("src/convex/lib/fare.ts", "utf8");
    expect(server).toContain("distanceFareFor(distanceKm, tariff)");
    expect(server).not.toMatch(/extra \* tariff\.ratePerKm/);
    const geo = readFileSync("src/lib/geo.ts", "utf8");
    expect(geo).toContain("distanceFareFor(distanceKm, tariff)");
  });

  test("an admin can set it, and cannot set half of it", () => {
    const admin = readFileSync("src/convex/admin.ts", "utf8");
    expect(admin).toContain("longTripThresholdKm: v.optional(v.number())");
    expect(admin).toContain("longTripRatePerKm: v.optional(v.number())");
    expect(admin).toContain("Set both the long-trip distance and the long-trip rate");
    expect(admin).toContain("longTripThresholdKm <= includedDistanceKm");
    // And it is stored on the row, not just validated.
    expect(admin).toMatch(/ctx\.db\.insert\("tariffs",[\s\S]{0,400}longTripThresholdKm/);
  });

  test("the tariff row keeps the band optional", () => {
    // Not `v.number()`: making it required would break every row already in the
    // database, which are all flat-rate.
    const schema = readFileSync("src/convex/schema.ts", "utf8");
    expect(schema).toContain("longTripThresholdKm: v.optional(v.number())");
    expect(schema).toContain("longTripRatePerKm: v.optional(v.number())");
  });

  test("the admin form exposes both dials and leaves them blank when unset", () => {
    const tabs = readFileSync("src/components/admin/OperationsTabs.tsx", "utf8");
    expect(tabs).toContain('label: "Long trip from (km)"');
    expect(tabs).toContain('label: "Rate per km after that"');
    // Blank is a real setting — "charge one flat rate" — not a zero.
    expect(tabs).toContain('active?.longTripThresholdKm ?? ""');
  });
});

/**
 * The admin tariff screen has to be legible on its own.
 *
 * It used to read "a 3 km trip becomes ₱42.00" against a base fare of ₱60, with
 * nothing in between. That looks like the minimum being broken, because a
 * motorcycle tariff is 70% of the base and the screen never said so. An admin
 * who reads that and concludes the ₱60 is wrong is an admin about to "fix" the
 * price. So the screen now states the share, and these hold it there.
 */
describe("the fare settings screen", () => {
  const tabs = readFileSync("src/components/admin/OperationsTabs.tsx", "utf8");

  test("there are no vehicle chips", () => {
    // Every FETCH rider is on a motorcycle. A chip row let an admin preview a
    // tricycle or a van — a choice the booking screen does not offer, and the
    // kind of thing that gets saved as the live fare for a vehicle nobody drives.
    expect(tabs).not.toContain("RIDE_TYPES");
    expect(tabs).not.toContain("setRideType");
    expect(tabs).not.toContain("aria-pressed={rideType");
  });

  test("the example is computed for a motorcycle only", () => {
    expect(tabs).toContain('const motorcycle = "motorcycle"');
    expect(tabs).toContain("fareBreakdown({ distanceKm: km, rideType: motorcycle, tariff })");
  });

  test("it explains that the minimum is a share, not the amount charged", () => {
    // The multiplier is the whole reason a short trip comes out under the base
    // fare, so it has to be on screen rather than buried in the fare library.
    expect(tabs).toContain("fareMultiplier");
    expect(tabs).toContain("below the");
    expect(tabs).toContain("base fare");
  });

  test("it shows the structure, not just totals", () => {
    // Included distance, then the standard rate, then the long-trip rate — the
    // three things the dials above it control.
    // Matched against the JSX as written, which splits lines with `{" "}`.
    expect(tabs).toContain("base covers");
    expect(tabs).toContain("the rest is charged at");
    expect(tabs).toContain("No long-trip band is set");
  });

  test("it says when there is no band, rather than showing a blank", () => {
    expect(tabs).toMatch(/example\.longRate\s*\?\s*`Past/);
  });

  test("every sample row says why it is that price", () => {
    // "3 km — inside the included distance" teaches the rule; a bare "₱42.00"
    // does not.
    expect(tabs).toContain("inside the included distance");
    expect(tabs).toContain("past the long-trip mark");
  });

  test("the history shows the band, because a change you cannot see is not one", () => {
    expect(tabs).toContain('"Long from"');
    expect(tabs).toContain('"After"');
    // A dash is a real state: a version with one flat rate.
    expect(tabs).toContain("row.longTripThresholdKm ?");
    expect(tabs).toContain("row.longTripRatePerKm ?");
  });

  test("and it still saves both dials", () => {
    expect(tabs).toContain("longTripThresholdKm:");
    expect(tabs).toContain("longTripRatePerKm:");
  });
});
