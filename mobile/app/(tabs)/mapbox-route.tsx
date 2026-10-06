/**
 * Mapbox route test screen for the mobile app.
 *
 * This is the first Mapbox surface in FETCH. It proves three things quickly:
 *   1. the Mapbox style loads with the token,
 *   2. the current-location puck appears,
 *   3. a route line can be drawn between two points.
 *
 * It is deliberately separate from the booking flow so we can validate the map
 * without blocking the rest of the app. Once this screen runs, the same components
 * can be reused on the booking map.
 */

import { useState } from "react";
import { StyleSheet } from "react-native";
import { type Route } from "expo-router";
import { MapboxMap } from "@/lib/mapbox-components";
import { colors, font } from "@/lib/theme";
import { Text, View } from "react-native";
import type { LatLng } from "@/lib/shared";

export const META: Route.Meta = {
  title: "Mapbox",
};

const DESTINATION: LatLng = {
  // Valencia City
  lat: 7.9111239,
  lng: 125.0933669,
};

const PICKUP: LatLng = {
  // Malaybalay City
  lat: 8.1550421,
  lng: 125.1305726,
};

export default function MapboxRouteScreen() {
  const [loading, setLoading] = useState(true);

  const pickupPin = {
    id: "pickup",
    coordinate: PICKUP,
    title: "Pickup",
  };

  const destinationPin = {
    id: "destination",
    coordinate: DESTINATION,
    title: "Destination",
  };

  const route = {
    from: PICKUP,
    to: DESTINATION,
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        {loading ? (
          <Text style={styles.statusText}>Mapbox map loading…</Text>
        ) : (
          <Text style={styles.statusText}>
            Mapbox{" "}
            <Text style={styles.mono}>pk</Text> test: map + current location +
            one route line.
          </Text>
        )}
      </View>

      <MapboxMap
        pins={[pickupPin, destinationPin]}
        route={route}
        initialPosition={DESTINATION}
        onMapLoaded={() => setLoading(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBar: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  statusText: {
    color: "#ffffff",
    fontSize: font.body.fontSize,
    fontWeight: "600",
  },
  mono: {
    fontFamily: "Menlo",
  },
});
