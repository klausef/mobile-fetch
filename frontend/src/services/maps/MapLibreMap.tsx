import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL_TEMPLATE,
  type MapSurfaceProps,
} from "./mapProvider";

/**
 * The MapLibre implementation of the map surface.
 *
 * The module is loaded with a guarded `require` rather than an import: in
 * Expo Go the native SDK is not linked, and an eager import would crash the
 * app instead of degrading to the placeholder.
 */

type MapLibreModule = typeof import("@maplibre/maplibre-react-native");

let maplibre: MapLibreModule | null = null;
try {
  maplibre = require("@maplibre/maplibre-react-native") as MapLibreModule;
} catch {
  maplibre = null;
}

/** True when this build has the native MapLibre SDK linked. */
export const isMapLibreAvailable = maplibre !== null;

const MARKER_COLORS: Record<string, string> = {
  pickup: colors.success,
  destination: colors.brand.DEFAULT,
  rider: colors.info,
};

export function MapLibreSurface({
  markers = [],
  route,
  center = DEFAULT_CENTER,
  zoomLevel = DEFAULT_ZOOM,
  className,
}: MapSurfaceProps) {
  if (!maplibre) return null;
  const { MapView, Camera, RasterSource, RasterLayer, LineLayer, ShapeSource, PointAnnotation } = maplibre;

  const routeGeoJson = route
    ? {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: {},
            geometry: { type: "LineString" as const, coordinates: route },
          },
        ],
      }
    : null;

  return (
    <View className={className}>
      <MapView style={StyleSheet.absoluteFill}>
        <RasterSource id="osm-tiles" tileUrlTemplates={[OSM_TILE_URL_TEMPLATE]} tileSize={256}>
          <RasterLayer id="osm-tiles-layer" sourceID="osm-tiles" />
        </RasterSource>

        <Camera centerCoordinate={center} zoomLevel={zoomLevel} />

        {routeGeoJson ? (
          <ShapeSource id="route" shape={routeGeoJson}>
            <LineLayer id="route-line" sourceID="route" style={{ lineColor: colors.brand.DEFAULT, lineWidth: 3 }} />
          </ShapeSource>
        ) : null}

        {markers.map((marker) => (
          <PointAnnotation
            key={marker.id}
            id={marker.id}
            title={marker.label}
            coordinate={marker.coordinate}
          >
            <View
              className="size-4 items-center justify-center rounded-full border-2 border-white"
              style={{ backgroundColor: MARKER_COLORS[marker.kind] ?? colors.brand.DEFAULT }}
            />
          </PointAnnotation>
        ))}
      </MapView>
      <Text className="absolute bottom-1 right-2 text-[10px] text-subtle">{OSM_ATTRIBUTION}</Text>
    </View>
  );
}
