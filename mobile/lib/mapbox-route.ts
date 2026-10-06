/**
 * Map route geometry helpers for the mobile map.
 *
 * The visible map is the first thing we are proving out with Mapbox. The route
 * line between pickup and drop-off starts as a straight line, because that is what
 * works immediately without another provider or a server round trip. Later, when
 * the app has a real routing source, this file is where that geometry is turned
 * into the shape the map draws.
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
 * Used as the first route line on the mobile map. It is not a driving route; it is
 * the geometric line between two points so the map shows a connection while the
 * real routing source is added later.
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
