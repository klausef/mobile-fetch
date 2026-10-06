/**
 * Ride types, surge, and the fare breakdown — as one pure module.
 *
 * ── Why this lives in `src/lib` and not in `src/convex/lib` ────────────────
 * Because both sides of the app have to agree on it *exactly*. The commuter is
 * shown a total, the server charges a total, and a peso of disagreement between
 * the two is a support ticket and a lost rider. Convex already imports shared
 * pure modules from `../lib` (see `schedule.ts` and `payments.ts`), so this file
 * is imported by both the booking screen and `requestRide` — one formula, two
 * call sites, no mirror to drift.
 *
 * Note what this deliberately does NOT contain: React, the browser, a network
 * call, or a timestamp. `Date.now()` in a fare formula is how a receipt ends up
 * disagreeing with itself, so time is always a parameter.
 *
 * ── Why the split is base + distance + surge + tax ─────────────────────────
 * A single number on a booking screen is a number a commuter cannot argue with.
 * A rider *can* argue with it — "₱147? I only went three kilometres" — and the
 * only answer that survives that conversation is a receipt-shaped breakdown:
 * the part that is the fare's floor, the part that scales with the road, the
 * part that is demand right now, and the part that is the tax authority's.
 * Each line is independently checkable, so each line is independently
 * trustworthy.
 *
 * ── Tax ────────────────────────────────────────────────────────────────────
 * The rate lives in `DEFAULT_TAX_RATE_PCT` below, and it is 0 while the service
 * is running trial rides. It stays a named constant with a caller override
 * rather than a literal buried in the arithmetic, so restoring the standard rate
 * for launch is a one-line change and old receipts keep reading correctly (they
 * store the peso amount, never a recomputed percentage).
 */

// Imported from `./geo`, never from `./map`: `./map` touches `import.meta.env`
// and MapLibre, so importing it here would drag Vite-only module into the
// Convex typecheck and fail the backend build.
import { distanceFareFor, haversineKm, type LatLng } from "./geo";

/* ── Ride types ───────────────────────────────────────────────────────────── */

/**
 * The vehicle a commuter is booking.
 *
 * Deliberately orthogonal to `BookingType` (ride / pabili / padala). Those three
 * are *what the rider is being asked to do*; these are *what they arrive in*.
 * A pasugo can be fetched by a tricycle and a sedan ride can be an XL, so the
 * two cannot be one enum without every combination needing its own name.
 *
 * The set is what Bukidnon actually runs. Motorcycles and tricycles are the
 * default here in a way they are not in Manila, and offering a sedan as the
 * cheapest option would be pricing a product this province barely has.
 */
export type RideType = "motorcycle" | "tricycle" | "car" | "van";

export const RIDE_TYPES: RideType[] = [
  "motorcycle",
  "tricycle",
  "car",
  "van",
];

export interface RideTypeSpec {
  id: RideType;
  /** The name on the selector. Short: it sits in a two-line card. */
  name: string;
  /** One line of "why would I pick this", in the commuter's terms. */
  blurb: string;
  /** How many people, including the rider. */
  seats: number;
  /**
   * Multiplies the fare before tax.
   *
   * Applied to the whole subtotal rather than only the distance component, which
   * is how ride-hailing prices a vehicle class: a tricycle is cheaper per
   * kilometre *and* cheaper to start, because the driver is not burning fuel on
   * their own fuel.
   */
  fareMultiplier: number;
  /**
   * Average door-to-door speed for this vehicle, in km/h.
   *
   * Slower than the road speed limit on purpose. A motorcycle filters through
   * the tricycle traffic that a sedan sits behind, and a van carrying seven
   * people accelerates like a loaded lorry. ETA is a promise, so it is priced
   * against the slowest realistic case.
   */
  speedKmh: number;
  /**
   * Which lucide icon to draw. A string, not a component, because this module is
   * imported by Convex functions, which have no React renderer. `RideTypeIcon`
   * in the UI layer is the one place that turns this into a glyph.
   */
  icon: "bike" | "tricycle" | "car" | "van";
}

export const RIDE_TYPE_SPECS: Record<RideType, RideTypeSpec> = {
  motorcycle: {
    id: "motorcycle",
    name: "Motorcycle",
    blurb: "Solo. Fastest through town traffic.",
    seats: 1,
    fareMultiplier: 0.7,
    speedKmh: 27,
    icon: "bike",
  },
  tricycle: {
    id: "tricycle",
    name: "Tricycle",
    blurb: "Up to three, and it can go anywhere.",
    seats: 3,
    fareMultiplier: 0.85,
    speedKmh: 22,
    icon: "tricycle",
  },
  car: {
    id: "car",
    name: "Car",
    blurb: "Four seats with room for luggage.",
    seats: 4,
    fareMultiplier: 1,
    speedKmh: 22,
    icon: "car",
  },
  van: {
    id: "van",
    name: "Van",
    blurb: "Seven seats for a barkada or a load.",
    seats: 7,
    fareMultiplier: 1.45,
    speedKmh: 19,
    icon: "van",
  },
};

/** The type the booking screen opens on: the most-chosen one in Bukidnon. */
export const DEFAULT_RIDE_TYPE: RideType = "tricycle";

/**
 * Read a ride type out of untrusted input.
 *
 * Same rule as `resolveBookingType`: an unrecognised value becomes the default
 * rather than rendering a broken card or pricing a ride against `undefined`.
 * The URL and the request body are both attacker-controlled.
 */
export function resolveRideType(
  raw: string | null | undefined,
): RideType {
  return RIDE_TYPES.includes(raw as RideType)
    ? (raw as RideType)
    : DEFAULT_RIDE_TYPE;
}

export function rideTypeSpec(rideType: RideType): RideTypeSpec {
  return RIDE_TYPE_SPECS[rideType];
}

/* ── Surge ────────────────────────────────────────────────────────────────── */

/**
 * The most the multiplier will ever reach.
 *
 * A cap is the whole point of surge. Uncapped demand pricing produces a
 * ₱2,400 quote for a four-kilometre tricycle ride, which is not a surge — it is
 * an outage, and a capped multiplier converts it into an honest "wait for the
 * peak to pass".
 */
export const MAX_SURGE_MULTIPLIER = 2;

/**
 * What demand is right now, as a fare multiplier.
 *
 * ── Why the ratio, and not a raw request count ────────────────────────────
 * "Five open requests" means something completely different with two riders
 * online than with forty. Dividing open requests by available riders gives a
 * number that means the same thing at 6am and at 6pm, which is what makes the
 * tiers below portable across a platform that grows.
 *
 * ── Why the floor is 1 ────────────────────────────────────────────────────
 * Surge only ever goes up. Discounting a fare because demand is *low* is a
 * different product (a promo engine) with different accounting, and bolting it
 * on here would mean a commuter sees a cheaper price at 4am and a rider earns
 * less per kilometre at the exact hour the platform is emptiest.
 *
 * ── Why zero riders is not infinite ───────────────────────────────────────
 * With no riders online the ratio is meaningless — every request is
 * "unservable" and 3/0 would be a divide-by-zero. That is treated as the
 * mildest surge, because a quiet platform is a *rider supply* problem to fix
 * with recruitment, not a price signal to send to the commuter.
 */
export function surgeMultiplierFor(
  openRequests: number,
  availableRiders: number,
): number {
  const requests =
    Number.isFinite(openRequests) ? Math.max(0, Math.floor(openRequests)) : 0;
  const riders =
    Number.isFinite(availableRiders) ? Math.max(0, Math.floor(availableRiders)) : 0;
  if (requests === 0) return 1;
  if (riders === 0) return 1;
  const ratio = requests / riders;
  if (ratio <= 0.5) return 1;
  if (ratio <= 1) return 1.1;
  if (ratio <= 2) return 1.25;
  if (ratio <= 4) return 1.5;
  return MAX_SURGE_MULTIPLIER;
}

/** Whether a multiplier is worth showing on the booking screen at all. */
export function isSurgeActive(multiplier: number): boolean {
  return Number.isFinite(multiplier) && multiplier > 1;
}

/** "1.25×" or null when there is no surge, so the UI can omit the whole row. */
export function formatSurge(multiplier: number): string | null {
  if (!isSurgeActive(multiplier)) return null;
  // `Number(toFixed(2))` rather than stripping a trailing zero: the cap is 2,
  // and "2.00×" trimmed by hand becomes "2.0×" — a multiplier the commuter
  // will read as a different number from the one they were quoted.
  return `${Number(multiplier.toFixed(2))}×`;
}

/* ── Fare breakdown ───────────────────────────────────────────────────────── */

/**
 * The tariff fields the breakdown needs.
 *
 * Structural rather than imported, so it accepts both the server's
 * `TariffValues` and the client's `Tariff` without either importing the other.
 * The five fields have been identical since the tariff table was created.
 */
export interface FareTariff {
  minFare: number;
  includedDistanceKm: number;
  ratePerKm: number;
  /** Distance at which the long-trip rate takes over. See `distanceFareFor`. */
  longTripThresholdKm?: number;
  /** The per-km rate beyond `longTripThresholdKm`. */
  longTripRatePerKm?: number;
  errandMinFare: number;
  stopFee: number;
}

/**
 * VAT rate in the Philippines, as a percentage.
 *
 * **Zero while FETCH is running trial rides.** A trial fare should be the fare —
 * adding 12% on top means the number a commuter is quoted during testing is not
 * the number they pay, which is the fastest way to lose the people you are
 * trying to get real feedback from.
 *
 * This is the only place the rate is defined: the tariff table has no tax field
 * and no caller passes an override, so the client quote and the server-side
 * charge in `requestRide` both read this constant and cannot drift apart. To go
 * live, put the standard rate back — 12 — and every old receipt still reads
 * correctly, because rides store the peso amount, never a recomputed rate.
 */
export const DEFAULT_TAX_RATE_PCT = 0;

export interface FareBreakdownInput {
  /** Road distance in km. Straight-line is accepted; see `resolveBillableKm`. */
  distanceKm: number;
  rideType: RideType;
  tariff: FareTariff;
  /** Demand multiplier. Defaults to 1 — never below 1, never above the cap. */
  surgeMultiplier?: number;
  /** Defaults to `DEFAULT_TAX_RATE_PCT`. */
  taxRatePct?: number;
  /** Pabili/padala pricing: errand floor plus the store stop. */
  isErrand?: boolean;
}

export interface FareBreakdown {
  /** The distance the fare was priced on, after sanity-checking. */
  distanceKm: number;
  rideType: RideType;
  fareMultiplier: number;
  /** Normalised to [1, MAX_SURGE_MULTIPLIER]. 1 means no surge. */
  surgeMultiplier: number;
  /** Minimum fare (or the errand floor when that is higher). Ride-type adjusted. */
  baseFare: number;
  /** Distance beyond the included allowance, per km. Ride-type adjusted. */
  distanceFee: number;
  /** Errand store stop. 0 for a plain ride. */
  stopFee: number;
  /** baseFare + distanceFee + stopFee, before surge and tax. */
  subtotal: number;
  /** subtotal × (surge − 1). 0 when there is no surge. */
  surgeFee: number;
  /** (subtotal + surgeFee) × tax rate. */
  tax: number;
  /** What the commuter pays: subtotal + surgeFee + tax. */
  total: number;
  /**
   * What the rider earns: subtotal + surgeFee.
   *
   * Stored separately from `total` because tax is collected on the commuter's
   * behalf and remitted — folding it into the rider's payout is how a platform
   * ends up paying VAT it never collected.
   */
  riderPayout: number;
  taxRatePct: number;
  etaMinutes: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Clamp a surge multiplier to the range a fare may legally be scaled by. */
export function normalizeSurge(multiplier: number | undefined): number {
  if (!Number.isFinite(multiplier)) return 1;
  return Math.min(
    MAX_SURGE_MULTIPLIER,
    Math.max(1, round2(multiplier as number)),
  );
}

/**
 * The distance a fare may actually be priced on.
 *
 * ── Why the road distance is clamped ──────────────────────────────────────
 * The booking screen draws the *road* route and prices on its length, because
 * that is the honest number and a straight line understates a trip that follows
 * a national highway by a third. But the client computed that length, so the
 * server cannot trust it: a tampered body claiming 0.4 km would be billed at the
 * minimum fare for a cross-province trip.
 *
 * So the claim is accepted only inside a band the geometry itself proves: a
 * road route is never *shorter* than the straight line between its endpoints,
 * and never longer than `MAX_ROUTE_DETOUR` times it. Outside that band the
 * straight-line distance is used instead. The client gets the better number on
 * every real trip and cannot invent a cheaper one.
 */
export const MAX_ROUTE_DETOUR = 1.6;

/** Apply {@link MAX_ROUTE_DETOUR} to a client-supplied road distance. */
export function resolveBillableKm(
  straightKm: number,
  claimedRoadKm?: number | null,
): number {
  const straight = Number.isFinite(straightKm)
    ? Math.max(0, round2(straightKm))
    : 0;
  if (!Number.isFinite(claimedRoadKm)) return straight;
  const claimed = claimedRoadKm as number;
  if (claimed < straight) return straight;
  if (claimed > straight * MAX_ROUTE_DETOUR) return straight;
  return round2(claimed);
}

/**
 * The full fare breakdown.
 *
 * Pure: no clock, no randomness, no network. Every input is a number or a
 * literal, so the identical call on the client and on the server produces an
 * identical peso value — which is the only reason the quoted total and the
 * charged total can ever be the same number.
 */
export function fareBreakdown(input: FareBreakdownInput): FareBreakdown {
  const {
    tariff,
    rideType,
    isErrand = false,
    taxRatePct = DEFAULT_TAX_RATE_PCT,
  } = input;

  const distanceKm = Number.isFinite(input.distanceKm)
    ? Math.max(0, round2(input.distanceKm))
    : 0;
  const spec = rideTypeSpec(rideType);
  const surgeMultiplier = normalizeSurge(input.surgeMultiplier);
  const taxRate =
    Number.isFinite(taxRatePct) && taxRatePct > 0
      ? Math.min(100, taxRatePct)
      : 0;

  // Minimum fare, lifted to the errand floor when the leg is short. The errand
  // floor lands in `baseFare` rather than as its own line: it is a floor, and
  // showing a commuter "₱90 minimum" and "₱0 distance" separately makes a
  // three-kilometre pasugo look like a billing error rather than a promise.
  const distanceFare = round2(distanceFareFor(distanceKm, tariff));
  const rawBase = tariff.minFare;
  const baseBeforeFloor = isErrand
    ? Math.max(rawBase + distanceFare, tariff.errandMinFare)
    : rawBase + distanceFare;

  // Split back out so the two lines are individually meaningful: whatever the
  // floor or the surcharge added above the included distance is distance.
  const baseFare = round2(
    Math.min(baseBeforeFloor, isErrand ? tariff.errandMinFare : rawBase),
  );
  const stopFee = isErrand ? round2(tariff.stopFee) : 0;

  // The vehicle class scales the fare, applied to the subtotal.
  const baseAfterType = round2(baseFare * spec.fareMultiplier);
  const distanceAfterType = round2(
    Math.max(0, baseBeforeFloor - baseFare) * spec.fareMultiplier,
  );
  const stopAfterType = round2(stopFee * spec.fareMultiplier);
  const subtotal = round2(baseAfterType + distanceAfterType + stopAfterType);

  const surgeFee = round2(subtotal * (surgeMultiplier - 1));
  const taxable = round2(subtotal + surgeFee);
  const tax = round2(taxable * (taxRate / 100));
  const riderPayout = taxable;
  const total = round2(taxable + tax);

  // The tariff's minimum fare is a floor on the final peso total, not on a
  // single line, and it is applied after the ride-type multiplier has been
  // folded into the lines. Below that floor the quoted total and the fare the
  // platform will actually charge disagree (a 0.3 km motorcycle reads ₱42 on a
  // ₱60 minimum), so the ride-type-adjusted base, distance and stop lines are
  // scaled up until the total lands on it. Surge and tax are untouched: they
  // are an honest read of demand and of the tax authority, and they only ever
  // add on top of a floor the platform has decided in advance.
  if (total < input.tariff.minFare) {
    const raise = input.tariff.minFare / total;
    const scaledBase = round2(baseAfterType * raise);
    const scaledDist = round2(distanceAfterType * raise);
    const scaledStop = round2(stopAfterType * raise);
    const scaledSubtotal = round2(scaledBase + scaledDist + scaledStop);
    const scaledSurge = round2(scaledSubtotal * (surgeMultiplier - 1));
    const scaledTaxable = round2(scaledSubtotal + scaledSurge);
    const scaledTax = round2(scaledTaxable * (taxRate / 100));

    return {
      distanceKm,
      rideType,
      fareMultiplier: spec.fareMultiplier,
      surgeMultiplier,
      baseFare: scaledBase,
      distanceFee: scaledDist,
      stopFee: scaledStop,
      subtotal: scaledSubtotal,
      surgeFee: scaledSurge,
      tax: scaledTax,
      total: round2(scaledTaxable + scaledTax),
      riderPayout: scaledTaxable,
      taxRatePct: taxRate,
      etaMinutes: estimateEtaMinutesFor(distanceKm, rideType),
    };
  }

  return {
    distanceKm,
    rideType,
    fareMultiplier: spec.fareMultiplier,
    surgeMultiplier,
    baseFare: baseAfterType,
    distanceFee: distanceAfterType,
    stopFee: stopAfterType,
    subtotal,
    surgeFee,
    tax,
    total,
    riderPayout,
    taxRatePct: taxRate,
    etaMinutes: estimateEtaMinutesFor(distanceKm, rideType),
  };
}

/* ── ETA ──────────────────────────────────────────────────────────────────── */

/**
 * Trip time in whole minutes, rounded up.
 *
 * Rounded up because it is a promise: "9 min" arriving in 8 reads as early,
 * "8 min" arriving in 9 reads as late. Never below 1, because a trip that
 * exists is a trip that takes some time — "0 min" is a rendering bug, not a
 * fast one.
 */
export function estimateEtaMinutesFor(
  distanceKm: number,
  rideType: RideType,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const speed = rideTypeSpec(rideType).speedKmh;
  if (!(speed > 0)) return 0;
  return Math.max(1, Math.ceil((distanceKm / speed) * 60));
}

/* ── Road distance from drawn geometry ─────────────────────────────────────── */

/**
 * Length of a drawn polyline, in km.
 *
 * ── Why the client can price on this at all ────────────────────────────────
 * The map already draws the road route (OpenRouteService when a key is
 * configured, a straight line when it is not). Summing the legs of that line
 * gives the distance the commuter is actually looking at, which is the number
 * a fare should be quoted against: a Malaybalay → Valencia trip on the highway
 * is about a third longer than the line drawn between the two pins.
 *
 * The sum is a chain of haversines over consecutive vertices. At the vertex
 * spacing a routing API returns (tens of metres) that is accurate to well under
 * a percent, which is far finer than the fare's rounding.
 *
 * Returns null for a line too short to measure, so a caller can tell "no route
 * yet" from "zero kilometres" and fall back to the straight line deliberately.
 */
export function polylineLengthKm(points: LatLng[] | null): number | null {
  if (!points || points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return round2(total);
}