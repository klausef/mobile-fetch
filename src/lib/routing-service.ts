/**
 * Road routing via OpenRouteService.
 *
 * The map draws a route line from a list of points. Two things can produce that
 * list:
 *
 *   • OpenRouteService — the real driving line, snapped to roads, when
 *     `VITE_ORS_KEY` is configured. This is what makes the drawn route look
 *     like a route instead of a ruler held across the map.
 *   • A straight line between the endpoints — the fallback. Always available,
 *     needs no key, and never leaves the map without a route between pickup and
 *     drop-off while a request is in flight or a key is missing.
 *
 * The fallback is deliberately not an error state. A ride-hailing map that
 * shows no route at all when a third party is down is worse than one that shows
 * an honest straight line, so callers get a usable geometry either way and
 * never have to branch on it.
 */

import { hasOrs, ORS_KEY, type LatLng } from "@/lib/map-service";

/**
 * Driving directions. Public-transport and foot profiles exist but are unused.
 *
 * Hosted on HeiGIT rather than at openrouteservice.org, because that is where
 * `VITE_ORS_KEY` is issued from — it is a HeiGIT token, not an ORS API key. Both
 * hosts answered identically while this was being checked, but calling a
 * HeiGIT token against the official ORS service is relying on it being tolerated
 * rather than on it being honoured, and that is the kind of thing that works in
 * staging and 403s later.
 */
const ORS_DIRECTIONS =
  "https://api.heigit.org/openrouteservice/v2/directions/driving-car";

/**
 * The straight-line geometry through a chain of segments.
 *
 * Consecutive segments share an endpoint, so only the first point is pushed
 * before each segment's destination — otherwise the shared vertex appears twice
 * and the line draws a zero-length kink at every joining point.
 */
export function straightGeometry(
  segments: [LatLng, LatLng][] | null,
): LatLng[] {
  if (!segments || segments.length === 0) return [];
  const points: LatLng[] = [];
  segments.forEach(([from, to], index) => {
    if (index === 0) points.push(from);
    points.push(to);
  });
  return points;
}

/**
 * The driving route between two points, or null when it cannot be fetched.
 *
 * Null is the "use the straight line" signal, so this never throws and never
 * returns a partial geometry: every failure — no key, offline, a rate limit, an
 * unroutable pair of points — collapses to the same answer.
 */
/**
 * ORS coordinates into the app's own shape.
 *
 * Split out and exported purely so the axis order is assertable. Every other
 * failure in this file answers `null`, which the caller draws as a straight
 * line — so a route that silently answered with the axes swapped still *looks*
 * like a working map, just one drawn between mirrored points on the far side of
 * the planet. Nothing else about this path would fail; only this line knows the
 * right answer.
 */
export function toLatLngs(coordinates: [number, number][]): LatLng[] {
  return coordinates.map(([lng, lat]) => ({ lat, lng }));
}

export async function fetchRoute(
  from: LatLng,
  to: LatLng,
): Promise<LatLng[] | null> {
  if (!hasOrs) return null;

  // ORS reads coordinates as lng,lat — the opposite order from the rest of the
  // app. Getting this backwards silently routes to the wrong hemisphere.
  const params = new URLSearchParams({
    api_key: ORS_KEY,
    start: `${from.lng},${from.lat}`,
    end: `${to.lng},${to.lat}`,
  });

  try {
    const res = await fetch(`${ORS_DIRECTIONS}?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    const coordinates = data.features?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return null;
    return toLatLngs(coordinates);
  } catch {
    // Network error, CORS, or a malformed body: the straight line stands in.
    return null;
  }
}
