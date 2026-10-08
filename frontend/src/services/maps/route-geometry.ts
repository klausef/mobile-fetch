/**
 * Route geometry helpers for the phone's map screens.
 *
 * Everything here is pure: a line in, a line out, no React and no map library.
 * That is what makes the seam worth having — the same functions run in a test
 * (`tests/mobile-map-route.test.ts`) and on a device, and the parts that are
 * easiest to get wrong in a map migration are exactly these.
 *
 * Two coordinate orders meet in this file, and keeping them apart is the whole
 * point. GeoJSON and every native map SDK speak `[longitude, latitude]`; the
 * app's own types, the Convex backend and the shared fare core all speak
 * `{ lat, lng }`. A swapped axis silently routes to the wrong hemisphere and
 * still "looks" like a line, so the conversion lives here, once, with tests
 * asserting the exact shape rather than trusting a typecheck-only pass.
 */

/** `[longitude, latitude]` — the GeoJSON order every map wants. */
export type RouteCoordinate = [number, number];

/** The app's own point shape, matching `LatLng` in the shared core. */
export type RoutePoint = { lat: number; lng: number };

/**
 * The straight line between two points, in GeoJSON order.
 *
 * The fallback for every failure mode below, and the line the map draws while
 * the directions request is in flight. A route that ignores roads is still a
 * usable route line for the distance the fare is priced on; a missing one is
 * not.
 */
export function straightLine(from: RoutePoint, to: RoutePoint): RouteCoordinate[] {
  return [
    [from.lng, from.lat],
    [to.lng, to.lat],
  ];
}

/**
 * Bridge a native route geometry into the app's point shape.
 *
 * Mapbox and ORS both hand back `[lng, lat]` pairs; this flips them to the
 * `{ lat, lng }` the screens, the store and the fare maths read. Accepts a
 * single-point geometry (some degradations return one) and returns exactly as
 * many points as it was given.
 */
export function geojsonToLatLngs(coordinates: RouteCoordinate[]): RoutePoint[] {
  return coordinates.map(([lng, lat]) => ({ lat, lng }));
}

/**
 * The driving line between two points from OpenRouteService, or the straight
 * line when that cannot be had.
 *
 * Every failure collapses to the straight line rather than throwing: a missing
 * key, an offline device, a rate-limited account and an unroutable pair
 * (two pins across water, say) all mean the same thing from the commuter's
 * side — show the trip as the crow flies — and none of them is worth a screen
 * with no line on it.
 *
 * The token is passed in rather than read from app config so a caller decides
 * its own build-time source; an empty string means "no key" and short-circuits
 * without a request.
 */
export async function drivingRoute(
  from: RoutePoint,
  to: RoutePoint,
  token: string,
): Promise<RouteCoordinate[]> {
  if (!token.trim()) return straightLine(from, to);

  try {
    const body = {
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      // The five hundred metres of leeway ORS needs before it will snap a pin
      // to a road a rider cannot legally reach is the default profile; asking
      // for the plain driving line is what the map draws.
      instructions: false,
    };
    const response = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) return straightLine(from, to);

    const payload = (await response.json()) as {
      features?: { geometry?: { coordinates?: RouteCoordinate[] } }[];
    };
    const coordinates = payload.features?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return straightLine(from, to);
    return coordinates;
  } catch {
    // Offline, rate-limited, DNS failure — all the same answer.
    return straightLine(from, to);
  }
}
