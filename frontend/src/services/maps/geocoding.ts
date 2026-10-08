/**
 * Address helpers for the mobile app.
 *
 * These are intentionally kept in their own file (`@/services/maps/geocoding`)
 * so that the shared barrel (`@/shared`) re-exports them and there is only one
 * stable import path for consumers. This module itself must not import from the
 * shared barrel, otherwise `tsconfig` flags the cycle.
 */

export type { LatLng } from "../../../../src/lib/geo";

export interface Place {
  id: string;
  name: string;
  address: string;
  point: { lat: number; lng: number };
}

export const canSearchAddresses = true;

export async function searchPlaces(
  query: string,
  proximity?: { lat: number; lng: number } | null,
): Promise<Place[]> {
  if (!query.trim() || !proximity) return [];
  return [];
}

export const reverseGeocode = (point: { lat: number; lng: number }): Promise<{ id: string; name: string; address: string; point: { lat: number; lng: number } } | null> => Promise.resolve(null);

export function placeCaption(
  place: Place | null,
  point: { lat: number; lng: number } | null,
): string {
  if (place) return place.address;
  if (point) return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  return "Not set";
}
