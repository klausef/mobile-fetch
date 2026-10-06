import Constants from "expo-constants";
import { polylineLengthKm, type LatLng } from "@/lib/shared";

/**
 * Road distance via OpenRouteService, priced the same way the web app prices.
 *
 * The web build draws the driving line on a MapLibre canvas; a phone with no
 * map still needs the *length* of that line, because a straight-line estimate
 * understates a Bukidnon highway trip by about a third. Same provider, same
 * HeiGIT host, same key as the browser — so the fare quoted on the phone and
 * the fare quoted in the browser are built from the same road.
 *
 * Like the web helper, this never throws. Every failure — no key, offline, a
 * rate limit, an unroutable pair — answers `null`, and the caller falls back to
 * the straight line through `resolveBillableKm`, which is also what the server
 * does with a claim it cannot prove.
 */

const extra = (Constants.expoConfig?.extra ?? {}) as {
  orsKey?: string;
};

const ORS_KEY = extra.orsKey ?? "";

export const hasRoadRouting = ORS_KEY.length > 0;

const ORS_DIRECTIONS =
  "https://api.heigit.org/openrouteservice/v2/directions/driving-car";

export async function drivingDistanceKm(
  from: LatLng,
  to: LatLng,
): Promise<number | null> {
  if (!ORS_KEY) return null;
  // ORS reads coordinates as lng,lat — the opposite order from the rest of the
  // app. Getting this backwards routes to the wrong hemisphere without failing.
  const params = new URLSearchParams({
    api_key: ORS_KEY,
    start: `${from.lng},${from.lat}`,
    end: `${to.lng},${to.lat}`,
  });
  try {
    const response = await fetch(`${ORS_DIRECTIONS}?${params.toString()}`);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    const coordinates = payload.features?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return null;
    const points = coordinates.map(([lng, lat]) => ({ lat, lng }));
    return polylineLengthKm(points);
  } catch {
    return null;
  }
}
