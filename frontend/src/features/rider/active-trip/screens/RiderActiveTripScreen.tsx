import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/Badge";
import { Loading, ErrorState, EmptyState } from "@/components/Feedback";
import { MapView } from "@/components/MapView";
import { formatDistance, formatPeso } from "@/utils/format";
import { isActiveStatus } from "@/utils/bookingStatus";
import { routes } from "@/navigation/routes";
import { riderApi } from "@/services/api";
import { useActiveTrip } from "../hooks/useActiveTrip";
import { advanceTrip } from "../services/activeTrip.service";
import { TripActions } from "../components/TripActions";
import type { BookingStatus } from "@/types";

/**
 * The trip in the rider's hand: map, the passenger's two ends, and the one
 * button that moves it forward — arrived, started, completed.
 */
export function RiderActiveTripScreen() {
  const router = useRouter();
  const { data, loading, error, refetch } = useActiveTrip();
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Screen title="Active trip" onBack={() => router.back()}><Loading /></Screen>;
  if (error) {
    return (
      <Screen title="Active trip" onBack={() => router.back()}>
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen title="Active trip" onBack={() => router.back()}>
        <EmptyState
          title="No trip in hand"
          body="Accept a request from your dashboard and it becomes this screen."
          action={
            <Button label="Go to dashboard" variant="secondary" onPress={() => router.push(routes.riderDashboard)} />
          }
        />
      </Screen>
    );
  }

  const { booking } = data;

  const advance = () => {
    if (!data.nextAction) return;
    const next: BookingStatus = data.nextAction.status;
    setBusy(true);
    void advanceTrip(booking.id, next)
      .then(() => refetch())
      .catch((cause: unknown) =>
        Alert.alert("Could not update", cause instanceof Error ? cause.message : "Try again."),
      )
      .finally(() => setBusy(false));
  };

  const cancel = () => {
    Alert.alert("Cancel this trip?", "The passenger will be told.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void riderApi
            .updateBookingStatus(booking.id, "cancelled")
            .then(() => refetch())
            .catch((cause: unknown) =>
              Alert.alert("Could not cancel", cause instanceof Error ? cause.message : "Try again."),
            )
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  return (
    <Screen title="Active trip" subtitle={booking.serviceName} onBack={() => router.back()}>
      <Card className="gap-3 p-0">
        <MapView
          markers={data.markers}
          route={data.route}
          center={data.center}
          className="h-52 overflow-hidden rounded-t-2xl"
        />
        <View className="gap-1 p-4 pt-3">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-ink">{booking.passengerName}</Text>
            <StatusBadge status={booking.status} />
          </View>
          <Text className="text-sm text-muted" numberOfLines={2}>
            {booking.pickup.name} → {booking.destination.name}
          </Text>
          <Text className="text-sm text-muted">
            {formatDistance(booking.distanceKm)} · {formatPeso(booking.fare)}
          </Text>
        </View>
      </Card>

      {!isActiveStatus(booking.status) ? (
        <Card className="gap-1">
          <Text className="text-sm font-semibold text-success">
            {booking.status === "completed" ? "Trip completed" : "Trip cancelled"}
          </Text>
          <Text className="text-sm text-muted">
            {booking.status === "completed"
              ? `${formatPeso(booking.fare)} added to today's earnings.`
              : "The booking is closed."}
          </Text>
        </Card>
      ) : null}

      <TripActions view={data} busy={busy} onAdvance={advance} onCancelled={cancel} />
    </Screen>
  );
}
