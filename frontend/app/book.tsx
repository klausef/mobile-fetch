import { useConvexAuth } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  fareBreakdown,
  haversineKm,
  DEFAULT_TARIFF,
  type FareTariff,
  type LatLng,
  type RideType,
} from "@/shared";
import { RideTypePicker, FareCard, PointRow } from "@/components/ride";
import {
  Button,
  Card,
  Screen,
  ScreenHeader,
  Loading,
  Between,
} from "@/components/ui";
import { colors, font, scroll, space } from "@/theme";

/** The default tariff used for quoting before the live table is available. */
const LOCAL_TARIFF: FareTariff = DEFAULT_TARIFF;

export default function BookScreen() {
  const { isAuthenticated } = useConvexAuth();
  const [pickup, setPickup] = useState<{
    name: string;
    address: string;
    point: LatLng | null;
  }>({ name: "", address: "", point: null });
  const [destination, setDestination] = useState<{
    name: string;
    address: string;
    point: LatLng | null;
  }>({ name: "", address: "", point: null });
  const [rideType, setRideType] = useState<RideType>("tricycle");
  const [prefill, setPrefill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  if (!isAuthenticated) return <Loading label="Signing in..." />;

  const distanceKm = pickup.point && destination.point
    ? haversineKm(pickup.point, destination.point)
    : 0;

  return (
    <Screen contentStyle={{ gap: scroll.cardGap }}>
      <ScreenHeader
        title="Book a ride"
        subtitle={
          prefill
            ? "Confirmed pickup and destination"
            : "Set pickup and destination"
        }
      />
      <View style={styles.scroll}>
        <Between>
          <Text
            style={[font.tiny, { color: colors.textFaint }]}
            numberOfLines={1}
          >
            {pickup.point ? pickup.name : "Not set"}
          </Text>
          <Text
            style={[font.tiny, { color: colors.textFaint }]}
            numberOfLines={1}
          >
            {destination.point ? destination.name : "Not set"}
          </Text>
        </Between>

        {!prefill ? (
          <>
            <Card>
              <ScreenHeader
                title="Where are you?"
                subtitle="Pickup"
              />
              <PointRow
                kind="pickup"
                caption={pickup.point ? pickup.name : "Not set"}
                onPress={() => setPrefill(true)}
              />
              <Text style={[font.small, { color: colors.textMuted }]}>
                Tap to set your pickup.
              </Text>
            </Card>

            <Card>
              <ScreenHeader
                title="Where to?"
                subtitle="Destination"
              />
              <PointRow
                kind="destination"
                caption={destination.point ? destination.name : "Not set"}
                onPress={() => setPrefill(true)}
              />
              <Text style={[font.small, { color: colors.textMuted }]}>
                Tap to set your destination.
              </Text>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <ScreenHeader
                title="Where are you?"
                subtitle="Pickup"
              />
              <PointRow
                kind="pickup"
                caption={pickup.point ? pickup.name : "Not set"}
                onPress={() => setPrefill(false)}
              />
              <Text style={[font.small, { color: colors.textMuted }]}>
                Tap to update.
              </Text>
            </Card>

            <Card>
              <ScreenHeader
                title="Where to?"
                subtitle="Destination"
              />
              <PointRow
                kind="destination"
                caption={destination.point ? destination.name : "Not set"}
                onPress={() => setPrefill(false)}
              />
              <Text style={[font.small, { color: colors.textMuted }]}>
                Tap to update.
              </Text>
            </Card>
          </>
        )}

        <Card>
          <ScreenHeader
            title="Vehicle"
            subtitle="Choose how you ride"
          />
          <RideTypePicker value={rideType} onChange={setRideType} />
        </Card>

        {prefill && pickup.point && destination.point ? (
          <FareCard
            distanceKm={distanceKm}
            rideType={rideType}
            tariff={LOCAL_TARIFF}
          />
        ) : null}

        <Button
          label="Request ride"
          onPress={() => {
            /* future: call Convex requestRide */
          }}
          disabled={!pickup.point || !destination.point || busy}
          loading={busy}
          fullWidth
        />

        {message && (
          <Text style={[font.small, { color: colors.success }]}>
            {message}
          </Text>
        )}
        {lastError && (
          <Text style={[font.small, { color: colors.danger }]}>
            {lastError}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: scroll.cardGap, paddingBottom: space.xxl },
});
