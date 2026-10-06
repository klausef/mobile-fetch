/**
 * Mapbox map components for the mobile app.
 *
 * The first Mapbox surface in FETCH. It renders a Mapbox style, the user's current
 * location puck, pickup and destination pins, and a route line between them.
 *
 * This is intentionally kept as the mobile map surface for the route test screen
 * first. The existing web app uses its own MapLibre-based map and is not touched by
 * this file.
 */

import { useRef } from "react";
import { StyleSheet, Text } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { MapView } from "@rnmapbox/maps";
import { Camera } from "@rnmapbox/maps";
import { ShapeSource } from "@rnmapbox/maps";
import { LineLayer } from "@rnmapbox/maps";
import { UserLocation } from "@rnmapbox/maps";
import { PointAnnotation } from "@rnmapbox/maps";

import { LatLng } from "@/lib/shared";
import { straightLine } from "@/lib/mapbox-route";
import { hasMapboxToken, configureMapbox } from "@/lib/mapbox";

const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

export interface MapPin {
  id: string;
  coordinate: LatLng;
  title?: string;
}

export interface MapRoute {
  from: LatLng;
  to: LatLng;
}

function geojsonForRoute(route: MapRoute): GeoJSON.Feature<GeoJSON.LineString> {
  const coordinates = straightLine(route.from, route.to);
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {},
  };
}

export function MapboxMap({
  pins,
  route,
  initialPosition,
  onMapLoaded,
}: {
  pins?: MapPin[];
  route?: MapRoute | null;
  initialPosition?: LatLng;
  onMapLoaded?: () => void;
}) {
  configureMapbox();

  const mapRef = useRef<MapView>(null!);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      styleURL={hasMapboxToken() ? MAPBOX_STYLE : undefined}
      onPress={() => {}}
      onMapIdle={() => {
        onMapLoaded?.();
      }}
    >
      <Camera
        zoomLevel={13}
        centerCoordinate={initialPosition ? [initialPosition.lng, initialPosition.lat] : [125.1305726, 8.1550421]}
        animationMode="none"
      />

      {hasMapboxToken() && route && route.from && route.to && (
        <ShapeSource id="route" shape={geojsonForRoute(route)}>
          <LineLayer
            id="route-line"
            style={{
              lineColor: "#E1251B",
              lineWidth: 4,
              lineOpacity: 0.95,
            }}
          />
        </ShapeSource>
      )}

      {pins?.map((pin) => (
        <PointAnnotation
          key={pin.id}
          id={pin.id}
          coordinate={[pin.coordinate.lng, pin.coordinate.lat]}
          title={pin.title ?? undefined}
        >
          <Text>{pin.title ?? ""}</Text>
        </PointAnnotation>
      ))}

      <UserLocation />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  pinLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
});
