import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { type LatLng, type Place, searchPlaces } from "@/shared";
import { Button, Card, Loading, TextField } from "@/components/ui";
import { colors, font, space } from "@/theme";

export default function PlaceSearchScreen({
  onPick,
  region,
}: {
  onPick: (place: Place) => void;
  region?: LatLng | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const places = await searchPlaces(query, region);
      setResults(places);
    } catch {
      setError("Address search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <TextField
        label="Search for a place"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={search}
        returnKeyType="search"
        autoCapitalize="words"
        placeholder="E.g. city hall, market, Valenzuela St"
      />
      {error ? (
        <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
      ) : null}
      {busy ? (
        <Loading label="Searching…" />
      ) : null}

      {results.length === 0 && query.trim().length >= 3 && !busy ? (
        <Text
          style={[font.small, { color: colors.textMuted }]}
          numberOfLines={2}
        >
          No matches for "{query}". Try a different spelling, or tap "Use my
          current location" to drop a pin here.
        </Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(place) => place.id}
        contentContainerStyle={{ gap: space.sm }}
        renderItem={({ item: place }) => (
          <Card tone="plain" style={styles.result}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onPick(place)}
              style={styles.resultRow}
            >
              <View style={{ gap: 4 }}>
                <Text
                  style={[font.bodyStrong, { color: colors.ink }]}
                  numberOfLines={1}
                >
                  {place.name}
                </Text>
                {place.address && (
                  <Text
                    style={[font.small, { color: colors.textMuted }]}
                    numberOfLines={2}
                  >
                    {place.address}
                  </Text>
                )}
              </View>
              <Ionicons
                name="checkmark-outline"
                size={20}
                color={colors.success}
              />
            </Pressable>
          </Card>
        )}
        ListEmptyComponent={
          query.trim().length >= 3 && !busy ? (
            <Text
              style={[font.small, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              No matches for "{query}".
            </Text>
          ) : null
        }
      />

      <Button
        label="Use my current location"
        variant="secondary"
        onPress={async () => {
          try {
            const { status } =
              await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
              setError(
                "Please allow location access to use your current spot.",
              );
              return;
            }
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const p: Place[] = [];
            onPick({
              id: "current-location",
              name: "Current location",
              address:
                p?.[0]?.address ?? `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`,
              point: {
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
              },
            });
          } catch (err: unknown) {
            setError(
              (err as { message?: string })?.message ||
                "Could not read your current location.",
            );
          }
        }}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: space.md, padding: space.lg },
  result: { marginBottom: space.sm },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
});
