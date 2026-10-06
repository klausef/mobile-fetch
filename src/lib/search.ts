/**
 * Destination search, as pure rules.
 *
 * Splitting this out of the components is not tidiness for its own sake. Three
 * of the behaviours requested here are easy to get subtly wrong and impossible
 * to eyeball in a screenshot:
 *
 *  - **Highlighting** has to be correct about *where* the match is. Naive
 *    `toLowerCase().indexOf()` will happily highlight the "san" inside
 *    "Poblacion" for the query "san juan", which reads as a bug and erodes
 *    trust in every other highlight on screen.
 *  - **Capping and de-duplicating** recent destinations is what stops the list
 *    filling with the same market five times under five slightly different
 *    spellings — the failure mode of any naive "push to array" history.
 *  - **Framing two points** has to pick a zoom that actually fits them, and the
 *    naive version of that (use the distance, pick a number) either zooms into
 *    the ground for a ten-metre trip or frames an entire province for a long
 *    one.
 *
 * So they live here, where they can be asserted directly.
 */

import type { LatLng } from "./map-service";
import { haversineKm } from "./geo";

/** How many suggestions the dropdown offers. */
export const MAX_SEARCH_RESULTS = 5;

/** How many destinations the on-device history keeps. */
export const MAX_LOCAL_RECENTS = 5;

/**
 * Longest address kept in the on-device history.
 *
 * Same reason as the server-side one: a geocoder will happily return a full
 * address with building, barangay and city, and a dropdown row that wraps to
 * four lines on a phone is worse than a truncated one.
 */
export const MAX_RECENT_ADDRESS_LENGTH = 120;

/** Longest query worth sending. */
export const MIN_QUERY_LENGTH = 3;

/* ── Highlighting ─────────────────────────────────────────────────────────── */

/** One run of text: highlighted, or not. */
export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Split `text` so the parts matching `query` can be bolded.
 *
 * Every occurrence is marked, not just the first: somebody typing "malaya" and
 * seeing only the first "mal" lit up would conclude the search matched the wrong
 * street.
 *
 * Whitespace in the query matches whitespace in the text, so "malay a" does not
 * highlight across "Malaybalay". An empty query returns the text as one
 * unmatched run, which is what keeps the renderer from having to special-case it.
 */
export function highlightMatches(text: string, query: string): HighlightPart[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !text) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;

  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) {
      parts.push({ text: text.slice(cursor, at), match: false });
    }
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }

  if (cursor === 0) return [{ text, match: false }];
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return parts;
}

/* ── Result shape ─────────────────────────────────────────────────────────── */

/**
 * A suggestion, split into the parts a person reads separately.
 *
 * "24 Poblacion Road, Malaybalay City, Bukidnon" is one string but three facts:
 * where the door is, which town, which province. Bold the first line and grey
 * the rest and the eye can scan the list; print it as one wrapped blob and the
 * eye cannot. Splitting it is done here rather than in the row component so
 * both the dropdown and the map-pin tooltip read the same split.
 */
export interface SearchResult {
  label: string;
  lat: number;
  lng: number;
  /** The street or place name — the line that identifies it. */
  primary: string;
  /** The town or city. Empty when the geocoder gave nothing but a full name. */
  area: string;
  /** The province or region, when it differs from `area`. */
  region: string;
}

/** Longest a single result line may be before it is truncated in storage. */
export function truncateAddress(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > MAX_RECENT_ADDRESS_LENGTH
    ? trimmed.slice(0, MAX_RECENT_ADDRESS_LENGTH - 1)
    : trimmed;
}

/**
 * Turn a comma-separated geocoder label into readable parts.
 *
 * Degrades deliberately: with no commas there is one part and no area, which
 * renders as a single line rather than a row with an empty second line. Philippine
 * addresses are conventionally "house, street, barangay, city, province", so
 * dropping the last element as the region is right far more often than taking
 * the second, which is usually the barangay — a term a commuter outside the
 * town will not recognise as their area.
 */
export function splitPlaceLabel(label: string): {
  primary: string;
  area: string;
  region: string;
} {
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { primary: label, area: "", region: "" };
  if (parts.length === 1) return { primary: parts[0], area: "", region: "" };
  if (parts.length === 2) {
    // Two parts is a street and a town, with no region behind it — and the
    // naive reading of "the second-to-last part is the area" would hand back
    // "Malaybalay City" as *both* the primary line and the area, so the row
    // would say the same thing twice and look like a bug. An area that is also
    // the primary is no area at all.
    return { primary: parts[0], area: "", region: parts[1] };
  }
  return {
    primary: parts.slice(0, -2).join(", ") || parts[0],
    area: parts[parts.length - 2],
    region: parts[parts.length - 1],
  };
}

/**
 * An address in the shape a person reads it: street, then city, then area.
 *
 * Geocoders answer with one comma-separated string of wildly varying depth —
 * a four-part Bukidnon address, a two-part one, a village with no town at all.
 * Shown raw, the important part (the street, which is what a rider needs to
 * find the gate) is buried in a line of administrative noise, and the tail
 * (`Malaybalay City, Bukidnon, Philippines`) says nothing the commuter did not
 * already know.
 *
 * So each field is optional and the caller decides how to render what came
 * back. A two-line result is the common case — street, then "City, Area" — and
 * a place with no street at all still yields something readable rather than an
 * empty box.
 */
export interface AddressLines {
  /** The most specific part: house number and road, when the geocoder gave one. */
  street: string;
  /** The town or city, when there is one. */
  city: string;
  /** The province or wider area, when there is one. */
  area: string;
}

export function formatAddressLines(label?: string | null): AddressLines {
  if (!label || !label.trim()) {
    return { street: "", city: "", area: "" };
  }
  // MapTiler and Nominatim both end Philippine addresses with the country, and
  // the providers disagree about whether they include it. Stripped *before*
  // splitting, because leaving it in shifts every field: "Road, Malaybalay City,
  // Bukidnon, Philippines" splits as a four-part label and hands back "Malaybalay
  // City" glued to the street with "Bukidnon" standing in for the city. Same
  // place, two different readings, depending on the provider.
  const withoutCountry = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(
      (part, index, parts) =>
        !(index === parts.length - 1 && /^(the )?philippines$/i.test(part)),
    )
    .join(", ");

  const { primary, area, region } = splitPlaceLabel(withoutCountry);
  return { street: primary, city: area, area: region };
}

/** "Malaybalay City, Bukidnon" — the parts below the street, or "". */
export function formatAddressSubtitle(label?: string | null): string {
  const { city, area } = formatAddressLines(label);
  return [city, area].filter(Boolean).join(", ");
}

/**
 * Shape a geocoder hit for the UI, and cap the list.
 *
 * The cap is applied here rather than by asking the provider for five, because
 * the two providers answer with different things: MapTiler can return six
 * features that are the same building at six zoom levels of specificity, while
 * Nominatim returns six distinct streets. Filtering happens after the mapping,
 * so a provider that over-delivers still yields a dropdown the right size.
 */
export function toSearchResults(
  places: { label: string; lat: number; lng: number }[],
): SearchResult[] {
  return places.slice(0, MAX_SEARCH_RESULTS).map((place) => ({
    label: place.label,
    lat: place.lat,
    lng: place.lng,
    ...splitPlaceLabel(place.label),
  }));
}

/* ── On-device recents ────────────────────────────────────────────────────── */

/** A destination the commuter picked before, kept on this device only. */
export interface RecentDestination {
  label: string;
  lat: number;
  lng: number;
  /** Epoch millis, so the newest is simply the largest. */
  usedAt: number;
}

/** Identity of a destination, case- and spacing-insensitive. */
export function destinationKey(entry: Pick<RecentDestination, "label">): string {
  return entry.label.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Record a destination as just used, newest first.
 *
 * De-duplicates by address: re-picking the same market must not push it to the
 * top twice, which is how a five-item history becomes three items and two
 * copies of one place. `now` is a parameter rather than a `Date.now()` call so
 * the ordering is testable.
 *
 * Never mutates the input.
 */
export function rememberDestination(
  history: RecentDestination[],
  entry: RecentDestination,
  limit: number = MAX_LOCAL_RECENTS,
): RecentDestination[] {
  const key = destinationKey(entry);
  const kept = history.filter((item) => destinationKey(item) !== key);
  return [{ ...entry, label: truncateAddress(entry.label) }, ...kept].slice(
    0,
    limit,
  );
}

/**
 * Parse stored history, discarding anything unusable.
 *
 * Local storage is edited by hand, survives across app versions, and can hold
 * anything a previous build wrote. A single malformed entry must not blank the
 * whole list, so bad rows are dropped one at a time instead of the read
 * failing and the UI rendering nothing.
 */
export function parseRecentDestinations(raw: string | null): RecentDestination[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const rows: RecentDestination[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Partial<RecentDestination>;
    if (typeof row.label !== "string" || !row.label.trim()) continue;
    if (typeof row.lat !== "number" || !Number.isFinite(row.lat)) continue;
    if (typeof row.lng !== "number" || !Number.isFinite(row.lng)) continue;
    if (Math.abs(row.lat) > 90 || Math.abs(row.lng) > 180) continue;
    rows.push({
      label: truncateAddress(row.label),
      lat: row.lat,
      lng: row.lng,
      usedAt: typeof row.usedAt === "number" && Number.isFinite(row.usedAt) ? row.usedAt : 0,
    });
  }
  return rankDestinations(rows, MAX_LOCAL_RECENTS);
}

/** Newest first, capped. */
export function rankDestinations(
  rows: RecentDestination[],
  limit: number = MAX_LOCAL_RECENTS,
): RecentDestination[] {
  return [...rows].sort((a, b) => b.usedAt - a.usedAt).slice(0, limit);
}

/* ── Framing two points ───────────────────────────────────────────────────── */

/**
 * Zoom bounds for framing both ends.
 *
 * The ceiling stops two ends a few metres apart from asking for a zoom no tile
 * service has — and 15 is close enough to read a street anyway.
 *
 * The floor is deliberately low. Malaybalay to Valencia is about 35 km, which
 * needs roughly zoom 2 to hold both pins on a phone; clamping the floor at 5 —
 * the obvious "never show the whole region" choice — silently produced a map
 * that was centred correctly but had one end off-screen, which is the exact bug
 * framing is supposed to fix.
 */
const MIN_FRAME_ZOOM = 2;
const MAX_FRAME_ZOOM = 16;

/**
 * The zoom at which both ends fit on screen.
 *
 * Derived from the latitude, because that is what decides how many degrees of
 * longitude fit in a screen's width of degrees at a given zoom — and Bukidnon is
 * at 8°N, where that correction is nearly 1.5%, which is the difference
 * between "both pins are just on screen" and "one of them is not".
 *
 * Padding of 0.6 leaves a margin so neither pin sits under a sheet edge.
 */
export function zoomToFit(
  a: LatLng,
  b: LatLng,
  screenPx = 360,
  padding = 0.6,
): number {
  const latSpan = Math.abs(a.lat - b.lat);
  const lngSpan = Math.abs(a.lng - b.lng);
  // Web Mercator: the world is 256·2^z pixels wide, and longitude is linear in
  // it, so the required zoom follows directly from the longitude span.
  const span = Math.max(lngSpan * Math.cos((a.lat * Math.PI) / 180), latSpan);
  if (span <= 0) return MAX_FRAME_ZOOM;
  const padded = span * (1 + padding);
  const zoom = Math.log2(screenPx / 256 / padded);
  const clamped = Math.max(MIN_FRAME_ZOOM, Math.min(MAX_FRAME_ZOOM, zoom));
  return Math.round(clamped * 10) / 10;
}

/**
 * The centre of two points, so both can be on screen at once.
 *
 * The plain midpoint, which is what `easeTo` is given. Framing without moving
 * the camera is the classic bug: the map keeps whatever centre it had, so with
 * two pins at the edges you zoom out and lose both.
 */
export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * Centre and zoom that frame every one of several points.
 *
 * Tracking a rider needs three of them — the commuter, the rider and the
 * drop-off — and `zoomToFit` only takes two. Fitting a *pair* would crop the
 * third out of frame, which is worse than not moving at all: the commuter looks
 * for their destination, does not see it, and concludes the map is broken.
 *
 * So this takes the bounding box of all of them and hands its opposite corners
 * to `zoomToFit`, which already knows how to turn a span into a zoom. Fewer
 * than two points have nothing to frame, so the answer is null and the caller
 * keeps whatever camera it had.
 */
export function fitPoints(
  points: (LatLng | null | undefined)[],
  screenPx = 360,
  padding = 0.6,
): { center: LatLng; zoom: number } | null {
  const live = points.filter(
    (point): point is LatLng =>
      point != null &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng),
  );
  if (live.length < 2) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of live) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  return {
    center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
    zoom: zoomToFit(
      { lat: minLat, lng: minLng },
      { lat: maxLat, lng: maxLng },
      screenPx,
      padding,
    ),
  };
}

/**
 * How long a press must last to count as "drop a pin here".
 *
 * 500 ms is the platform figure and it is right for this gesture: shorter and a
 * slow tap fires it accidentally, longer and it stops feeling like a press at
 * all. A finger that slides more than `tolerancePx` is a pan, not a press, and
 * cancelling on movement is what stops the map jumping while somebody is
 * scrolling to look at something.
 */
export const LONG_PRESS_MS = 400;

/** How far a finger may drift during a press before it counts as a pan. */
export const LONG_PRESS_TOLERANCE_PX = 10;

/* ── Reverse geocoding while a pin is being dragged ───────────────────────── */

/**
 * How long the pin must be still before the address is looked up.
 *
 * A drag emits a coordinate on every pointer frame — sixty a second, and a
 * hundred on a high-refresh screen. Reverse geocoding is a metered HTTP call
 * per request, so geocoding on every frame would spend a commuter's monthly
 * quota in one gesture and get the app rate-limited by the end of it. Waiting
 * for the pin to settle is both cheaper and more accurate: the address a
 * commuter wants is the one under their finger *at the end*, not the forty
 * coordinates they passed through on the way.
 *
 * 450 ms is long enough to cover a deliberate drag and short enough that the
 * text appears to follow the pin rather than to arrive after it.
 */
export const REVERSE_GEOCODE_DEBOUNCE_MS = 450;

/**
 * How far the pin must move before it is worth looking up again.
 *
 * The companion to the debounce, and the cheaper of the two: two geocodes for
 * the same doorstep — one from a jittery final frame, one from the release —
 * cost twice and differ in nothing a person would read. Twelve metres is under
 * one street segment, so dropping this would only ever suppress noise.
 */
export const REVERSE_GEOCODE_MIN_MOVE_M = 12;

/**
 * Whether a moved pin warrants another reverse-geocode request.
 *
 * Pure, so the rule can be asserted directly rather than inferred from network
 * traffic. `previous` is the coordinate the last answer was for; null means
 * nothing has been looked up yet, which always warrants a lookup.
 */
export function shouldReverseGeocode(
  previous: LatLng | null | undefined,
  next: LatLng | null | undefined,
  minMoveM: number = REVERSE_GEOCODE_MIN_MOVE_M,
): boolean {
  if (!next) return false;
  if (!previous) return true;
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  return haversineKm(previous, next) * 1000 >= minMoveM;
}

/**
 * How long both ends must hold still before the route is re-requested.
 *
 * Same reason as the geocode debounce above, one step more expensive: routing is
 * a metered call too, and a drag re-keys the endpoint on nearly every frame. A
 * route that updates the instant the finger stops — rather than continuously
 * while it moves — is both cheaper and more legible, because the line stops
 * jittering under the pin it is supposed to be attached to.
 */
export const ROUTE_SETTLE_MS = 400;

/**
 * A label for a pin whose lookup found nothing.
 *
 * Coordinates rather than a dash: a pin in the middle of a field is a perfectly
 * good pin, and "8.5417, 123.8853" is enough for a rider to find it again — and
 * for the commuter to tell it apart from a pin that simply failed to load.
 */
export function fallbackCoordinateLabel(coord: LatLng): string {
  return `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
}