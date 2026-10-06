/**
 * Current-location policy, as pure functions.
 *
 * Everything about "where is the commuter right now" is a state machine with
 * five ways to fail, and every one of those failures needs a *different* thing
 * on screen: a refusal wants an explanation and a manual field, a timeout wants
 * a retry, a dead GPS wants "try again" rather than a lecture. Deciding that
 * inside a component is how the same status ends up rendering three different
 * things in three different places — the pickup screen, the booking screen, and
 * the header.
 *
 * So the rules live here, next to the geocoding and geo helpers, and both the
 * hook and the screens read them. No React and no browser globals, so this is
 * testable on its own: the interesting question about a location feature is not
 * "does it render" but "does it say the right thing when the phone says no".
 */

import { haversineKm } from "./geo";
import type { LatLng } from "./map-service";

/**
 * The status vocabulary of `useGeolocation`, redeclared here as a structural
 * type rather than imported.
 *
 * The hook owns the state machine; this module only needs to reason about which
 * status means what. Importing the hook would drag React (and the whole
 * permission-querying effect) into a file that is imported by tests, a
 * Convex function, and a plain script, so the coupling is kept one-way and
 * type-level instead.
 */
export type LocationStatus =
  | "idle"
  | "locating"
  | "ready"
  | "denied"
  | "unavailable"
  | "timeout"
  | "error";

/**
 * The zoom a GPS-seeded pickup opens at.
 *
 * City-wide (13) is right for browsing Bukidnon and useless for confirming a
 * gate — at 13 a whole city fills the screen, so a pin "on the right street"
 * is indistinguishable from one three streets over. 15 is roughly a
 * neighbourhood: close enough to see the road you are standing on, wide enough
 * to still recognise where you are. This is the same number the drag-to-edit
 * pin already uses for a chosen point, deliberately — a confirmed pin and a
 * GPS seed should not change how big the map is.
 */
export const CURRENT_LOCATION_ZOOM = 15;

/**
 * The dot for "you are here".
 *
 * Blue, not brand red. Red is the brand colour and it is already the pickup,
 * the destination, the route line and the rider car; if the current-location
 * dot were red too, a commuter could not tell "this is where I am" from "this
 * is where the rider is going" — which is the one distinction the dot exists to
 * make. It is the conventional blue of every other map app, and the one colour
 * in the palette nobody will misread as a brand pin.
 */
export const CURRENT_LOCATION_COLOR = "#1d6ff2";

/** True while a fix is being asked for, either at load or on a manual retry. */
export function isDetecting(status: LocationStatus): boolean {
  return status === "locating" || status === "idle";
}

/**
 * Whether the screen must offer a typed address instead of waiting on GPS.
 *
 * Denied, dead signal, timed out and hard failure all mean the same thing from
 * the commuter's side: nothing is going to arrive, so the only way forward is
 * to let them type or tap. `ready` and an in-flight `locating` are the two
 * states where the pin is either coming or already there.
 */
export function needsAddressFallback(status: LocationStatus): boolean {
  return (
    status === "denied" ||
    status === "unavailable" ||
    status === "timeout" ||
    status === "error"
  );
}

/**
 * Whether a retry button should be offered.
 *
 * A refusal is *not* retryable in any useful sense: once Block is clicked,
 * accepting again does nothing until the permission is reset from the address
 * bar, so a button that says "try again" there would be a lie. Everything else
 * is a transient failure that a second attempt genuinely can fix.
 */
export function canRetry(status: LocationStatus): boolean {
  return status !== "denied";
}

/**
 * The one-line explanation for a failed fix, for screens that show their own
 * copy.
 *
 * Null for the states where there is nothing to explain: a fix in progress, and
 * a fix we have. The wording is deliberately short and the second sentence says
 * what to *do*, because "GPS unavailable" on its own sends somebody out to
 * check the sky when the real problem is a browser setting.
 */
export function locationNotice(
  status: LocationStatus,
  hasPermissionPrompt: boolean,
): string | null {
  switch (status) {
    case "denied":
      return hasPermissionPrompt
        ? "Location permission is blocked for Fetch. Turn it back on in your browser's site settings, then try again."
        : "This browser will not share your location with Fetch. You can still set your pickup by searching or tapping the map.";
    case "unavailable":
      return "We could not get a GPS fix here. Move somewhere with a clearer view of the sky, or set your pickup by searching or tapping the map.";
    case "timeout":
      return "Finding your location took too long. Try again, or set your pickup by searching or tapping the map.";
    case "error":
      return "Something went wrong reading your location. Try again, or set your pickup by searching or tapping the map.";
    default:
      return null;
  }
}

/**
 * How far the GPS fix is from the pin that is actually going to be used.
 *
 * Returned in metres because that is the unit the number is judged in: a pin
 * within ~30 m of the fix is the same gate on a phone with a couple of bars,
 * while 200 m away is a different street. The UI uses it to tell the commuter
 * their pin may be off — which is the honest thing to say, because every GPS
 * fix on a phone is a few metres out and the map is drawn at zoom 15 where ten
 * metres is a visible gap.
 */
export function distanceToFixMeters(
  point: LatLng | null | undefined,
  fix: LatLng | null | undefined,
): number | null {
  if (!point || !fix) return null;
  return Math.round(haversineKm(point, fix) * 1000);
}

/**
 * Whether to warn that the pinned point is well away from the GPS fix.
 *
 * The threshold is deliberately generous (30 m). Tightening it to "10 m" would
 * mean warning on almost every fix in a dense town, which trains people to
 * ignore the notice; loosening it to 100 m would mean warning about a pin the
 * rider would reach in ninety seconds.
 */
export function shouldWarnFixDrift(distanceMeters: number | null): boolean {
  return distanceMeters !== null && distanceMeters > 30;
}

/**
 * Coordinates as a human-readable string, the last resort for a point the
 * geocoder could not name.
 *
 * Five decimals is about a metre — more precision than a GPS fix or a map tap
 * is worth, and fewer digits than the raw float prints (8.1550421), which looks
 * like a bug to anybody reading an address.
 */
export function formatCoords(point: LatLng): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

/**
 * Whether two points are the same place, for "is this pin already my fix?".
 *
 * Compared at five decimals — the same precision `formatCoords` prints, about a
 * metre — because that is the finest distinction the UI can show anyway. Two
 * pins within a metre of each other drawn at zoom 15 are one dot to the user,
 * so rendering them as two is a rendering artefact, not information.
 */
export function isSamePlace(
  a: LatLng | null | undefined,
  b: LatLng | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5
  );
}