export type LatLng = { lat: number; lng: number };

export type Tariff = {
  minFare: number;
  includedDistanceKm: number;
  ratePerKm: number;
  /**
   * Distance at which the long-trip rate takes over. Optional, and absent on
   * tariff rows published before long trips were priced separately — those are
   * still billed at `ratePerKm` all the way, which is what they were quoted.
   */
  longTripThresholdKm?: number;
  /** The per-km rate beyond `longTripThresholdKm`. */
  longTripRatePerKm?: number;
  /** Floor for a pasugo request, whatever the store → drop-off leg measures. */
  errandMinFare: number;
  /** Flat cover for the store stop itself: parking, queueing, carrying. */
  stopFee: number;
};

/**
 * What the distance beyond the included allowance costs.
 *
 * One implementation for the whole app, deliberately in this file rather than in
 * `fare-breakdown.ts`: that module imports `geo`, so putting it there and having
 * `geo` call it back would be a cycle. Everything that prices distance — the
 * quote, the ride that gets created from it, the rider's corrected-store
 * repricing, and the client-side estimate — goes through here, because the one
 * thing a fare cannot afford is two implementations that quietly disagree.
 *
 * Two bands: `ratePerKm` up to `longTripThresholdKm`, then `longTripRatePerKm`
 * beyond it. A long trip costs more per kilometre, not a surcharge on top — a
 * rider running Malaybalay to Valencia is on the road long enough that fuel and
 * time both cost more, and a flat rate quietly under-pays them for it.
 *
 * Absent or nonsensical band settings fall back to the flat rate, so a tariff
 * row that never sets them keeps behaving exactly as it did before.
 */
export function distanceFareFor(distanceKm: number, tariff: Tariff): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= tariff.includedDistanceKm) {
    return 0;
  }
  const firstBandKm = Math.max(0, distanceKm - tariff.includedDistanceKm);
  const threshold = tariff.longTripThresholdKm;
  const longRate = tariff.longTripRatePerKm;

  // A threshold at or below the included distance would make the first band
  // empty and price the whole trip long, so it is treated as "no second band".
  const banded =
    Number.isFinite(threshold) &&
    Number.isFinite(longRate) &&
    threshold !== undefined &&
    longRate !== undefined &&
    threshold > tariff.includedDistanceKm &&
    longRate > 0;

  if (!banded) return firstBandKm * tariff.ratePerKm;

  const band1Km = Math.min(firstBandKm, threshold - tariff.includedDistanceKm);
  const band2Km = firstBandKm - band1Km;
  return band1Km * tariff.ratePerKm + band2Km * longRate;
}

/** Identical to the defaults seeded on the server; used before tariff loads. */
export const DEFAULT_TARIFF: Tariff = {
  minFare: 60,
  includedDistanceKm: 5,
  ratePerKm: 10,
  longTripThresholdKm: 10,
  longTripRatePerKm: 20,
  errandMinFare: 90,
  stopFee: 25,
};

/** Mirrors NEAR_STORE_KM on the server: below this a store pin looks suspect. */
export const NEAR_STORE_KM = 0.5;

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Display-only estimate. The server recomputes distance and fare from raw
 * coordinates when the ride is created — this value is never authoritative.
 * Mirrors computeFare() so a bad coordinate can never render "\u20B1NaN" or a
 * fare that disagrees with the one the server will charge.
 */
export function estimateFare(distanceKm: number, tariff: Tariff): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return tariff.minFare;
  }
  const extra = distanceFareFor(distanceKm, tariff);
  return Math.round((tariff.minFare + extra) * 100) / 100;
}

/**
 * Display-only pabili/padala estimate. Mirrors computeErrandFare() on the
 * server, so the fee shown before requesting is the fee charged after it.
 */
export function estimateErrandFare(distanceKm: number, tariff: Tariff): number {
  const distanceFare = estimateFare(distanceKm, tariff);
  const floor = Math.max(distanceFare, tariff.errandMinFare);
  return Math.round((floor + tariff.stopFee) * 100) / 100;
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDistance(km: number): string {
  return `${km.toFixed(1)} km`;
}

/**
 * Blended door-to-door speed used for the ETA, in km/h.
 *
 * FETCH runs in Bukidnon, where the Valencia–Malaybalay corridor is a two-lane
 * highway that passes through town centres, tricycles and school zones. 22 km/h
 * is the honest blend for that: not the highway limit, not a city-centre crawl.
 * Under-promising a pickup time is better than missing an over-promise.
 *
 * ETA is display-only, like the fare estimate — the server owns distance and
 * price, and nothing here is ever charged or promised.
 */
export const AVERAGE_SPEED_KMH = 22;

/**
 * Trip time in whole minutes, rounded up.
 *
 * Rounded up rather than nearest because the number is a promise: "9 min"
 * arriving in 8 reads as early, while "8 min" arriving in 9 reads as late.
 * Returns 0 for a distance that cannot be timed, and callers render that as a
 * dash rather than as "0 min".
 */
export function estimateEtaMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.max(1, Math.ceil((distanceKm / AVERAGE_SPEED_KMH) * 60));
}

/** "8 min" or "1 hr 5 min"; a dash when there is nothing to promise. */
export function formatEta(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function shortAddress(address?: string | null): string {
  if (!address) return "Dropped pin";
  const parts = address.split(",").map((p) => p.trim());
  return parts.slice(0, 2).join(", ");
}

/** Normalize a browser/geolocation permission result to a stable union. */
export function geoPermission(p: unknown): "granted" | "denied" | "prompt" | "unknown" {
  if (p === "granted") return "granted";
  if (p === "denied") return "denied";
  if (p === "prompt") return "prompt";
  return "unknown";
}
