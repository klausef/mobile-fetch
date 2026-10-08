/**
 * The app's one current-location fix, shared by every screen.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Two screens needed the same thing (a fix, its address, a way to ask again),
 * and each had grown its own `useGeolocation()` call. That is not just
 * duplication: two mounts of that hook means two `getCurrentPosition` calls,
 * two permission reads, and — worse — two *answers*, because the second fix can
 * be tens of metres from the first and the "Pickup from" row and the map pin
 * can then disagree. One request, one answer, one address, for the whole
 * session.
 *
 * ── Why the request fires when the booking starts ───────────────────────────
 * A commuter who has to find a crosshair before the app will tell them where
 * they are is doing three taps before anything useful appears — so the request
 * is not deferred forever, only past the point where it can be *answered*. The
 * app no longer asks while it is still loading: a prompt against a page that
 * has not asked for anything is dismissed far more often than it is answered,
 * and in a browser a refusal is sticky. `useAutoDetectOnBooking` asks the
 * moment the commuter opens a booking screen, which is a gesture the prompt can
 * be tied to, and a fix that times out on a cold GPS gets a second attempt
 * there rather than never.
 *
 * ── Why the address is resolved once, here ──────────────────────────────────
 * Reverse geocoding is a network request. Both the pickup screen and the
 * booking screen want the same string for the same coordinates, and each used
 * to ask for it separately. `describePoint` results are cached by point here,
 * so the second screen to mount reads a resolved label instead of firing a
 * second request, and a re-render never re-resolves a point that is already
 * named.
 */

import { useEffect, useRef, useState } from "react";
import { describePoint, type LatLng } from "@/lib/map-service";
import {
  canRetry,
  isDetecting,
  locationNotice,
  needsAddressFallback,
  type LocationStatus,
} from "@/lib/location";
import {
  useGeolocation,
  type GeoCoords,
  type GeoPermission,
} from "./use-geolocation";

/** A fix plus the best name we have for it. */
export interface CurrentLocation {
  /** The browser's own verdict; drives every message and spinner on screen. */
  status: LocationStatus;
  /** The raw fix, or null until one arrives (and after a failure). */
  coords: GeoCoords | null;
  /** The resolved address for `coords`, or null while it is still in flight. */
  address: string | null;
  /** True while a fix exists but its address has not come back yet. */
  resolvingAddress: boolean;
  /** True while a fix is actually being asked for — a request in flight. */
  detecting: boolean;
  /**
   * True when GPS cannot be relied on and the screen should offer a typed
   * address instead of leaving the commuter staring at a loading map.
   */
  needsFallback: boolean;
  /** The sentence to show for a failed fix, or null when there is nothing wrong. */
  notice: string | null;
  /** What the browser says about this origin, for the "how to undo this" hint. */
  permission: GeoPermission;
  /** Set when the *environment* forbids location (no HTTPS, iframe), not the user. */
  blockedByEnvironment: string | null;
  /**
   * Ask again, from scratch.
   *
   * Resolves with the fresh fix, or null if it failed — a caller that wants to
   * react to failure reads `notice`/`needsFallback` rather than catching, so a
   * button handler never needs a try/catch around "use my location".
   */
  refresh: () => Promise<GeoCoords | null>;
}

/** Cache key for a resolved address: five decimals, which is about a metre. */
function pointKey(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

/**
 * Reverse-geocode a fix, remembering the answer.
 *
 * A module-level cache rather than component state, because the point of this
 * hook is that two screens asking about the same place get the same string
 * without a second request. Bounded and simple: it holds one entry per distinct
 * point the commuter has stood at this session, which on a normal trip is one,
 * and is cleared by a reload anyway. `inFlight` additionally collapses two
 * simultaneous requests for the same point into one, which is what happens when
 * the pickup screen and the booking screen mount together after a refresh.
 */
const addressCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function resolveAddress(point: LatLng): Promise<string | null> {
  const key = pointKey(point);
  const cached = addressCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = describePoint(point)
    .then((found) => {
      // A point with no address is cached too. Re-asking a geocoder that has
      // already said "nothing here" on every mount is how a rider-facing screen
      // ends up burning its rate limit on a coordinate in the middle of a field.
      addressCache.set(key, found);
      return found;
    })
    .catch(() => {
      // Never reject: an unreachable geocoder is a missing label, not an error
      // the caller has to handle, and the coordinates still make a usable pin.
      addressCache.set(key, null);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

/**
 * One fix, one address, for the whole app session.
 *
 * Mounted once, high in the tree (see `main.tsx`), so that navigating between
 * the booking screens does not re-ask the browser. The browser itself caches
 * the permission decision, so this is not about the prompt appearing twice —
 * it is about the *answer* being stable while the commuter moves between
 * screens that display it.
 */
export function useCurrentLocation({ auto }: { auto?: boolean } = {}): CurrentLocation {
  const geo = useGeolocation({ auto });
  /**
   * The last resolved address, tagged with the point it belongs to.
   *
   * Tagged rather than stored bare for two reasons. A *new* fix has to read as
   * unresolved — the field shows a spinner — while the previous street is still
   * on screen, rather than the old label silently standing in for the new one;
   * that is the bug this prevents, a commuter who has moved two kilometres
   * seeing their old address after the map has already moved. And "resolved as
   * nothing" has to be distinguishable from "not resolved yet": the geocoder
   * answering null is a finished answer, and treating it as pending would spin
   * forever on a point in the middle of a field.
   */
  const [described, setDescribed] = useState<{
    key: string;
    label: string | null;
  } | null>(null);

  const coords = geo.coords;
  const lat = coords?.lat;
  const lng = coords?.lng;

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    const point: LatLng = { lat, lng };
    const key = pointKey(point);
    let cancelled = false;
    void resolveAddress(point).then((found) => {
      if (cancelled) return;
      setDescribed({ key, label: found });
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const key =
    lat !== undefined && lng !== undefined ? pointKey({ lat, lng }) : null;
  const settled = described !== null && described.key === key;

  const detecting = isDetecting(geo.status);
  const fallback = needsAddressFallback(geo.status);

  return {
    status: geo.status,
    coords,
    address: settled ? described.label : null,
    resolvingAddress: coords !== null && !settled,
    detecting,
    needsFallback: fallback,
    notice: locationNotice(geo.status, geo.permission === "prompt"),
    permission: geo.permission,
    blockedByEnvironment: geo.blockedByEnvironment,
    refresh: geo.locate,
  };
}

/**
 * How many fixes a booking screen asks for on its own before leaving it to the
 * retry card. Two: one for the common case, one more for a cold GPS that
 * answers `timeout` on the first go — which is exactly the failure that used to
 * leave the map parked on the city default for the whole session.
 */
const AUTO_DETECT_ATTEMPTS = 2;

/**
 * Ask for a fix the moment a booking screen opens.
 *
 * This is where the permission prompt belongs. The hook no longer asks when
 * the app loads, so without this the app would sit in `idle` until somebody
 * found the crosshair button — and a booking with no pickup is the one moment
 * the answer is actually needed.
 *
 * Guarded four ways so it can never loop or nag:
 *  - a fix already exists → nothing to ask for;
 *  - a request is already in flight → one at a time;
 *  - the browser has refused → asking again cannot succeed, and the screen
 *    shows the "turn it back on in site settings" card instead;
 *  - `AUTO_DETECT_ATTEMPTS` reached → the manual retry card takes over.
 */
export function useAutoDetectOnBooking(here: CurrentLocation): void {
  const attempts = useRef(0);
  const { status, coords, refresh } = here;
  useEffect(() => {
    if (coords !== null) return;
    if (status === "locating") return;
    if (!canRetry(status)) return;
    if (attempts.current >= AUTO_DETECT_ATTEMPTS) return;
    attempts.current += 1;
    void refresh();
  }, [coords, status, refresh]);
}