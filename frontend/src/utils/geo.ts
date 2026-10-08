/**
 * Pure geometry for the mock app: distance and the fare a service charges for
 * it. No network, no clock — the same inputs always give the same quote.
 */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineKm(from: Point, to: Point): number {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Roads are not straight lines; mock trips sit between the two. */
const ROAD_FACTOR = 1.3;

export const roadDistanceKm = (from: Point, to: Point): number =>
  Math.round(haversineKm(from, to) * ROAD_FACTOR * 10) / 10;

interface FareRates {
  baseFare: number;
  perKmFare: number;
}

export const estimateFare = (rates: FareRates, distanceKm: number): number =>
  Math.round(rates.baseFare + rates.perKmFare * distanceKm);
