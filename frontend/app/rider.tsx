import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  api,
  countLabel,
  driverStage,
  errorMessage,
  formatCountdown,
  formatPeso,
  formatEta,
  isRequestExpired,
  remainingMs,
  REQUEST_TIMEOUT_MS,
  serviceLabel,
  shortAddress,
  titleCase,
  type Id,
} from "@/shared";
import { durationFromMs } from "@/utils/format";
import { useLiveFix } from "@/hooks/use-device-location";
import { StatusPill } from "@/components/ride";
import {
  Between,
  Button,
  Card,
  Divider,
  EmptyState,
  LineItem,
  Loading,
  Pill,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from "@/components/ui";
import { colors, font, scroll, space, touch } from "@/theme";

/**
 * The rider's work surface: go online, watch requests arrive, drive them.
 *
 * One screen rather than three, because a rider checks it between trips with
 * one thumb on a handlebar mount. While online the phone streams its position
 * to the same `riders` row the commuter's screen reads, so "where is my
 * tricycle" is answered without a second subscription.
 */
export default function RiderScreen() {
  const profile = useQuery(api.profiles.getMyProfile);
  const rider = useQuery(api.riders.getMyRider);
  const stats = useQuery(api.riders.getDriverStats);
  const earnings = useQuery(api.rides.riderEarnings);
  const requests = useQuery(api.riders.nearbyRequests);
  const active = useQuery(api.rides.listActiveRides);
  const policy = useQuery(api.riders.getBookingPolicy);

  const setOnline = useMutation(api.riders.setOnline);
  const updateLocation = useMutation(api.riders.updateLocation);
  const accept = useMutation(api.rides.acceptRide);
  const pass = useMutation(api.rides.passRide);
  const cancelRide = useMutation(api.rides.cancelRide);
  const advance = useMutation(api.rides.updateRideStatus);
  const reportItemCost = useMutation(api.rides.reportItemCost);

  const isOnline = rider?.isOnline ?? false;
  const fix = useLiveFix(isOnline);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // One clock for every countdown on the screen, rather than one per request:
  // a request card that ticks to its own timer is a row of slightly different
  // numbers describing the same shared deadline.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The stream is throttled by the server too, so a fix that barely moved is
  // dropped there rather than here — this only has to not send the same point
  // twice per second.
  useEffect(() => {
    if (!isOnline || !fix.point) return;
    void updateLocation({
      lat: fix.point.lat,
      lng: fix.point.lng,
      heading: fix.heading ?? undefined,
    }).catch(() => {
      // A dropped position tick is not worth a dialog: the next one carries
      // the same story, and the rider's next tap is what matters.
    });
  }, [fix.heading, fix.point, isOnline, updateLocation]);

  const capacity = useMemo(() => {
    const limit = policy?.maxConcurrentRides ?? 1;
    const carrying = active?.length ?? 0;
    return { limit, carrying, full: carrying >= limit };
  }, [active, policy]);

  if (profile === undefined || rider === undefined) {
    return <Loading label="Opening the driver screen…" />;
  }
  if (profile === null) return <Redirect href="/onboarding" />;
  if (profile.role !== "rider") return <Redirect href="/(tabs)/book" />;
  if (rider === null) {
    // Only reachable if the rider row was never written — a broken onboarding,
    // not a state the driver screen can invent its way out of.
    return (
      <Screen>
        <ScreenHeader title="Booking" />
        <EmptyState
          icon="alert-circle-outline"
          title="Rider profile missing"
          body="Your driving record could not be loaded. Open your profile and try again, or sign out and back in."
        />
        <Button
          label="Open profile"
          onPress={() => router.replace("/(tabs)/profile")}
        />
      </Screen>
    );
  }

  const vehicleReady = rider.vehicle.make !== "—";
  const approved = rider.approval === "APPROVED";

  const toggle = async () => {
    setBusy("online");
    setError(null);
    try {
      await setOnline({ isOnline: !isOnline });
    } catch (err) {
      setError(errorMessage(err, "Could not change your availability."));
    } finally {
      setBusy(null);
    }
  };

  const take = async (rideId: Id<"rides">) => {
    setBusy(rideId);
    setError(null);
    try {
      await accept({ rideId });
      router.push("/ride");
    } catch (err) {
      setError(errorMessage(err, "Could not take that request."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen contentStyle={{ gap: scroll.cardGap }}>
      <ScreenHeader
        title="Booking"
        subtitle={
          isOnline
            ? "You are online. Requests appear below."
            : "You are offline — no requests will be sent."
        }
        right={
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isOnline }}
            onPress={() => void toggle()}
            disabled={busy === "online"}
            style={[styles.switch, { backgroundColor: isOnline ? colors.success : colors.muted }]}
          >
            <View
              style={[
                styles.knob,
                { alignSelf: isOnline ? "flex-end" : "flex-start" },
              ]}
            />
          </Pressable>
        }
      />

      {!vehicleReady ? (
        <Card tone="warm">
          <Text style={[font.bodyStrong, { color: colors.ink }]}>
            Add your vehicle first
          </Text>
          <Text style={[font.small, { color: colors.textMuted }]}>
            A commuter is told what to look for, so the goes-online switch waits
            on the make, model, colour and plate.
          </Text>
          <Button
            label="Add vehicle details"
            onPress={() => router.push("/vehicle")}
          />
        </Card>
      ) : !approved ? (
        <Card tone="warm">
          <Row gap={space.sm}>
            <Pill label={titleCase(rider.approval)} tone="warn" />
            <Text
              style={[font.small, { color: colors.textMuted, flex: 1 }]}
              numberOfLines={2}
            >
              Your rider account is still being reviewed. You cannot go online
              until it is approved.
            </Text>
          </Row>
        </Card>
      ) : null}

      {stats ? (
        <Card>
          <Row gap={space.lg}>
            <MiniStat
              label="Rating"
              value={stats.rating ? `${stats.rating.avg.toFixed(1)} ★` : "—"}
            />
            <MiniStat label="Trips" value={String(stats.completedCount)} />
            <MiniStat
              label="Online today"
              value={durationFromMs(stats.onlineMsToday)}
            />
          </Row>
          {earnings ? (
            <Text style={[font.small, { color: colors.textMuted }]}>
              Today {formatPeso(earnings.today)} · week{" "}
              {formatPeso(earnings.week)} · lifetime{" "}
              {formatPeso(earnings.total)}. After the{" "}
              {Math.round(earnings.platformRate * 100)}% platform fee.
            </Text>
          ) : null}
          {isOnline && !fix.point ? (
            <Text style={[font.small, { color: colors.warning }]}>
              Waiting for a GPS fix — commuters will not see you move until your
              phone has one.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {error ? (
        <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
      ) : null}

      {active && active.length > 0 ? (
        <>
          <Text
            style={[
              font.tiny,
              { color: colors.textFaint, textTransform: "uppercase" },
            ]}
          >
            Carrying now ({capacity.carrying}/{capacity.limit})
          </Text>
          {active.map((trip) => (
            <ActiveTrip
              key={trip.ride._id}
              trip={trip}
              busy={busy === trip.ride._id}
              onAdvance={async (status) => {
                setBusy(trip.ride._id);
                setError(null);
                try {
                  await advance({ rideId: trip.ride._id, status });
                } catch (err) {
                  setError(
                    errorMessage(err, "Could not update the trip."),
                  );
                } finally {
                  setBusy(null);
                }
              }}
              onCancel={async () => {
                setBusy(trip.ride._id);
                try {
                  await cancelRide({
                    rideId: trip.ride._id,
                    reason: "Cancelled by the rider",
                  });
                } catch (err) {
                  setError(
                    errorMessage(err, "Could not cancel the trip."),
                  );
                } finally {
                  setBusy(null);
                }
              }}
              onReportCost={async (cost) => {
                setBusy(trip.ride._id);
                try {
                  await reportItemCost({
                    rideId: trip.ride._id,
                    itemCost: cost,
                  });
                } catch (err) {
                  setError(
                    errorMessage(err, "Could not report the cost."),
                  );
                } finally {
                  setBusy(null);
                }
              }}
            />
          ))}
        </>
      ) : null}

      {isOnline && !capacity.full ? (
        <>
          <Text
            style={[
              font.tiny,
              { color: colors.textFaint, textTransform: "uppercase" },
            ]}
          >
            Requests near you
          </Text>
          {requests && requests.length > 0 ? (
            requests.map((request) => {
              const deadline = request.requestedAt + REQUEST_TIMEOUT_MS;
              const left = remainingMs(deadline, now);
              const expired = isRequestExpired(deadline, now);
              return (
                <Card key={request._id}>
                  <Between>
                    <Text style={[font.heading, { color: colors.ink }]}>
                      {formatPeso(request.fare)}
                    </Text>
                    <Row gap={space.sm}>
                      <Pill
                        label={titleCase(request.rideType)}
                        tone="neutral"
                      />
                      {expired ? (
                        <Pill label="Window closed" tone="warn" />
                      ) : (
                        <Pill label={formatCountdown(left)} tone="live" />
                      )}
                    </Row>
                  </Between>
                  <LineItem
                    label="Service"
                    value={serviceLabel(request.bookingType, "rider")}
                  />
                  <LineItem
                    label="Pick-up"
                    value={shortAddress(request.pickup.address)}
                  />
                  <LineItem
                    label="Drop-off"
                    value={shortAddress(request.destination.address)}
                  />
                  <LineItem
                    label="Trip"
                    value={`${request.distanceKm.toFixed(1)} km · ${formatEta(request.etaMinutes ?? 0)}`}
                  />
                  <LineItem label="Passenger" value={request.name} />
                  {request.pickupDistanceKm != null ? (
                    <LineItem
                      label="Distance to pick-up"
                      value={`${request.pickupDistanceKm.toFixed(1)} km`}
                    />
                  ) : null}
                  {request.detourKm != null ? (
                    <LineItem
                      label="Detour off your route"
                      value={`${request.detourKm.toFixed(1)} km`}
                    />
                  ) : null}
                  {request.doubleBooking ? (
                    <Text style={[font.small, { color: colors.warning }]}>
                      This would be your second ride at once — only if the route
                      barely detours.
                    </Text>
                  ) : null}
                  {request.bookingType !== "ride" &&
                    request.items.length > 0 ? (
                    <>
                      <Divider />
                      <Text
                        style={[font.label, { color: colors.textMuted }]}
                      >
                        To{" "}
                        {request.bookingType === "pabili" ? "buy" : "deliver"}
                      </Text>
                      {request.items.map((item, index) => (
                        <LineItem
                          key={`${request._id}-${index}`}
                          label={item.name}
                          value={`×${item.qty}`}
                        />
                      ))}
                      {request.hasBudget ? (
                        <Text style={[font.small, { color: colors.textMuted }]}>
                          Cash committed up front for the purchase.
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  {request.notes ? (
                    <Text style={[font.small, { color: colors.textMuted }]}>
                      Note: {request.notes}
                    </Text>
                  ) : null}
                  <Row gap={space.sm}>
                    <Button
                      label="Accept"
                      onPress={() => void take(request._id)}
                      loading={busy === request._id}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Pass"
                      variant="ghost"
                      onPress={() => void pass({ rideId: request._id })}
                    />
                  </Row>
                  {expired && !request.expiredForYou ? (
                    <Text style={[font.small, { color: colors.textFaint }]}>
                      The fifteen-second window closed, but the request is still
                      open if you can take it.
                    </Text>
                  ) : null}
                </Card>
              );
            })
          ) : (
            <EmptyState
              icon="radio-outline"
              title="No requests right now"
              body="Stay online — new requests appear here the moment a commuter books nearby."
            />
          )}
        </>
      ) : null}

      {!isOnline ? (
        <EmptyState
          icon="power-outline"
          title="You are offline"
          body="Turn the switch on to start receiving trips. Your position is only shared while you are online."
        />
      ) : null}

      {capacity.full ? (
        <Card tone="warm">
          <Text style={[font.small, { color: colors.textMuted }]}>
            You are carrying{" "}
            {countLabel(capacity.carrying, "ride")} — the maximum right now.
            Finish one to see new requests.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

/** One number from the shift: the label small, the value doing the talking. */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={[
          font.tiny,
          { color: colors.textFaint, textTransform: "uppercase" },
        ]}
      >
        {label}
      </Text>
      <Text style={[font.bodyStrong, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

/** The next legal step in a trip's lifecycle, and what the button says. */
const NEXT_STEP: Record<
  string,
  {
    label: string;
    status: "RIDER_ARRIVING" | "RIDER_ARRIVED" | "IN_PROGRESS" | "COMPLETED";
  }
> = {
  ACCEPTED: { label: "I'm on the way", status: "RIDER_ARRIVING" },
  RIDER_ARRIVING: { label: "I have arrived", status: "RIDER_ARRIVED" },
  RIDER_ARRIVED: { label: "Start the trip", status: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Complete the trip", status: "COMPLETED" },
};

/** What the rider is doing right now, in the words they would use. */
const STAGE_LABEL: Record<string, string> = {
  to_pickup: "On the way to the pickup",
  at_pickup: "Waiting at the pickup",
  in_trip: "Driving the trip",
  done: "All done",
};

/** Its glyph, so the card is readable at a glance on a handlebar mount. */
const STAGE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  to_pickup: "navigate",
  at_pickup: "time",
  in_trip: "car-sport",
  done: "checkmark-circle",
};

function ActiveTrip({
  trip,
  busy,
  onAdvance,
  onCancel,
  onReportCost,
}: {
  trip: {
    ride: {
      _id: Id<"rides">;
      status: string;
      bookingType?: "ride" | "pabili" | "padala";
      pickup: { address?: string };
      destination: { address?: string };
      fare: number;
      items?: { name: string; qty: number }[];
      itemBudget?: number;
      itemCostActual?: number;
      notes?: string;
    };
    passenger: { name: string };
  };
  busy: boolean;
  onAdvance: (
    status: "RIDER_ARRIVING" | "RIDER_ARRIVED" | "IN_PROGRESS" | "COMPLETED",
  ) => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onReportCost: (cost: number) => void | Promise<void>;
}) {
  const { ride, passenger } = trip;
  const next = NEXT_STEP[ride.status];
  const stage = driverStage(ride.status);
  const isErrand = ride.bookingType === "pabili" || ride.bookingType === "padala";
  // Only the pabili receipt is asked for, and only until it has been given:
  // a second box asking what was already reported is a question with its
  // answer on the same card.
  const [cost, setCost] = useState("");

  const submitCost = async () => {
    const value = Number.parseFloat(cost);
    if (!Number.isFinite(value) || value < 0) return;
    await onReportCost(value);
  };

  return (
    <Card>
      <Between>
        <Row gap={space.sm}>
          <Ionicons
            name={STAGE_ICON[stage] ?? "navigate"}
            size={16}
            color={colors.red}
          />
          <Text style={[font.bodyStrong, { color: colors.ink }]}>
            {STAGE_LABEL[stage] ?? titleCase(ride.status)}
          </Text>
        </Row>
        <StatusPill status={ride.status} />
      </Between>

      <LineItem label="Fare" value={formatPeso(ride.fare)} />
      {isErrand ? (
        <LineItem
          label="Service"
          value={serviceLabel(ride.bookingType, "rider")}
        />
      ) : null}
      <LineItem label="Pick-up" value={shortAddress(ride.pickup.address)} />
      <LineItem
        label="Drop-off"
        value={shortAddress(ride.destination.address)}
      />
      <LineItem label="Passenger" value={passenger.name} />

      {(ride.items?.length ?? 0) > 0 ? (
        <>
          <Divider />
          <Text style={[font.label, { color: colors.textMuted }]}>
            To {ride.bookingType === "pabili" ? "buy" : "deliver"}
          </Text>
          {(ride.items ?? []).map((item, index) => (
            <LineItem
              key={`${ride._id}-${index}`}
              label={item.name}
              value={`×${item.qty}`}
            />
          ))}
          {ride.itemBudget != null ? (
            <Text style={[font.small, { color: colors.textMuted }]}>
              Budget {formatPeso(ride.itemBudget)} — the commuter's cash for the
              purchase.
            </Text>
          ) : null}
        </>
      ) : null}

      {ride.notes ? (
        <Text style={[font.small, { color: colors.textMuted }]}>
          Note: {ride.notes}
        </Text>
      ) : null}

      {ride.bookingType === "pabili" ? (
        ride.itemCostActual != null ? (
          <Text style={[font.small, { color: colors.textMuted }]}>
            You reported {formatPeso(ride.itemCostActual)}
          </Text>
        ) : (
          <>
            <TextField
              label="What did you spend?"
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={cost}
              onChangeText={setCost}
              hint="The commuter pays this back on top of the fare."
            />
            <Button
              label="Report amount"
              variant="ghost"
              disabled={busy || cost.trim().length === 0}
              onPress={() => void submitCost()}
            />
          </>
        )
      ) : null}

      {next ? (
        <Button
          label={next.label}
          loading={busy}
          onPress={() => void onAdvance(next.status)}
        />
      ) : null}
      <Button
        label="Cancel the trip"
        variant="danger"
        disabled={busy}
        onPress={() => void onCancel()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  /**
   * The goes-online switch beside the header title.
   *
   * Its own height, not a hairline track: it is the one control a rider hits
   * with a gloved thumb between trips, and it has to be worth the target size.
   */
  switch: {
    width: 52,
    height: touch.tapTarget,
    borderRadius: touch.tapTarget / 2,
    paddingHorizontal: 3,
    justifyContent: "center",
  },
  /** Its knob. `alignSelf` in the caller parks it at whichever end is true. */
  knob: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#ffffff",
  },
});