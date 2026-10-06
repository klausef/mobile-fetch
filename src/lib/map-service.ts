/**
 * Map service layer.
 *
 * Everything the app needs from a map provider lives behind this interface, so
 * swapping raster tiles or geocoders for another vendor is a one-file change.
 *
 * ── Which provider runs ──────────────────────────────────────────────────────
 * Two are wired up:
 *
 *   • MapTiler — vector tiles plus forward and reverse geocoding. This is the
 *     provider FETCH is built for, and it is used whenever a MapTiler key is
 *     present.
 *   • OpenStreetMap (Nominatim) — keyless. This is the fallback, and it is not
 *     a stub: a checkout with no map key still gets a working map and a working
 *     address search, so the app never opens on a blank rectangle just because
 *     somebody forgot to paste a token.
 *
 * The switch is made by `getMapProvider()` from the presence of
 * `VITE_MAPTILER_KEY`, not by a build flag, so the same bundle works both ways.
 *
 * ── Why the VITE_ prefix ─────────────────────────────────────────────────────
 * Vite only inlines environment variables whose names start with `VITE_` into
 * the browser bundle. A key named `MAPTILER_TOKEN` would be invisible here, so
 * the documented names are `VITE_MAPTILER_KEY` and `VITE_ORS_KEY` (see the
 * README). Both are public by construction — they travel to the client — which
 * is why MapTiler's key is meant to be a public, origin-restricted key rather
 * than a secret.
 *
 * Search is scoped to the operating region (see `@/lib/region`) so FETCH
 * returns Bukidnon results first instead of places in Manila or abroad.
 */

import type { MapOptions, StyleSpecification } from "maplibre-gl";
import { isInRegion, REGION } from "@/lib/region";

export type LatLng = { lat: number; lng: number };

export type Place = {
  label: string;
  lat: number;
  lng: number;
};

export interface MapProvider {
  id: string;
  label: string;
  attribution: string;
  maxZoom: number;
  tileUrl(x: number, y: number, zoom: number): string;
  search(query: string, near?: LatLng): Promise<Place[]>;
  reverse(coord: LatLng): Promise<string | null>;
}

/* ── Credentials ──────────────────────────────────────────────────────────── */

/** Trimmed env value, or "" when unset — an empty string means "not provided". */
function readEnv(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Public MapTiler key, e.g. `VITE_MAPTILER_KEY=abc123`.
 *
 * Public on purpose: it is compiled into the client bundle. Create it in the
 * MapTiler dashboard with an origin/domain restriction so it cannot be reused
 * from another site.
 */
export const MAPTILER_KEY = readEnv(import.meta.env.VITE_MAPTILER_KEY);

/**
 * Which MapTiler map style to draw. Defaults to the general-purpose streets
 * style; override with `VITE_MAPTILER_STYLE` (for example `streets-v2-dark`,
 * `basic-v2`, or `dataviz`) without touching code.
 */
export const MAPTILER_STYLE =
  readEnv(import.meta.env.VITE_MAPTILER_STYLE) || "streets-v2";

/**
 * Public OpenRouteService key, e.g. `VITE_ORS_KEY=xyz`.
 *
 * Also public: routing runs from the browser, so the request is made by the
 * client. Restrict it in the ORS dashboard to the app's origins.
 */
export const ORS_KEY = readEnv(import.meta.env.VITE_ORS_KEY);

/** True when a MapTiler key is configured, so the vector provider is active. */
export const hasMapTiler = MAPTILER_KEY.length > 0;

/** True when road routing is configured; otherwise routes are drawn directly. */
export const hasOrs = ORS_KEY.length > 0;

/** How many suggestions a provider is asked for. */
const SEARCH_LIMIT = 5;

/** Longest a place name is stored/displayed at. */
const MAX_PLACE_LABEL = 140;

const MAPTILER_API = "https://api.maptiler.com";

/* ── OpenStreetMap (keyless fallback) ─────────────────────────────────────── */

const NOMINATIM = "https://nominatim.openstreetmap.org";

function viewbox(box: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  // Nominatim order: left,top,right,bottom
  return `${box.minLng},${box.maxLat},${box.maxLng},${box.minLat}`;
}

function nearBox(near: LatLng, delta = 0.35) {
  return {
    minLat: near.lat - delta,
    maxLat: near.lat + delta,
    minLng: near.lng - delta,
    maxLng: near.lng + delta,
  };
}

async function queryNominatim(params: URLSearchParams): Promise<Place[]> {
  const res = await fetch(`${NOMINATIM}/search?${params.toString()}`);
  if (!res.ok) throw new Error("Address search is temporarily unavailable.");
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return data.map((row) => ({
    label: row.display_name,
    lat: Number(row.lat),
    lng: Number(row.lon),
  }));
}

const OSM_PROVIDER: MapProvider = {
  id: "osm",
  label: "OpenStreetMap",
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
  tileUrl: (x, y, zoom) => `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,

  async search(query, near) {
    // Pass 1: hard-bounded to Bukidnon, so local results always win.
    const local = await queryNominatim(
      new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: String(SEARCH_LIMIT),
        addressdetails: "0",
        countrycodes: REGION.countryCode,
        viewbox: viewbox(REGION.bounds),
        bounded: "1",
      }),
    );
    if (local.length > 0) return local;

    // Pass 2: anywhere in the Philippines, biased toward the current view.
    //
    // This is a *spelling* fallback, not an escape hatch: it exists because a
    // Bukidnon barangay OSM spells differently should still resolve. What it
    // must not do is answer "Manila" — hence the province filter below. The
    // query is still issued, because the hit we want is often filed under a
    // neighbouring town's name.
    const box = near ? nearBox(near) : REGION.bounds;
    const anywhere = await queryNominatim(
      new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: String(SEARCH_LIMIT),
        addressdetails: "0",
        countrycodes: REGION.countryCode,
        viewbox: viewbox(box),
        bounded: "0",
      }),
    );
    return anywhere.filter((place) => isInRegion(place));
  },

  async reverse(coord) {
    try {
      const res = await fetch(
        `${NOMINATIM}/reverse?${new URLSearchParams({
          lat: String(coord.lat),
          lon: String(coord.lng),
          format: "jsonv2",
          zoom: "17",
        }).toString()}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { display_name?: string };
      return data.display_name ?? null;
    } catch {
      return null;
    }
  },
};

/* ── MapTiler (vector tiles + geocoding) ──────────────────────────────────── */

type MapTilerFeature = {
  place_name?: string;
  text?: string;
  /** [lng, lat] — MapTiler follows GeoJSON axis order, not {lat,lng}. */
  center?: [number, number];
};

/** One MapTiler geocoding feature as a `Place`, or null when it has no point. */
function toMapTilerPlace(feature: MapTilerFeature): Place | null {
  const center = feature.center;
  if (!center || center.length < 2) return null;
  const label = feature.place_name ?? feature.text;
  if (!label) return null;
  return { label: label.slice(0, MAX_PLACE_LABEL), lat: center[1], lng: center[0] };
}

/**
 * MapTiler's geocoding endpoint for one query.
 *
 * `proximity` biases nearby results to the front of the list — the same job
 * `near` does for Nominatim — and `country=ph` keeps FETCH answering with
 * Philippine addresses. Both are hints rather than hard filters, which is what
 * we want: a rider pasting a full address should still get a hit even if a
 * village is spelled differently in OSM.
 */
const MAPTILER_PROVIDER: MapProvider = {
  id: "maptiler",
  label: "MapTiler",
  attribution: "© MapTiler © OpenStreetMap contributors",
  maxZoom: 20,
  tileUrl: (x, y, zoom) =>
    `${MAPTILER_API}/maps/${MAPTILER_STYLE}/${zoom}/${x}/${y}.png?key=${MAPTILER_KEY}`,

  async search(query, near) {
    const bias = near ?? REGION.center;
    const params = new URLSearchParams({
      key: MAPTILER_KEY,
      limit: String(SEARCH_LIMIT),
      language: "en",
      country: REGION.countryCode,
      proximity: `${bias.lng},${bias.lat}`,
    });
    const res = await fetch(
      `${MAPTILER_API}/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`,
    );
    if (!res.ok) throw new Error("Address search is temporarily unavailable.");
    const data = (await res.json()) as { features?: MapTilerFeature[] };
    return (data.features ?? [])
      .map(toMapTilerPlace)
      .filter((place): place is Place => place !== null)
      // `proximity` and `country=ph` are hints, so MapTiler will happily answer
      // "Valencia" with a Valencia in Spain or a street of that name in Davao.
      // Both are useless here and both would let the map leave the province, so
      // the province is enforced rather than suggested.
      .filter((place) => isInRegion(place));
  },

  async reverse(coord) {
    try {
      const params = new URLSearchParams({
        key: MAPTILER_KEY,
        limit: "1",
        language: "en",
      });
      const res = await fetch(
        `${MAPTILER_API}/geocoding/${coord.lng},${coord.lat}.json?${params.toString()}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { features?: MapTilerFeature[] };
      return data.features?.[0]?.place_name ?? null;
    } catch {
      return null;
    }
  },
};

/** The provider the app is actually using, given the keys it was built with. */
export function getMapProvider(): MapProvider {
  return hasMapTiler ? MAPTILER_PROVIDER : OSM_PROVIDER;
}

/** Attribution line for the active provider, rendered under the map. */
export const MAP_ATTRIBUTION = getMapProvider().attribution;

/**
 * The style maplibre-gl should load.
 *
 * With a MapTiler key this is the hosted style document, which brings vector
 * tiles, fonts, and sprites, and therefore street labels that raster tiles
 * cannot offer. Without one, it is an inline raster style over OpenStreetMap's
 * public tiles, so the map still draws — coarser, but never blank.
 */
export function mapStyle(): MapOptions["style"] {
  if (hasMapTiler) {
    return `${MAPTILER_API}/maps/${MAPTILER_STYLE}/style.json?key=${MAPTILER_KEY}`;
  }
  return fallbackMapStyle();
}

/**
 * The keyless OpenStreetMap raster style.
 *
 * Exported because it is also the *recovery* style, not just the style for a
 * checkout with no key at all. Those are different failures: a missing key is
 * known before the map is built, whereas a key that is present but wrong —
 * mistyped, expired, over quota, or blocked by an origin restriction the app
 * never anticipated — is only discovered when MapLibre fails to load the
 * style. Without this the rider gets a blank rectangle and no way to tell
 * whether the app is broken or the map key is, which is the worst of both.
 */
export function fallbackMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: OSM_PROVIDER.attribution,
        maxzoom: OSM_PROVIDER.maxZoom,
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

/* ── Public helpers ───────────────────────────────────────────────────────── */

export async function searchPlaces(
  query: string,
  near?: LatLng,
): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  return await getMapProvider().search(trimmed, near);
}

export async function describePoint(coord: LatLng): Promise<string | null> {
  return await getMapProvider().reverse(coord);
}
