import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { Id } from "@/lib/shared";
import {
  api,
  formatPeso,
  serviceLabel,
  shortAddress,
  titleCase,
  tripDurationMs,
  formatDuration,
  type Id as IdType,
  type StoredFareBreakdown,
} from "@/lib/shared";
import { RideTimeline } from "@/components/brand";
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
  Stars,
  TextField,
} from "@/components/ui";
import { colors, font, radius, scroll, space, touch } from "@/lib/theme";

/**
 * One trip, from the request to the receipt.
 *
 * The same screen serves a live ride and a past one, told apart by a `rideId`
 * param: a finished trip is not a different thing, it is the same thing with
 * nothing left to do, and two screens would drift on the fare they show.
 */
export default function RideScreen() {
  const params = useLocalSearchParams<{ rideId?: string }>();
  const pastId =
    typeof params.rideId === "string" ? params.rideId : null;

  const live = useQuery(api.rides.getActiveRide);
  const archived = useQuery(
    api.rides.getRide,
    pastId ? { rideId: pastId as IdType<"rides"> } : "skip",
  );

  const data = pastId ? archived : live;
  const cancelRide = useMutation(api.rides.cancelRide);
  const rate = useMutation(api.ratings.rate);
  const existingRating = useQuery(
    api.ratings.forRide,
    data && data.ride.status === "COMPLETED" && data.role === "commuter"
      ? { rideId: data.ride._id }
      : "skip",
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(false);

  if (data === undefined) return <Loading label="Loading the trip…" />;

  if (data === null) {
    return (
      <Screen>
        <ScreenHeader title="Trip" />
        <EmptyState
          icon="car-sport-outline"
          title="Nothing in progress"
          body="Book a ride and it will appear here while it is happening."
        />
        <Button
          label="Back to booking"
          onPress={() => router.replace("/(tabs)/book")}
        />
      </Screen>
    );
  }

  const { ride, role, counterparty, riderLocation } = data;
  const isCommuter = role === "commuter";
  const canCancel =
    isCommuter &&
    ["SEARCHING", "ACCEPTED", "RIDER_ARRIVING", "RIDER_ARRIVED"].includes(
      ride.status,
    );
  const finished = ride.status === "COMPLETED";
  const cancelled = ride.status === "CANCELLED";
  const rating = existingRating ?? (rated ? { score, comment, mine: true } : null);
  const duration = tripDurationMs(ride.startedAt, ride.completedAt);

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelRide({ rideId: ride._id, reason: "Cancelled from the app" });
      router.replace("/(tabs)/book");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not cancel the trip.",
      );
      setBusy(false);
    }
  };

  const submitRating = async () => {
    setBusy(true);
    setError(null);
    try {
      await rate({
        rideId: ride._id,
        score,
        comment: comment.trim() || undefined,
      });
      setRated(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the rating.",
      );
    } finally {
      setBusy(false);
    }
  };

  const callTarget = counterparty?.phone;

  return (
    <Screen contentStyle={{ gap: scroll.cardGap }}>
      <ScreenHeader
        title={serviceLabel(ride.bookingType, isCommuter ? "commuter" : "rider")}
        subtitle={ride.code}
        right={<StatusPill status={ride.status} />}
      />

      {!pastId ? (
        <Card>
          <Text style={[font.label, { color: colors.textMuted }]}>Progress</Text>
          <RideTimeline status={ride.status} />
          {ride.etaMinutes && !finished && !cancelled ? (
            <Text style={[font.small, { color: colors.textMuted }]}>
              About {ride.etaMinutes} min on the road.
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Row gap={space.md}>
          <View style={[styles.avatar, { minHeight: touch.tapTarget }]}>
            <Text style={[font.bodyStrong, { color: "#ffffff" }]}>
              {(counterparty?.name ?? "Fetch").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[font.heading, { color: colors.ink }]}>
              {counterparty?.name ??
                (isCommuter ? "Finding a rider…" : "Passenger")}
            </Text>
            {isCommuter &&
              counterparty?.vehicle &&
              counterparty.vehicle.make !== "—" ? (
              <Text style={[font.small, { color: colors.textMuted }]}>
                {counterparty.vehicle.make} {counterparty.vehicle.model} ·{" "}
                {counterparty.vehicle.color} · {counterparty.vehicle.plate}
              </Text>
            ) : null}
            {isCommuter && counterparty?.rating ? (
              <Row gap={4}>
                <Ionicons name="star" size={14} color={colors.gold} />
                <Text style={[font.small, { color: colors.textMuted }]}>
                  {counterparty.rating.avg.toFixed(1)} from{" "}
                  {counterparty.rating.count} rating
                  {counterparty.rating.count === 1 ? "" : "s"}
                </Text>
              </Row>
            ) : null}
            {!isCommuter ? (
              <Text style={[font.small, { color: colors.textMuted }]}>
                {data.passenger.name}
                {data.passenger.bookedByName
                  ? ` · booked by ${data.passenger.bookedByName}`
                  : ""}
              </Text>
            ) : null}
          </View>
        </Row>

        {callTarget ? (
          <Button
            label="Call"
            icon="call"
            variant="secondary"
            onPress={() => void Linking.openURL(`tel:${callTarget}`)}
            fullWidth
          />
        ) : null}

        {!isCommuter && data.emergency ? (
          <>
            <Divider />
            <Text style={[font.label, { color: colors.textMuted }]}>
              Emergency contact
            </Text>
            <Between>
              <Text style={[font.body, { color: colors.ink }]}>
                {data.emergency.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void Linking.openURL(`tel:${data.emergency?.phone}`)
                }
                style={styles.phone}
              >
                <Text style={[font.bodyStrong, { color: colors.red }]}>
                  {data.emergency.phone}
                </Text>
              </Pressable>
            </Between>
          </>
        ) : null}

        {isCommuter && riderLocation ? (
          <Text style={[font.small, { color: colors.textMuted }]}>
            Your rider is live at {riderLocation.lat.toFixed(5)},{" "}
            {riderLocation.lng.toFixed(5)}.
          </Text>
        ) : null}
        <Divider />
        <Button
          label={isCommuter ? "Chat with your rider" : "Chat with the passenger"}
          icon="chatbubbles"
          variant="ghost"
          onPress={() => router.push(`/chat?rideId=${ride._id}`)}
          fullWidth
        />
      </Card>

      <Card>
        <Text style={[font.label, { color: colors.textMuted }]}>Route</Text>
        <LineItem label="Pick-up" value={shortAddress(ride.pickup.address)} />
        <LineItem label="Destination" value={shortAddress(ride.destination.address)} />
        <LineItem label="Distance" value={`${ride.distanceKm.toFixed(1)} km`} />
        <LineItem
          label="Vehicle"
          value={titleCase(ride.rideType ?? "tricycle")}
        />
        {duration !== null ? (
          <LineItem label="Trip time" value={formatDuration(duration)} />
        ) : null}
        {ride.notes ? (
          <Text style={[font.small, { color: colors.textMuted }]}>
            Note: {ride.notes}
          </Text>
        ) : null}
      </Card>

      <ReceiptCard
        fare={ride.fare}
        breakdown={ride.fareBreakdown ?? null}
        itemCostActual={ride.itemCostActual ?? null}
        itemBudget={ride.itemBudget ?? null}
        isErrand={ride.bookingType !== "ride"}
      />

      {finished && isCommuter && !cancelled ? (
        <Card>
          <Text style={[font.label, { color: colors.textMuted }]}>
            {rating ? "Your rating" : "How was the trip?"}
          </Text>
          <Stars
            value={rating?.score ?? 0}
            onChange={rating ? undefined : setScore}
            size={34}
          />
          {rating ? (
            <Text style={[font.small, { color: colors.textMuted }]}>
              Thanks — your rider can see this on their profile.
            </Text>
          ) : (
            <>
              <TextField
                value={comment}
                onChangeText={setComment}
                placeholder="Clean tricycle, careful driver (optional)"
                multiline
              />
              <Button
                label="Submit rating"
                variant="secondary"
                onPress={() => void submitRating()}
                disabled={score === 0 || busy}
                loading={busy}
                fullWidth
              />
            </>
          )}
        </Card>
      ) : null}

      {error ? (
        <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
      ) : null}

      {canCancel ? (
        <Button
          label="Cancel this ride"
          variant="danger"
          onPress={() => void leave()}
          loading={busy}
          fullWidth
        />
      ) : null}

      {cancelled ? (
        <Card tone="warm">
          <Row gap={space.sm}>
            <Pill label="Cancelled" tone="bad" />
            <Text
              style={[font.small, { color: colors.textMuted, flex: 1 }]}
              numberOfLines={2}
            >
              This trip was cancelled and the chat is closed.
            </Text>
          </Row>
        </Card>
      ) : null}

      {finished || cancelled ? (
        <Button
          label="Back to booking"
          variant="ghost"
          onPress={() => router.replace("/(tabs)/book")}
          fullWidth
        />
      ) : null}
    </Screen>
  );
}

/** The stored receipt, from the breakdown the server wrote at request time. */
function ReceiptCard({
  fare,
  breakdown,
  itemCostActual,
  itemBudget,
  isErrand,
}: {
  fare: number;
  breakdown: StoredFareBreakdown | null;
  itemCostActual: number | null;
  itemBudget: number | null;
  isErrand: boolean;
}) {
  return (
    <Card>
      <Text style={[font.label, { color: colors.textMuted }]}>
        {isErrand ? "Errand receipt" : "Fare"}
      </Text>
      {breakdown ? (
        <>
          <LineItem label="Base fare" value={formatPeso(breakdown.baseFare)} />
          {breakdown.distanceFee > 0 ? (
            <LineItem
              label="Distance"
              value={formatPeso(breakdown.distanceFee)}
            />
          ) : null}
          {breakdown.stopFee > 0 ? (
            <LineItem label="Store stop" value={formatPeso(breakdown.stopFee)} />
          ) : null}
          {breakdown.surgeFee > 0 ? (
            <LineItem label="Demand" value={formatPeso(breakdown.surgeFee)} />
          ) : null}
          {breakdown.tax > 0 ? (
            <LineItem
              label={`VAT ${breakdown.taxRatePct}%`}
              value={formatPeso(breakdown.tax)}
            />
          ) : null}
          <Divider />
        </>
      ) : null}
      {isErrand && itemCostActual !== null ? (
        <LineItem
          label="Store purchases (repaid in cash)"
          value={formatPeso(itemCostActual)}
        />
      ) : isErrand && itemBudget !== null ? (
        <LineItem
          label="Cash to hand over"
          value={formatPeso(itemBudget)}
        />
      ) : null}
      <Between>
        <Text style={[font.bodyStrong, { color: colors.ink }]}>
          {isErrand ? "Errand fee" : "Total fare"}
        </Text>
        <Text style={[font.title, { color: colors.red }]}>
          {formatPeso(fare)}
        </Text>
      </Between>
      <Text style={[font.small, { color: colors.textMuted }]}>
        Paid in cash to the rider.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 48,
    height: 48,
    minWidth: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  phone: {
    flex: 1,
    alignItems: "flex-end",
  },
});
