import { distanceFareFor } from "../../lib/geo";

/**
 * Default tariff — used only to seed the first tariff row.
 * After that the active tariff row in the database is the source of truth.
 *
 * The errand terms price the work a pasugo request asks for beyond the drive:
 * reaching the store, parking, queueing, carrying the goods, and handling cash.
 * A rider who runs a 20-minute errand out of the same barangay should not earn
 * what a 300-metre drop-off earns, so errands never price below `errandMinFare`
 * and always carry `stopFee` on top of the distance fare.
 */
export const DEFAULT_TARIFF = {
  minFare: 60,
  includedDistanceKm: 5,
  ratePerKm: 10,
  longTripThresholdKm: 10,
  longTripRatePerKm: 20,
  errandMinFare: 90,
  stopFee: 25,
} as const;

export type TariffValues = {
  minFare: number;
  includedDistanceKm: number;
  ratePerKm: number;
  /** Optional: tariff rows published before long trips were priced separately. */
  longTripThresholdKm?: number;
  longTripRatePerKm?: number;
  errandMinFare: number;
  stopFee: number;
};

/**
 * Under this distance a "Buy from" pin is treated as possibly dropped on the
 * customer's own block rather than on the shop itself. The commuter is warned
 * and has to confirm; the server refuses the request without that confirmation.
 */
export const NEAR_STORE_KM = 0.5;

/**
 * A rider may correct the store pin, but the corrected route can only raise the
 * service fee this far above what the commuter was quoted — the rider fixes the
 * route, the commuter keeps the deal.
 */
export const MAX_STORE_REPRICE_RATIO = 1.25;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Configurable fare formula:
 *   distance <= included  -> minimum fare
 *   distance >  included  -> minimum fare + distanceFareFor(distance)
 *
 * The banding lives in `distanceFareFor` in `lib/geo`, which every other pricing
 * path in the app also calls. This used to carry its own copy of the arithmetic;
 * that is exactly how a quote and a charge drift apart, so it is now one call.
 */
export function computeFare(distanceKm: number, tariff: TariffValues): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return round2(tariff.minFare);
  }
  return round2(tariff.minFare + distanceFareFor(distanceKm, tariff));
}

/**
 * Errand service fee for pabili and padala. `distanceKm` is the store → drop-off
 * leg only; the fee is that leg's distance fare, lifted to `errandMinFare` when
 * the leg is short (the usual case when a customer pins the nearest landmark
 * instead of the shop), plus the flat store stop.
 */
export function computeErrandFare(
  distanceKm: number,
  tariff: TariffValues,
): number {
  const distanceFare = computeFare(distanceKm, tariff);
  const floor = Math.max(distanceFare, tariff.errandMinFare);
  return round2(floor + tariff.stopFee);
}

/**
 * Applies the store-correction band. The rider fixes the route, the commuter
 * keeps the deal: the corrected route is repriced, then clamped so it can never
 * fall below what the commuter was quoted nor rise more than
 * MAX_STORE_REPRICE_RATIO above it.
 */
export function clampStoreFare(computed: number, quotedFare: number): number {
  if (!Number.isFinite(quotedFare) || quotedFare <= 0) {
    return round2(computed);
  }
  const ceiling = round2(quotedFare * MAX_STORE_REPRICE_RATIO);
  return round2(Math.min(Math.max(computed, quotedFare), ceiling));
}

/**
 * Whether a pasugo request still needs the commuter to acknowledge a pin that
 * sits almost on top of the drop-off. A degenerate distance (identical points)
 * never reaches here — requestRide rejects that first — so only a real, short
 * leg counts.
 */
export function needsStoreConfirmation(
  distanceKm: number,
  storePinConfirmed: boolean,
): boolean {
  if (storePinConfirmed) return false;
  return (
    Number.isFinite(distanceKm) && distanceKm > 0 && distanceKm < NEAR_STORE_KM
  );
}

export function formatRideCode(seq: number): string {
  return `FETCH-${String(seq).padStart(6, "0")}`;
}