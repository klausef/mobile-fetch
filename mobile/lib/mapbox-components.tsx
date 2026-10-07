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
import { StyleSheet, Text, View } from "react-native";
import { MapView } from "@rnmapbox/maps";
import { Camera } from "@rnmapbox/maps";
import { ShapeSource } from "@rnmapbox/maps";
import { LineLayer } from "@rnmapbox/maps";
import { UserLocation } from "@rnmapbox/maps";
import { PointAnnotation } from "@rnmapbox/maps";

import { LatLng } from "@/lib/shared";
import { colors } from "@/lib/theme";
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

  /*
   * No token in the build, so say that instead of drawing nothing.
   *
   * `styleURL` is what brings the map its tiles, sprites and fonts, and the
   * token that fills it in is read from `expo.extra.mapboxAccessToken` — which
   * on Android is the `app.config` asset compiled into the APK, because a
   * native app has no environment to read at runtime. The consequence is not
   * obvious and it is the thing that wastes an afternoon: pasting the token
   * into `app.json` and reloading the JS bundle changes nothing, because the
   * manifest the app reads was baked in at build time. Without a style the
   * native view still mounts and still paints its background, so the screen is
   * an empty rectangle that is indistinguishable from an app that is broken.
   *
   * The remedy is a rebuild, and the token is public — it ships in every
   * install either way — so there is nothing to hide by being quiet about it.
   */
  if (!hasMapboxToken()) {
    return (
      <View style={styles.missingToken}>
        <Text style={styles.missingTokenTitle}>Map unavailable</Text>
        <Text style={styles.missingTokenBody}>
          This build carries no Mapbox access token, so there is no map to draw.
          Put the public `pk.` token in `expo.extra.mapboxAccessToken` in
          app.json and rebuild the app — reloading the bundle does not re-embed
          it.
        </Text>
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      styleURL={MAPBOX_STYLE}
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

      {route && route.from && route.to && (
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
  missingToken: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 28,
    backgroundColor: colors.background,
  },
  missingTokenTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  missingTokenBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
