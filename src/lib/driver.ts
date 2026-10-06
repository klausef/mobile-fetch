/**
 * The rider's half of a trip, as pure functions.
 *
 * Everything a driver screen has to decide — which stage of the job to show,
 * how long an incoming request has left, what the trip actually paid — is
 * arithmetic on numbers the server already sent. Keeping it here rather than
 * inside `RiderDashboard`/`RiderRide` means it can be tested without a map, a
 * browser or a websocket, and it means the two screens cannot drift apart on
 * what "arrived" means.
 *
 * Nothing in this module touches the clock on its own. `Date.now()` is passed
 * in, exactly as in `fare-breakdown.ts`: a countdown that reads the clock it is
 * rendering cannot be tested, and a "today's earnings" that decides for itself
 * what today is cannot be checked against the server that also decided.
 */

import { AVERAGE_SPEED_KMH } from "./geo";
import type { LatLng } from "./geo";

/**
 * What the rider takes home per completed ride.
 *
 * When the rider collects the exact amount with no platform fee and no tax
 * deduction, the settlement helper still exposes the old rate constant for any
 * screen that has not switched yet, but the default settlement path returns the
 * full fare as the rider's take-home and treats the old commission math as an
 * opt-in path for screens that still show it.
 *
 * The old constant is kept deliberately and asserted equal to the server-side
 * one by `tests/driver-flow.test.ts`, because the two are deliberately separate
 * constants — importing the Convex module into the client would drag the server
 * runtime into the bundle for one float.
 */
export const DRIVER_PLATFORM_RATE = 0.15;

/**
 * How long a rider has to answer an incoming request before it closes itself.
 *
 * Fifteen seconds, because a request that stays on screen is a request the
 * commuter is still waiting on: leaving it open while the rider finishes a
 * conversation is how a passenger watches a pin that will never move. Long
 * enough to read the fare and tap, short enough to be honest.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Which screen of the job the rider should be looking at.
 *
 * The ride lifecycle has seven statuses; a driver has four screens. `ACCEPTED`
 * and `RIDER_ARRIVING` are the same screen on purpose — the first is the
 * moment after the tap and the second is the tap itself, and showing "new
 * ride" then flicking straight to "en route" is a transition the rider never
 * asked to watch.
 */
export type DriverStage = "to_pickup" | "at_pickup" | "in_trip" | "done";

export function driverStage(status: string): DriverStage {
  switch (status) {
    case "ACCEPTED":
    case "RIDER_ARRIVING":
      return "to_pickup";
    case "RIDER_ARRIVED":
      return "at_pickup";
    case "IN_PROGRESS":
      return "in_trip";
    default:
      return "done";
  }
}

/** Milliseconds left before `deadline`, floored at zero and never `NaN`. */
export function remainingMs(deadline: number, now: number): number {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.max(0, deadline - now);
}

/** A request whose window has closed. Ties mean closed. */
export function isRequestExpired(deadline: number, now: number): boolean {
  return remainingMs(deadline, now) <= 0;
}

/**
 * A countdown, as `M:SS`.
 *
 * Minutes are not zero-padded and seconds are, which is the only shape that
 * reads correctly at a glance on a phone mounted to a windscreen: "0:07" and
 * "1:12", never "00:07" or "1:2".
 */
export function formatCountdown(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** A trip duration, `H:MM` past an hour and `M min` under it. */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalMinutes = Math.round(safe / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hr ${minutes} min`;
}

/**
 * An ETA from a distance and a speed. Always at least one minute.
 *
 * `AVERAGE_SPEED_KMH` is the same constant the booking screen quotes with, so
 * the number the commuter agreed to and the number the rider is chasing are
 * derived from one speed rather than two.
 */
export function etaMinutesFrom(
  distanceKm: number,
  speedKmh: number = AVERAGE_SPEED_KMH,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const speed = Number.isFinite(speedKmh) && speedKmh > 0 ? speedKmh : AVERAGE_SPEED_KMH;
  return Math.max(1, Math.ceil((distanceKm / speed) * 60));
}

/** How long a trip took, in ms, or null while either end is missing. */
export function tripDurationMs(
  startedAt?: number | null,
  completedAt?: number | null,
): number | null {
  if (startedAt == null || completedAt == null) return null;
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return null;
  return Math.max(0, completedAt - startedAt);
}

/**
 * The shape of the stored fare breakdown, restated here so this module needs no
 * Convex import. Only the fields a receipt shows.
 */
export interface StoredFareBreakdown {
  baseFare: number;
  distanceFee: number;
  stopFee: number;
  surgeFee: number;
  tax: number;
  total: number;
  taxRatePct: number;
}

export interface TripSettlement {
  baseFare: number;
  distanceFee: number;
  stopFee: number;
  surgeFee: number;
  /** Pre-tax, pre-surge subtotal the rider's payout is built from. */
  subtotal: number;
  /** What the commuter was charged, tax included. */
  total: number;
  /**
   * When the rate is the old platform rate, the fare before that cut.
   *
   * When the rider collects the exact amount with no platform fee and no tax
   * deduction, this is the same as `total` — the commuter-facing fare the rider
   * is reimbursed for — because there is no cut left to separate out.
   */
  gross: number;
  /**
   * When the rate is the old platform rate, the platform's cut of `gross`.
   *
   * When the rider collects the exact amount, this is 0 and the settlement path
   * is the one a rider receipt screen can skip rather than hide.
   */
  commission: number;
  /**
   * What the rider actually takes home.
   *
   * Under the old rate this was `gross - commission`. Under the exact-amount
   * rule this is the full fare the rider collected.
   */
  net: number;
  /**
   * The rate the settlement was computed with.
   *
   * Kept so a screen can still decide whether to render the old commission line
   * for riders on the old setup, without re-deriving the rate from a percentage
   * it was never told.
   */
  platformRate: number;
  /**
   * Whether this settlement used the exact-amount rule.
   *
   * A screen that still has to show the old commission story can branch on this
   * instead of guessing from a zero percentage alone.
   */
  exactAmount: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split a finished fare into the rider's take and, optionally, the platform's.
 *
 * The old path still exists for any screen that has not moved to the exact-amount
 * rule yet: when the rate is the legacy platform rate, the fare is still split
 * into gross, commission and net exactly as before, and each ride is rounded
 * before summing so the listed fares still add up to the number the rider can
 * see.
 *
 * When the rate is 0 — the exact-amount rule — the fare is returned untouched:
 * the rider collects the exact amount, no platform fee and no tax deduction are
 * applied at settlement time, and the breakdown is returned so a receipt can
 * still show the commuter-facing lines if it wants to.
 *
 * When the breakdown is missing — a ride booked before ride types existed —
 * the payout falls back to the flat fare with no commission line to show,
 * rather than inventing a base fare that would not match the receipt.
 */
export function settleTrip(
  breakdown: StoredFareBreakdown | null | undefined,
  fare: number,
  platformRate: number = DRIVER_PLATFORM_RATE,
): TripSettlement {
  const rate = Number.isFinite(platformRate) ? platformRate : DRIVER_PLATFORM_RATE;
  const exactAmount = rate === 0;
  const b = breakdown;
  const baseFare = round2(b?.baseFare ?? 0);
  const distanceFee = round2(b?.distanceFee ?? 0);
  const stopFee = round2(b?.stopFee ?? 0);
  const surgeFee = round2(b?.surgeFee ?? 0);
  // The stored breakdown carries no explicit subtotal; it is the sum of its
  // own parts, so derive rather than duplicate a field that could disagree.
  const subtotal = round2(baseFare + distanceFee + stopFee);
  const total = round2(b?.total ?? fare);

  if (exactAmount) {
    return {
      baseFare,
      distanceFee,
      stopFee,
      surgeFee,
      subtotal,
      total,
      gross: total,
      commission: 0,
      net: total,
      platformRate: 0,
      exactAmount: true,
    };
  }

  const gross = round2(b ? subtotal + surgeFee : fare);
  const commission = round2(gross * rate);
  const net = round2(gross - commission);
  return {
    baseFare,
    distanceFee,
    stopFee,
    surgeFee,
    subtotal,
    total,
    gross,
    commission,
    net,
    platformRate: rate,
    exactAmount: false,
  };
}

/**
 * One heatmap cell: a place with demand, and how much.
 *
 * `lat`/`lng` are the centre of the cell, not a point; the weight is how many
 * requests landed in it.
 */
export interface DemandCell {
  lat: number;
  lng: number;
  weight: number;
}

/**
 * Aggregate scattered demand points into evenly-sized cells.
 *
 * A heatmap drawn from raw points is a heatmap of the last twenty requests,
 * which on a quiet morning is twenty dots on one street and tells the rider
 * nothing about where to wait. Snapping each point to a grid cell of roughly a
 * kilometre and counting what lands there is what turns a scatter into "go
 * toward the market".
 *
 * `cellDegrees` defaults to about 1.1 km at Bukidnon's latitude; the caller
 * can widen it for a provincial view. Cells are returned heaviest first, so a
 * caller that only wants the top few does not have to sort.
 */
export function demandCells(
  points: readonly LatLng[],
  cellDegrees = 0.01,
): DemandCell[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  const size = Number.isFinite(cellDegrees) && cellDegrees > 0 ? cellDegrees : 0.01;
  const cells = new Map<string, { lat: number; lng: number; weight: number }>();
  for (const point of points) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) continue;
    const row = Math.round(point.lat / size);
    const col = Math.round(point.lng / size);
    const key = `${row}:${col}`;
    const existing = cells.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      cells.set(key, { lat: row * size, lng: col * size, weight: 1 });
    }
  }
  return [...cells.values()].sort((a, b) => b.weight - a.weight);
}

/**
 * A short human name for a demand cell, for the "busy areas" hint.
 *
 * Deliberately vague: the app knows the cell's coordinates and the count, not
 * that the market is there. Saying "near Malaybalay City" when all we know is
 * a grid square would be inventing a landmark.
 */
export function demandHeadline(cells: readonly DemandCell[]): string | null {
  if (!Array.isArray(cells) || cells.length === 0) return null;
  const busiest = cells[0];
  if (!busiest || busiest.weight < 2) return null;
  return `${busiest.weight} requests nearby`;
}
