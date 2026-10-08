import type { ComponentType } from "react";

/**
 * The map abstraction.
 *
 * Screens never import a map library. They render `<MapView />` from
 * `src/components`, which asks this module which implementation is active.
 * That is the whole point of the seam: MapLibre today, something else later,
 * and a working placeholder whenever the native SDK is not installed (Expo
 * Go, a web preview, a CI bundle).
 */

/** `[longitude, latitude]` — the GeoJSON order every map wants. */
export type MapCoordinate = [number, number];

export type MapMarkerKind = "pickup" | "destination" | "rider";

export interface MapMarker {
  id: string;
  label: string;
  coordinate: MapCoordinate;
  kind: MapMarkerKind;
}

export interface MapSurfaceProps {
  markers?: MapMarker[];
  /** The driving line between pickup and destination, in GeoJSON order. */
  route?: MapCoordinate[];
  center?: MapCoordinate;
  zoomLevel?: number;
  className?: string;
}

export type MapProviderId = "maplibre" | "fallback";

export interface MapProvider {
  id: MapProviderId;
  label: string;
  /** False when the native SDK is missing from this build. */
  available: boolean;
  MapSurface: ComponentType<MapSurfaceProps>;
}

/**
 * OpenStreetMap raster tiles — the data source is a plain, unauthenticated
 * tile URL, so the map needs no key and no external API to render.
 *
 * OpenStreetMap's tile usage policy requires visible attribution; every
 * implementation renders `OSM_ATTRIBUTION` alongside the map.
 */
export const OSM_TILE_URL_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const DEFAULT_CENTER: MapCoordinate = [120.9842, 14.5995];
export const DEFAULT_ZOOM = 14;

/**
 * The active provider. The MapLibre implementation registers itself with
 * `available: false` when its native module is missing, and the fallback is
 * used instead — replacing the map means changing this function alone.
 */
export function getMapProvider(): MapProvider {
  const { mapLibreProvider, fallbackProvider } = providers();
  return mapLibreProvider.available ? mapLibreProvider : fallbackProvider;
}

let registered: {
  mapLibreProvider: MapProvider;
  fallbackProvider: MapProvider;
} | null = null;

/**
 * Providers are resolved lazily so that importing this module never pulls the
 * native SDK into a bundle that cannot use it.
 */
function providers(): {
  mapLibreProvider: MapProvider;
  fallbackProvider: MapProvider;
} {
  if (!registered) {
    // Required lazily, not imported at the top: an eager import of a missing
    // native module would crash the app, not just the map.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const maplibre = require("./MapLibreMap") as {
      MapLibreSurface: ComponentType<MapSurfaceProps>;
      isMapLibreAvailable: boolean;
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fallback = require("./FallbackMap") as {
      FallbackMap: ComponentType<MapSurfaceProps>;
    };
    registered = {
      mapLibreProvider: {
        id: "maplibre",
        label: "MapLibre (OpenStreetMap tiles)",
        available: maplibre.isMapLibreAvailable,
        MapSurface: maplibre.MapLibreSurface,
      },
      fallbackProvider: {
        id: "fallback",
        label: "Preview placeholder",
        available: true,
        MapSurface: fallback.FallbackMap,
      },
    };
  }
  return registered;
}
