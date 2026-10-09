/**
 * The map service layer's switch: which provider is active, and what the map
 * draws.
 *
 * Both are decided at module load from environment variables, so only one
 * branch is reachable in a given process — the tests assert the contract that
 * holds whichever branch is live, plus the parts that are pure functions of
 * their arguments. The failure this stands in front of is the switch itself: a
 * MapTiler key present while the map still asks OpenStreetMap (or the reverse),
 * which looks like a styling bug rather than the one-line regression it is.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  MAPTILER_KEY,
  ORS_KEY,
  getBasemap,
  getBasemapId,
  OSM_TILES,
  hasMapTiler,
  hasOrs,
  searchPlaces,
  MAP_ATTRIBUTION,
} from "../src/lib/map-service.ts";
import { fetchRoute, straightGeometry, toLatLngs } from "../src/lib/routing-service.ts";

const mapSource = readFileSync("src/lib/map-service.ts", "utf8");
const routingSource = readFileSync("src/lib/routing-service.ts", "utf8");

test("the basemap matches whether a MapTiler key is configured", () => {
  // Key present means MapTiler tiles, key absent means the keyless OSM ones. A
  // mismatch here is the bug this whole file exists for.
  expect(getBasemapId()).toBe(hasMapTiler ? "maptiler" : "osm");
  expect(getBasemap().id).toBe(hasMapTiler ? "maptiler" : "osm");
});;

test("each credential is either a trimmed key or absent", () => {
  for (const key of [MAPTILER_KEY, ORS_KEY]) {
    expect(typeof key).toBe("string");
    // The `hasX` flags are derived from the keys, so the two cannot disagree.
    expect(key).toBe(key.trim());
  }
  expect(hasMapTiler).toBe(MAPTILER_KEY.length > 0);
  expect(hasOrs).toBe(ORS_KEY.length > 0);
});

test("the active basemap declares somewhere to send attribution", () => {
  // Renderers have to credit the tile source; an empty string silently drops
  // the credit, and the map stops complying with the tile terms.
  const basemap = getBasemap();
  expect(basemap.attribution.trim().length).toBeGreaterThan(0);
  expect(basemap.maxZoom).toBeGreaterThan(0);
  // The attribution under the map must match the tiles actually served.
  expect(MAP_ATTRIBUTION).toBe(basemap.attribution);
});

test("the Leaflet maps load raster tiles from a URL template", () => {
  // Leaflet reads `urlSrc` templates; no more style documents to validate.
  const basemap = getBasemap();
  expect(basemap.url).toContain("{z}/{x}/{y}");
  expect(basemap.minZoom).toBeGreaterThan(0);
  expect(basemap.maxZoom).toBeGreaterThanOrEqual(14);
  // The keyless default is OSM, not null — a checkout with no key still gets
  // a working map.
  const osm = OSM_TILES;
  expect(osm.id).toBe("osm");
  expect(osm.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
});

test("the map component points Leaflet at the decided basemap", () => {
  // MapView must ask map-service which tiles to load, or a config change
  // would silently leave the map on whatever it was built against.
  const view = readFileSync("src/components/map/MapView.tsx", "utf8");
  expect(view).toContain("getBasemap()");
  // Checked as an import rather than as prose: a historical note about the
  // renderer this replaced is free to mention it, a dependency is not.
  expect(view).not.toMatch(/from ["']maplibre-gl/);
});

test("a query below the minimum length never reaches the network", async () => {
  // Two characters is under the three-character floor, so this returns without
  // dispatching — and therefore works with no connectivity.
  expect(await searchPlaces("ab")).toEqual([]);
});

test("no route yields no geometry rather than a stray point", () => {
  expect(straightGeometry(null)).toEqual([]);
  expect(straightGeometry([])).toEqual([]);
});

test("one segment is just its two ends", () => {
  const from = { lat: 8.1550421, lng: 125.1305726 };
  const to = { lat: 7.9111239, lng: 125.0933669 };
  expect(straightGeometry([[from, to]])).toEqual([from, to]);
});

test("a straight line runs through every segment once", () => {
  // Two segments sharing a middle point: the shared vertex must appear once, or
  // the drawn line doubles back on itself at the join.
  const geometry = straightGeometry([
    [
      { lat: 8.15, lng: 125.13 },
      { lat: 8.16, lng: 125.14 },
    ],
    [
      { lat: 8.16, lng: 125.14 },
      { lat: 8.17, lng: 125.15 },
    ],
  ]);
  expect(geometry).toEqual([
    { lat: 8.15, lng: 125.13 },
    { lat: 8.16, lng: 125.14 },
    { lat: 8.17, lng: 125.15 },
  ]);
});

test("routing resolves to a geometry or null, and never rejects", async () => {
  // With no ORS key the fallback is chosen without a request, so this is a pure
  // assertion. With a key the request is made and still resolves to a geometry
  // or null — never a rejection, which is the contract the map relies on to
  // keep drawing a line. The race keeps a sandbox with no connectivity from
  // hanging the suite.
  const answer = await Promise.race([
    fetchRoute({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.001 }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  expect(answer === null || Array.isArray(answer)).toBe(true);
  for (const point of answer ?? []) {
    expect(Number.isFinite(point.lat)).toBe(true);
    expect(Number.isFinite(point.lng)).toBe(true);
  }
});

test("routing goes to the host that issued the key", () => {
  // `VITE_ORS_KEY` is a HeiGIT token, not an OpenRouteService API key. Both
  // hosts answer today, but calling a HeiGIT token against the official ORS
  // service relies on it being tolerated rather than honoured — so the host is
  // pinned here, because `fetchRoute` is otherwise only ever exercised with no
  // key configured and would happily repoint itself at the wrong one.
  expect(routingSource).toContain(
    "https://api.heigit.org/openrouteservice/v2/directions/driving-car",
  );
  expect(routingSource).not.toContain("api.openrouteservice.org");
  expect(routingSource).toContain("api_key: ORS_KEY");
});

test("route coordinates keep their axis order", () => {
  // ORS answers in GeoJSON order, [lng, lat]. This is the one line in the
  // routing path where a mistake is invisible: every other failure returns
  // null and gets drawn as a straight line, so swapped axes produce a map that
  // looks fine and a route drawn between mirrored points half a world away.
  // The sample is the first vertex of a real response from the HeiGIT
  // endpoint for Malaybalay -> Valencia: [125.066884, 8.033835].
  expect(toLatLngs([[125.066884, 8.033835]])).toEqual([
    { lat: 8.033835, lng: 125.066884 },
  ]);
  // Not the other way round, stated explicitly so the swap cannot pass.
  expect(toLatLngs([[125.066884, 8.033835]])[0].lat).toBe(8.033835);
  expect(toLatLngs([[125.066884, 8.033835]])[0].lng).toBe(125.066884);
  // Bukidnon latitudes are around 8 and longitudes around 125, so a swap is
  // unmistakable rather than a small numeric drift.
  const [point] = toLatLngs([[125.066884, 8.033835]]);
  expect(point.lat).toBeLessThan(point.lng);
  // Order and length are preserved, not collapsed.
  expect(
    toLatLngs([
      [125.1, 8.1],
      [125.2, 8.2],
      [125.3, 8.3],
    ]),
  ).toEqual([
    { lat: 8.1, lng: 125.1 },
    { lat: 8.2, lng: 125.2 },
    { lat: 8.3, lng: 125.3 },
  ]);
  expect(toLatLngs([])).toEqual([]);
});

test("neither service is handed the other's credential", () => {
  // The two keys are different products from different vendors. A map request
  // signed with the routing key (or the reverse) fails as a 403 that reads like
  // a broken map rather than a mixed-up key.
  const mapKeyParams = [
    ...(mapSource.match(/key=\$\{(\w+)\}/g) ?? []),
    ...(mapSource.match(/key: (\w+)/g) ?? []),
  ];
  // Tiles, the style document, forward geocoding and reverse geocoding.
  expect(mapKeyParams.length).toBeGreaterThan(0);
  for (const param of mapKeyParams) expect(param).toContain("MAPTILER_KEY");

  expect(routingSource).not.toContain("MAPTILER_KEY");
});
