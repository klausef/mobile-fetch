/**
 * Map route geometry helpers for the mobile map.
 *
 * The visible map is the first Mapbox surface FETCH builds. The route line between
 * pickup and drop-off starts as a straight line, because that is what works
 * immediately without another provider or a server round trip. The real driving
 * line replaces it when OpenRouteService is available — same HeiGIT host and the
 * same key the browser uses — so the phone and the web app draw from the same road.
 */

// The coordinate type comes straight from the shared core, the way
// `lib/shared.ts` reaches the rest of it. Deliberately not the `@/lib/...` alias:
// the shared barrel also re-exports React Native components, and this file is
// read by the repo's test project too, where `@/*` points at the web app.
import type { LatLng } from "../../src/lib/geo";

export type RouteCoordinate = [number, number];

/**
 * Mapbox Native renders coordinates as GeoJSON order: `[longitude, latitude]`.
 * This helper converts that into the app's `{ lat, lng }` shape.
 */
export function geojsonToLatLngs(
  coordinates: RouteCoordinate[],
): LatLng[] {
  return coordinates.map(([lng, lat]) => ({ lat, lng }));
}

/**
 * A straight line from `from` to `to`.
 *
 * The geometric line between two points — the fallback route line the map draws
 * when there is no road routing available.
 */
export function straightLine(
  from: LatLng,
  to: LatLng,
): RouteCoordinate[] {
  return [
    [from.lng, from.lat],
    [to.lng, to.lat],
  ];
}

/**
 * OpenRouteService's driving route as GeoJSON coordinates.
 *
 * Same provider and host the phone already uses for `drivingDistanceKm`, so the
 * drawn line and the priced distance are built from the same road. Returns the
 * straight line when the key is missing, offline, rate-limited, or the pair is
 * unroutable — never throws, so the map always has something between the pins.
 */
export async function drivingRoute(
  from: LatLng,
  to: LatLng,
  token: string,
): Promise<RouteCoordinate[]> {
  const host =
    "https://api.heigit.org/openrouteservice/v2/directions/driving-car";
  if (!token) return straightLine(from, to);

  const params = new URLSearchParams({
    api_key: token,
    start: `${from.lng},${from.lat}`,
    end: `${to.lng},${to.lat}`,
  });

  try {
    const response = await fetch(`${host}?${params.toString()}`);
    if (!response.ok) return straightLine(from, to);
    const payload = (await response.json()) as {
      features?: Array<{ geometry?: { coordinates?: RouteCoordinate[] } }>;
    };
    const coordinates =
      payload.features?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) {
      return straightLine(from, to);
    }
    return coordinates;
  } catch {
    return straightLine(from, to);
  }
}
