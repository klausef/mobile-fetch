import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, shortAddress, type LatLng } from "@/shared";
import {
  setDraftPoint,
  useBookingDraft,
  type DraftField,
} from "@/store/booking-draft";
import { requestFix, type FixResult, type FixFailure } from "@/hooks/use-device-location";
import {
  reverseGeocode,
  searchPlaces,
  type Place,
} from "@/services/maps/geocoding";
import {
  Button,
  Card,
  EmptyState,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from "@/components/ui";
import { PointMarker } from "@/components/brand";
import {
  colors,
  font,
  radius,
  scroll,
  space,
  touch,
} from "@/theme";

/**
 * Where a trip starts and ends.
 *
 * One screen for both ends of the booking, told apart by a param: the pickup
 * and the destination differ only in the words on the header and the marker's
 * colour, and two nearly-identical screens is how the two drift.
 *
 * The phone deliberately does not draw a map here. A MapLibre canvas on a
 * four-inch screen, behind a keyboard, with a pin the user has to drag with
 * their thumb over a live map, is worse than a search box at answering the only
 * question that matters: which of these two lines is the place I mean. "Use my
 * location" covers the case the map existed for.
 */
export default function PlacePickerScreen() {
  const params = useLocalSearchParams<{ field?: string }>();
  const field: DraftField = params.field === "destination" ? "destination" : "pickup";
  const draft = useBookingDraft();
  const current = field === "pickup" ? draft.pickup : draft.destination;
  const otherEnd = field === "pickup" ? draft.destination : draft.pickup;

  const saved = useQuery(api.savedPlaces.listMine);
  const recent = useQuery(api.recentPlaces.listRecent);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locatingError, setLocatingError] = useState<string | null>(null);

  // Debounced so a person typing "valencia" makes one request, not eight — the
  // geocoder is a metered third party and every keystroke is a billable query.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchPlaces(text, otherEnd)
        .then((places) => {
          if (cancelled) return;
          setResults(places);
          setSearchError(
            places.length === 0 ? `No place matched “${text}”.` : null,
          );
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setSearchError("Address search is unavailable right now.");
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, otherEnd]);

  const shortcutRows = useMemo(() => {
    if (results !== null) return [];
    return (saved ?? []).map((place) => ({
      id: place._id as string,
      label: place.label,
      caption: place.address ?? "",
      point: { lat: place.lat, lng: place.lng, address: place.address },
      icon: "bookmark" as const,
    }));
  }, [results, saved]);

  const recentRows = useMemo(() => {
    if (results !== null) return [];
    return (recent ?? []).map((place) => ({
      id: place._id as string,
      label: shortAddress(place.address),
      caption: place.address,
      point: { lat: place.lat, lng: place.lng, address: place.address },
      icon: "time" as const,
    }));
  }, [results, recent]);

  const choose = (point: LatLng & { address?: string }) => {
    setDraftPoint(field, point);
    router.back();
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    setLocatingError(null);
    try {
      const fix = await requestFix();
      if (!fix.ok) {
        setLocatingError(locatingFailureMessage(fix.reason));
        setLocating(false);
        return;
      }
      const resolved = await reverseGeocode(fix.point);
      choose({
        lat: fix.point.lat,
        lng: fix.point.lng,
        address: resolved?.address ?? `${fix.point.lat.toFixed(5)}, ${fix.point.lng.toFixed(5)}`,
      });
    } catch (err) {
      setLocatingError(
        err instanceof Error ? err.message : "Could not use your current location.",
      );
      setLocating(false);
    }
  };

  const headerTitle = field === "pickup" ? "Pickup" : "Destination";
  const headerSubtitle =
    field === "pickup"
      ? current
        ? `${current.address ?? ""}, ${shortAddress(current.address)}`
        : "Set where the trip starts"
      : current
        ? `${current.address ?? ""}, ${shortAddress(current.address)}`
        : "Set where the trip ends";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen contentStyle={{ gap: scroll.cardGap }}>
        <ScreenHeader
          title={headerTitle}
          subtitle={headerSubtitle}
        />

        <TextField
          label="Search for a place"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => {
            const trimmed = query.trim();
            if (trimmed.length >= 3) {
              // The debounced effect already handles the actual search.
            }
            return;
          }}
          returnKeyType="search"
          autoCapitalize="words"
          placeholder="E.g. city hall, market, Valenzuela St"
          error={searchError}
        />

        {searching ? (
          <View style={{ alignItems: "center", gap: space.xs }}>
            <ActivityIndicator color={colors.red} />
            <Text style={[font.small, { color: colors.textMuted }]}>
              Searching…
            </Text>
          </View>
        ) : results && results.length > 0 ? (
          <View style={{ gap: space.sm }}>
            {results.map((place) => (
              <PlaceResult
                key={place.id}
                place={place}
                onPress={() => choose({ lat: place.point.lat, lng: place.point.lng, address: place.address })}
              />
            ))}
          </View>
        ) : null}

        {results === null ? (
          <>
            {shortcutRows.length > 0 ? (
              <Card>
                <Text
                  style={[
                    font.tiny,
                    { color: colors.textFaint, textTransform: "uppercase" },
                  ]}
                >
                  Saved
                </Text>
                <Row gap={space.sm} wrap style={{ flexWrap: "wrap" }}>
                  {shortcutRows.map((row) => (
                    <Pressable
                      key={row.id}
                      accessibilityRole="button"
                      onPress={() =>
                        choose({ lat: row.point.lat, lng: row.point.lng, address: row.point.address })
                      }
                      style={({ pressed }) => [
                        styles.shortcutRow,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Ionicons name={row.icon} size={16} color={colors.textMuted} />
                      <Text
                        style={[font.bodyStrong, { color: colors.ink }]}
                        numberOfLines={1}
                      >
                        {row.label}
                      </Text>
                    </Pressable>
                  ))}
                </Row>
              </Card>
            ) : null}

            {recentRows.length > 0 ? (
              <Card>
                <Text
                  style={[
                    font.tiny,
                    { color: colors.textFaint, textTransform: "uppercase" },
                  ]}
                >
                  Recent
                </Text>
                <View style={{ gap: space.sm }}>
                  {recentRows.map((row) => (
                    <Pressable
                      key={row.id}
                      accessibilityRole="button"
                      onPress={() =>
                        choose({ lat: row.point.lat, lng: row.point.lng, address: row.point.address })
                      }
                      style={({ pressed }) => [
                        styles.recentRow,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <View style={styles.recentDot}>
                        <PointMarker kind={field === "pickup" ? "pickup" : "destination"} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[font.bodyStrong, { color: colors.ink }]}
                          numberOfLines={1}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={[font.small, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {row.caption}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                    </Pressable>
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        ) : null}

        <Button
          label="Use my current location"
          variant="secondary"
          onPress={useCurrentLocation}
          loading={locating}
          disabled={locating}
          fullWidth
        />

        {locatingError ? (
          <Text style={[font.small, { color: colors.danger }]}>
            {locatingError}
          </Text>
        ) : null}

        <Text
          style={[font.small, { color: colors.textFaint, textAlign: "center" }]}
          numberOfLines={2}
        >
          Search works best with a street name or landmark. Current location is a
          good fallback when you are already there.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function PlaceResult({
  place,
  onPress,
}: {
  place: Place;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.placeResult,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.placeMarker}>
        <PointMarker kind="pickup" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[font.bodyStrong, { color: colors.ink }]}
          numberOfLines={1}
        >
          {place.name}
        </Text>
        {place.address ? (
          <Text
            style={[font.small, { color: colors.textMuted }]}
            numberOfLines={2}
          >
            {place.address}
          </Text>
        ) : null}
      </View>
      <Ionicons name="checkmark-outline" size={20} color={colors.success} />
    </Pressable>
  );
}

function locatingFailureMessage(reason: FixFailure): string {
  if (reason === "denied") return "Location access is needed to drop the pin here.";
  return "Location is unavailable right now. Try again in a moment.";
}

const styles = StyleSheet.create({
  shortcutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    minHeight: touch.tapTarget,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: touch.tapTarget + 12,
  },
  recentDot: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: touch.tapTarget + 12,
  },
  placeMarker: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
});
