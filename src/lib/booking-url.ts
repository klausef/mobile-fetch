import type { BookingType } from "./booking";

/**
 * The handoff between the home hub and the booking screen.
 *
 * A commuter taps a service card, a search result, or a saved place on Home,
 * and the booking form has to open with that destination already pinned. The
 * trip crosses a route change, so the URL is the only thing that can carry it:
 * a link can be shared, bookmarked, and reloaded, and it survives the back
 * button. Keeping the two halves here — writing the link and reading it back —
 * is what stops the writer and the reader from disagreeing about the format.
 */

/** A place the commuter picked, in the shape the search returns it. */
export type PickedPlace = {
  lat: number;
  lng: number;
  label: string;
};

/** A pinned point, as the booking form holds it. */
export type PrefillPoint = {
  lat: number;
  lng: number;
  address: string;
};

export type BookingPrefill = {
  destination: PrefillPoint | null;
  pickup: PrefillPoint | null;
};

/**
 * Longest address we put in a URL.
 *
 * A geocoder will happily return a full address with a building, a barangay
 * and a city. It all round-trips fine, but the link is only ever read by the
 * app, and a 400-character query string is a link nobody can share.
 */
const MAX_LABEL = 120;

/** The booking screen, carrying a destination and optionally a pickup. */
export function bookUrl(
  type: BookingType,
  place?: PickedPlace | null,
  pickup?: PickedPlace | null,
): string {
  const params = new URLSearchParams({ type });
  if (place) {
    params.set("lat", String(place.lat));
    params.set("lng", String(place.lng));
    params.set("q", place.label.slice(0, MAX_LABEL));
  }
  if (pickup) {
    params.set("plat", String(pickup.lat));
    params.set("plng", String(pickup.lng));
    params.set("pq", pickup.label.slice(0, MAX_LABEL));
  }
  return `/book?${params.toString()}`;
}

/** The two location screens, and which end of the trip each one sets. */
export type LocationStep = "pickup" | "destination";

const STEP_PATHS: Record<LocationStep, string> = {
  pickup: "/book/pickup",
  destination: "/book/destination",
};

/** The parameter prefix each end owns: destination is unsuffixed, pickup is p. */
const STEP_KEYS: Record<LocationStep, { lat: string; lng: string; q: string }> =
  {
    destination: { lat: "lat", lng: "lng", q: "q" },
    pickup: { lat: "plat", lng: "plng", q: "pq" },
  };

/**
 * The booking, with one end replaced, keeping everything else.
 *
 * The location screens are separate routes that hand a point back to the
 * booking form, so they have to write the same parameter names the reader
 * understands. A screen that built its own query string would be a second
 * writer of this format, and the disagreement would not throw — it would park
 * a pin in the ocean, or drop the service type.
 */
export function bookingParamsWith(
  params: URLSearchParams,
  which: LocationStep,
  point: PickedPlace | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const keys = STEP_KEYS[which];
  if (!point) {
    next.delete(keys.lat);
    next.delete(keys.lng);
    next.delete(keys.q);
    return next;
  }
  next.set(keys.lat, String(point.lat));
  next.set(keys.lng, String(point.lng));
  next.set(keys.q, point.label.slice(0, MAX_LABEL));
  return next;
}

/**
 * A link to one of the location screens, carrying the booking with it.
 *
 * The trip type and the other end travel in the query so stepping back and
 * forth never loses them: a commuter who sets the pickup, changes their mind
 * about the destination, and goes back to nudge the pickup is still booking a
 * pabili with both ends intact.
 */
export function locationStepUrl(
  step: LocationStep,
  params: URLSearchParams,
): string {
  const query = bookingParamsWith(params, step, null).toString();
  const path = STEP_PATHS[step];
  return query ? `${path}?${query}` : path;
}

/** Where Next goes once an end is set: the other step, or the booking form. */
export function nextStepUrl(
  step: LocationStep,
  params: URLSearchParams,
  point: PickedPlace,
): string {
  const next = bookingParamsWith(params, step, point);
  const path =
    step === "pickup" ? STEP_PATHS.destination : "/book";
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

function readPoint(
  lat: string | null,
  lng: string | null,
  address: string | null,
): PrefillPoint | null {
  if (!lat || !lng || !address) return null;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  // A hand-edited, truncated or stale link must not park a pin in the ocean.
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  if (Math.abs(parsedLat) > 90 || Math.abs(parsedLng) > 180) return null;
  return { lat: parsedLat, lng: parsedLng, address };
}

/**
 * Read back whatever the hub sent. Each end is independent: a link may carry a
 * destination, a pickup, both (a repeated trip), or neither (a plain service
 * link), and anything malformed is dropped rather than half-applied.
 */
export function readBookingPrefill(
  params: URLSearchParams,
): BookingPrefill {
  return {
    destination: readPoint(
      params.get("lat"),
      params.get("lng"),
      params.get("q"),
    ),
    pickup: readPoint(
      params.get("plat"),
      params.get("plng"),
      params.get("pq"),
    ),
  };
}
