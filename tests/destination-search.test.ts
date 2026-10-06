/**
 * Destination search: highlighting, result shaping, recents, and framing.
 *
 * These are the four parts of search that look right in a screenshot and are
 * quietly wrong: a highlight in the wrong place, a dropdown that fills with one
 * building six times, a history that loses its oldest entry to a duplicate, and
 * a "both ends visible" zoom that hides one of them.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  destinationKey,
  fallbackCoordinateLabel,
  fitPoints,
  highlightMatches,
  LONG_PRESS_MS,
  LONG_PRESS_TOLERANCE_PX,
  MAX_LOCAL_RECENTS,
  MAX_SEARCH_RESULTS,
  midpoint,
  parseRecentDestinations,
  rankDestinations,
  REVERSE_GEOCODE_DEBOUNCE_MS,
  REVERSE_GEOCODE_MIN_MOVE_M,
  rememberDestination,
  ROUTE_SETTLE_MS,
  shouldReverseGeocode,
  splitPlaceLabel,
  formatAddressLines,
  formatAddressSubtitle,
  toSearchResults,
  zoomToFit,
  type RecentDestination,
} from "../src/lib/search.ts";

/* ── Highlighting ─────────────────────────────────────────────────────────── */

test("every occurrence of the query is highlighted, not just the first", () => {
  const parts = highlightMatches("Malaybalay City, Malaybalay", "malaybalay");
  expect(parts.filter((p) => p.match).length).toBe(2);
  // Concatenating the parts must reproduce the original exactly — the renderer
  // draws these spans in sequence, so losing a character loses a letter of the
  // street name.
  expect(parts.map((p) => p.text).join("")).toBe(
    "Malaybalay City, Malaybalay",
  );
});

test("a match in the middle keeps the surrounding text intact", () => {
  const parts = highlightMatches("Poblacion Road", "road");
  expect(parts).toEqual([
    { text: "Poblacion ", match: false },
    { text: "Road", match: true },
  ]);
});

test("highlighting does not match a substring of an unrelated word", () => {
  // "san" appears inside "Poblacion" but is not part of the query "san juan".
  // Matching it anyway reads as a bug and destroys trust in every highlight.
  const parts = highlightMatches("Poblacion", "san");
  expect(parts.every((p) => !p.match)).toBe(true);
});

test("highlighting is case-insensitive but preserves the original casing", () => {
  const parts = highlightMatches("MALAYBALAY", "malaybalay");
  expect(parts).toEqual([{ text: "MALAYBALAY", match: true }]);
});

test("an empty or whitespace query highlights nothing rather than everything", () => {
  for (const query of ["", "   "]) {
    expect(highlightMatches("Poblacion Road", query)).toEqual([
      { text: "Poblacion Road", match: false },
    ]);
  }
});

/* ── Result shaping ───────────────────────────────────────────────────────── */

test("a Philippine address splits into street, town and province", () => {
  const { primary, area, region } = splitPlaceLabel(
    "24 Poblacion Road, Malaybalay City, Bukidnon",
  );
  expect(primary).toBe("24 Poblacion Road");
  expect(area).toBe("Malaybalay City");
  expect(region).toBe("Bukidnon");
});

test("a longer address keeps all of its street parts together", () => {
  // The house number and the road are one thing to a rider; splitting them
  // across two lines makes the row read as two facts about two places.
  const { primary, area, region } = splitPlaceLabel(
    "24 Poblacion Road, Poblacion, Malaybalay City, Bukidnon",
  );
  expect(primary).toBe("24 Poblacion Road, Poblacion");
  expect(area).toBe("Malaybalay City");
  expect(region).toBe("Bukidnon");
});

test("an address with no commas is one line and no empty second line", () => {
  const { primary, area, region } = splitPlaceLabel("Bagong Lupa");
  expect(primary).toBe("Bagong Lupa");
  expect(area).toBe("");
  expect(region).toBe("");
});

test("a result with trailing commas still yields a usable primary line", () => {
  const { primary } = splitPlaceLabel("Poblacion Road, , ");
  expect(primary).toBe("Poblacion Road");
});

test("a two-part label is not read as the same place twice", () => {
  // "the second-to-last part is the area" applied to a two-part label hands
  // back "Malaybalay City" as both the primary line and the area, so the row
  // says the same thing twice. An area that is also the street is no area.
  const { primary, area, region } = splitPlaceLabel(
    "Malaybalay City, Bukidnon",
  );
  expect(primary).toBe("Malaybalay City");
  expect(area).toBe("");
  expect(region).toBe("Bukidnon");
});

/* ── Readable addresses ────────────────────────────────────────────────────*/

test("an address reads as street, then city and area", () => {
  const { street, city, area } = formatAddressLines(
    "24 Poblacion Road, Malaybalay City, Bukidnon",
  );
  expect(street).toBe("24 Poblacion Road");
  expect(city).toBe("Malaybalay City");
  expect(area).toBe("Bukidnon");
  expect(formatAddressSubtitle("24 Poblacion Road, Malaybalay City, Bukidnon")).toBe(
    "Malaybalay City, Bukidnon",
  );
});

test("the country is not repeated, and changes nothing about the rest", () => {
  // Both geocoders end Philippine addresses with the country, and the providers
  // disagree about whether they include it. So the same place has to read
  // identically either way — otherwise the line a commuter reads back to the
  // rider depends on which provider answered.
  const withCountry = formatAddressLines(
    "24 Poblacion Road, Malaybalay City, Bukidnon, Philippines",
  );
  const without = formatAddressLines(
    "24 Poblacion Road, Malaybalay City, Bukidnon",
  );
  expect(withCountry).toEqual(without);
  expect(withCountry.street).toBe("24 Poblacion Road");
  expect(withCountry.city).toBe("Malaybalay City");
  expect(withCountry.area).toBe("Bukidnon");
  expect(
    formatAddressSubtitle("24 Poblacion Road, Malaybalay City, Bukidnon, Philippines"),
  ).toBe(formatAddressSubtitle("24 Poblacion Road, Malaybalay City, Bukidnon"));
  expect(formatAddressSubtitle("Poblacion Road, Philippines")).toBe("");
});

test("a place with no town still gives something readable", () => {
  // A village the geocoder could only resolve to itself: one line, no blank
  // second line, and the subtitle says nothing rather than a dangling comma.
  const { street, city, area } = formatAddressLines("Bagong Lupa");
  expect(street).toBe("Bagong Lupa");
  expect(city).toBe("");
  expect(area).toBe("");
  expect(formatAddressSubtitle("Bagong Lupa")).toBe("");
});

test("an empty address is empty, not a string of commas", () => {
  for (const empty of [null, undefined, "", "   "]) {
    expect(formatAddressLines(empty)).toEqual({ street: "", city: "", area: "" });
    expect(formatAddressSubtitle(empty)).toBe("");
  }
});

test("the dropdown is capped at five results", () => {
  const places = Array.from({ length: 9 }, (_, index) => ({
    label: `Street ${index}, Malaybalay City, Bukidnon`,
    lat: 8 + index / 100,
    lng: 125,
  }));
  const results = toSearchResults(places);
  expect(results).toHaveLength(MAX_SEARCH_RESULTS);
  // The cap must keep the *best* results, not an arbitrary slice: the provider
  // ranks them, so the first five are the five worth showing.
  expect(results[0].label).toBe(places[0].label);
  expect(results[4].label).toBe(places[4].label);
});

test("a result carries coordinates and its split parts together", () => {
  const [result] = toSearchResults([
    { label: "24 Poblacion Road, Malaybalay City, Bukidnon", lat: 8.155, lng: 125.13 },
  ]);
  expect(result.lat).toBe(8.155);
  expect(result.lng).toBe(125.13);
  expect(result.area).toBe("Malaybalay City");
});

/* ── Recents ──────────────────────────────────────────────────────────────── */

const market: RecentDestination = {
  label: "Poblacion Public Market",
  lat: 8.155,
  lng: 125.13,
  usedAt: 1000,
};
const church: RecentDestination = {
  label: "San Agustin Church",
  lat: 8.16,
  lng: 125.12,
  usedAt: 2000,
};

test("re-picking a destination moves it up instead of duplicating it", () => {
  // The failure this prevents: a five-item history that is really three places
  // and two copies of the market, because picking the same place twice pushed it
  // twice.
  let history = rememberDestination([], market);
  history = rememberDestination(history, church);
  history = rememberDestination(history, { ...market, usedAt: 3000 });
  expect(history).toHaveLength(2);
  expect(history[0].label).toBe(market.label);
  expect(history[1].label).toBe(church.label);
});

test("identity ignores case and repeated spaces, because a person types loosely", () => {
  expect(destinationKey({ label: "Poblacion  Market" })).toBe(
    destinationKey({ label: "  poblacion market " }),
  );
});

test("the history keeps five and sheds the oldest", () => {
  let history: RecentDestination[] = [];
  for (let index = 0; index < 8; index += 1) {
    history = rememberDestination(
      history,
      { label: `Place ${index}`, lat: 8 + index / 100, lng: 125, usedAt: index },
    );
  }
  expect(history).toHaveLength(MAX_LOCAL_RECENTS);
  // Newest first: the last one picked is still at the top.
  expect(history[0].label).toBe("Place 7");
  expect(history.some((row) => row.label === "Place 0")).toBe(false);
});

test("remembering never mutates the list it was given", () => {
  const before = [market];
  rememberDestination(before, church);
  expect(before).toEqual([market]);
});

test("stored history that is not JSON reads as empty, not as a crash", () => {
  expect(parseRecentDestinations(null)).toEqual([]);
  expect(parseRecentDestinations("")).toEqual([]);
  expect(parseRecentDestinations("{not json")).toEqual([]);
  expect(parseRecentDestinations('{"a":1}')).toEqual([]);
});

test("one corrupt row does not cost the commuter the whole history", () => {
  const raw = JSON.stringify([
    { label: "Good Place", lat: 8.1, lng: 125.1, usedAt: 2 },
    { label: "", lat: 8.1, lng: 125.1, usedAt: 3 },
    { label: "No Coords", usedAt: 4 },
    { label: "Bad Coords", lat: "eight", lng: 125.1, usedAt: 5 },
    { label: "Off Planet", lat: 999, lng: 125.1, usedAt: 6 },
    "not an object",
  ]);
  const rows = parseRecentDestinations(raw);
  expect(rows).toHaveLength(1);
  expect(rows[0].label).toBe("Good Place");
});

test("a history written by an older build without a timestamp still shows", () => {
  const raw = JSON.stringify([
    { label: "Bagong Lupa", lat: 8.1, lng: 125.1 },
  ]);
  const rows = parseRecentDestinations(raw);
  expect(rows).toHaveLength(1);
  expect(rows[0].usedAt).toBe(0);
});

test("history read back is capped and newest first", () => {
  const raw = JSON.stringify(
    Array.from({ length: 7 }, (_, index) => ({
      label: `Place ${index}`,
      lat: 8 + index / 100,
      lng: 125,
      usedAt: index,
    })),
  );
  const rows = parseRecentDestinations(raw);
  expect(rows).toHaveLength(MAX_LOCAL_RECENTS);
  expect(rows[0].usedAt).toBe(6);
});

test("an absurdly long address is truncated before it reaches the dropdown", () => {
  const rows = parseRecentDestinations(
    JSON.stringify([
      { label: "x".repeat(400), lat: 8.1, lng: 125.1, usedAt: 1 },
    ]),
  );
  expect(rows[0].label.length).toBeLessThanOrEqual(120);
});

test("ranking does not reorder the caller's array", () => {
  const rows = [market, church];
  rankDestinations(rows);
  expect(rows[0]).toBe(market);
});

/* ── Framing two points ───────────────────────────────────────────────────── */

/** Malaybalay to Valencia, roughly. */
const near = { lat: 8.155, lng: 125.13 };
const far = { lat: 8.47, lng: 125.112 };

test("the camera goes to the midpoint so both ends can be on screen", () => {
  const centre = midpoint(near, far);
  expect(centre.lat).toBeCloseTo((near.lat + far.lat) / 2, 6);
  expect(centre.lng).toBeCloseTo((near.lng + far.lng) / 2, 6);
});

test("a long trip zooms out further than a short one", () => {
  expect(zoomToFit(near, far)).toBeLessThan(zoomToFit(near, { lat: 8.16, lng: 125.128 }));
});

test("framing stays inside the zoom range the map can actually reach", () => {
  // Two ends a few metres apart must not ask for a zoom no tile service has,
  // and two ends on opposite sides of the island must not zoom out to the whole
  // country.
  expect(zoomToFit(near, { lat: 8.1551, lng: 125.1301 })).toBeLessThanOrEqual(16);
  expect(zoomToFit({ lat: 8, lng: 120 }, { lat: 9, lng: 126 })).toBeGreaterThanOrEqual(2);
  expect(zoomToFit(near, near)).toBeLessThanOrEqual(16);
});

test("a trip across the province still frames both ends", () => {
  // Malaybalay to Valencia is ~35 km. An earlier floor of zoom 5 could not hold
  // that on a phone, so the map was centred correctly with one pin off-screen —
  // which is the very thing framing exists to prevent.
  const zoom = zoomToFit(near, far);
  const span = Math.max(
    Math.abs(near.lng - far.lng) * Math.cos((near.lat * Math.PI) / 180),
    Math.abs(near.lat - far.lat),
  );
  expect(span * 256 * Math.pow(2, zoom)).toBeLessThanOrEqual(360 * 1.06);
});

test("the chosen zoom actually fits both ends on screen", () => {
  // The real invariant, checked directly rather than through the returned
  // number: at that zoom, does the span between the two points fit inside the
  // viewport with its margin?
  //
  // One display degree of longitude is 256·2^z pixels wide, so this is the same
  // arithmetic `zoomToFit` performs — asserting it catches a sign error or a
  // missing cos(lat), which a test comparing two returned numbers would not,
  // since the latitude correction is only ~1.5% at 8°N and is coarser than the
  // rounding of the result.
  const cases: [typeof near, typeof near][] = [
    [near, far],
    [near, { lat: 8.16, lng: 125.128 }],
    [near, { lat: 8.1551, lng: 125.1301 }],
    [{ lat: 0, lng: 120 }, { lat: 0, lng: 120.2 }],
  ];
  for (const [a, b] of cases) {
    const zoom = zoomToFit(a, b);
    const span = Math.max(
      Math.abs(a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180),
      Math.abs(a.lat - b.lat),
    );
    const onScreenPx = span * 256 * Math.pow(2, zoom);
    // 6% of slack absorbs the result being rounded to a tenth.
    expect(onScreenPx).toBeLessThanOrEqual(360 * 1.06);
  }
});

test("two ends at the same point do not produce an infinite zoom", () => {
  // The degenerate case is where a naive log2 of zero goes to Infinity, which
  // a map treats as "nowhere".
  const zoom = zoomToFit(near, near);
  expect(Number.isFinite(zoom)).toBe(true);
  expect(zoom).toBeGreaterThan(0);
});

/* ── Long press ───────────────────────────────────────────────────────────── */

test("a press is long enough to be deliberate and short enough to feel quick", () => {
  expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(400);
  expect(LONG_PRESS_MS).toBeLessThanOrEqual(800);
});

test("a pan cancels the press before it can drop a pin", () => {
  // Without this, every attempt to scroll the map drops a pin wherever the
  // finger happened to be.
  expect(LONG_PRESS_TOLERANCE_PX).toBeGreaterThan(4);
  expect(LONG_PRESS_TOLERANCE_PX).toBeLessThanOrEqual(16);
});

/* ── Reverse geocoding while a pin is dragged ─────────────────────────────── */

const HERE = { lat: 8.5417, lng: 123.8853 };

test("a pin is only looked up again once it has moved somewhere new", () => {
  // Nothing looked up yet: always worth a request.
  expect(shouldReverseGeocode(null, HERE)).toBe(true);

  // The final frame of a drag often differs from the release point by a few
  // centimetres. Geocoding that costs a second metered call and returns the
  // same street.
  const jitter = { lat: HERE.lat + 0.00005, lng: HERE.lng };
  expect(shouldReverseGeocode(HERE, jitter)).toBe(false);

  // A real move: about 110 m north.
  const moved = { lat: HERE.lat + 0.001, lng: HERE.lng };
  expect(shouldReverseGeocode(HERE, moved)).toBe(true);

  // Just past the gate. The comparison is "at least the gate", so a pin that
  // has genuinely moved is looked up rather than silently keeping the label of
  // the place it left — asserted a hair above the threshold, because a
  // conversion through degrees is not exact and this test is about the rule,
  // not about the last centimetre of floating point.
  const edge = {
    lat: HERE.lat + (REVERSE_GEOCODE_MIN_MOVE_M * 1.05) / 111_320,
    lng: HERE.lng,
  };
  expect(shouldReverseGeocode(HERE, edge)).toBe(true);

  // A custom gate is honoured, so a caller can ask for a finer sweep.
  expect(shouldReverseGeocode(HERE, jitter, 1)).toBe(true);
});

test("a pin with no position to look up is never looked up", () => {
  expect(shouldReverseGeocode(HERE, null)).toBe(false);
  expect(shouldReverseGeocode(HERE, { lat: NaN, lng: NaN })).toBe(false);
});

test("a pin the lookup cannot name still identifies itself", () => {
  // A dash reads as a failure; coordinates identify the pin and are true even
  // when the geocoder has never heard of the barangay.
  expect(fallbackCoordinateLabel(HERE)).toBe("8.54170, 123.88530");
  expect(fallbackCoordinateLabel(HERE)).not.toBe("");
});

test("the lookup settles before it fires, and the route settles before it re-requests", () => {
  // Both are metered calls and both are re-keyed by every pointer frame of a
  // drag. The windows have to be long enough to swallow a gesture and short
  // enough that the address and the route still feel like they follow the pin.
  for (const ms of [REVERSE_GEOCODE_DEBOUNCE_MS, ROUTE_SETTLE_MS]) {
    expect(ms).toBeGreaterThanOrEqual(250);
    expect(ms).toBeLessThanOrEqual(800);
  }
});

/* ── Framing a ride ───────────────────────────────────────────────────────── */

test("the camera frames every point it is given, not just the first two", () => {
  // Tracking needs the rider, the pickup and the drop-off on screen at once.
  // Fitting any two of them crops the third out of frame, which reads as a
  // broken map rather than as a framing choice.
  const commuter = { lat: 8.5417, lng: 123.8853 };
  const rider = { lat: 8.6417, lng: 123.9853 };
  const drop = { lat: 8.4417, lng: 123.7853 };

  const frame = fitPoints([rider, commuter, drop]);
  expect(frame).not.toBeNull();
  expect(Number.isFinite(frame!.center.lat)).toBe(true);
  expect(Number.isFinite(frame!.center.lng)).toBe(true);
  expect(frame!.zoom).toBeGreaterThan(0);

  // The centre must lie inside the bounding box of all three, which is the only
  // definition of "all three are on screen".
  expect(frame!.center.lat).toBeGreaterThanOrEqual(
    Math.min(rider.lat, commuter.lat, drop.lat) - 1e-9,
  );
  expect(frame!.center.lat).toBeLessThanOrEqual(
    Math.max(rider.lat, commuter.lat, drop.lat) + 1e-9,
  );
  expect(frame!.center.lng).toBeGreaterThanOrEqual(
    Math.min(rider.lng, commuter.lng, drop.lng) - 1e-9,
  );
  expect(frame!.center.lng).toBeLessThanOrEqual(
    Math.max(rider.lng, commuter.lng, drop.lng) + 1e-9,
  );

  // And it must be the *middle* of them, not merely inside them: a centre hard
  // against one edge frames the other two out of shot.
  expect(frame!.center.lat).toBeCloseTo(
    (rider.lat + commuter.lat + drop.lat) / 3,
    6,
  );
  expect(frame!.center.lng).toBeCloseTo(
    (rider.lng + commuter.lng + drop.lng) / 3,
    6,
  );
});

test("a wider spread of points frames wider than a tight cluster", () => {
  const rider = { lat: 8.54, lng: 123.88 };
  const near = { lat: 8.545, lng: 123.885 };
  const far = { lat: 8.9, lng: 124.4 };
  expect(fitPoints([rider, near])!.zoom).toBeGreaterThan(
    fitPoints([rider, far])!.zoom,
  );
});

test("one point is not a frame, and neither is a broken one", () => {
  // Nothing to fit means the caller keeps the camera it had, rather than being
  // handed NaN and having the map fly somewhere impossible.
  expect(fitPoints([])).toBeNull();
  expect(fitPoints([{ lat: 8.5, lng: 123.8 }])).toBeNull();
  expect(fitPoints([{ lat: 8.5, lng: 123.8 }, null])).toBeNull();
  expect(
    fitPoints([{ lat: NaN, lng: 123.8 }, { lat: 8.5, lng: 123.8 }]),
  ).toBeNull();
});