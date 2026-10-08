import { Alert, View, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/Badge";
import { Loading, ErrorState } from "@/components/Feedback";
import { useAsync } from "@/hooks/useAsync";
import { formatDistance, formatPeso, formatDateTime } from "@/utils/format";
import { cancelBooking, loadBooking } from "../services/booking.service";
import { StatusTimeline } from "../../tracking/components/StatusTimeline";

/** One booking, in full: the trip, the money, its history, and cancellation. */
export function BookingDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking, loading, error, refetch } = useAsync(
    () => loadBooking(String(id ?? "")),
    [id],
  );

  if (loading && !booking) return <Screen title="Booking" onBack={() => router.back()}><Loading /></Screen>;
  if (error) {
    return (
      <Screen title="Booking" onBack={() => router.back()}>
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (!booking) return null;

  const cancellable = ["pending", "accepted", "driver_arriving"].includes(booking.status);

  const cancel = () => {
    Alert.alert("Cancel this booking?", "The rider will be told.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: () => {
          void cancelBooking(booking.id)
            .then(() => refetch())
            .catch((cause: unknown) =>
              Alert.alert(
                "Could not cancel",
                cause instanceof Error ? cause.message : "Something went wrong.",
              ),
            );
        },
      },
    ]);
  };

  return (
    <Screen title="Booking" subtitle={booking.serviceName} onBack={() => router.back()}>
      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-ink">
            {formatPeso(booking.fare)}
          </Text>
          <StatusBadge status={booking.status} />
        </View>
        <Text className="text-sm text-muted">
          {formatDistance(booking.distanceKm)} · booked {formatDateTime(booking.createdAt)}
        </Text>
      </Card>

      <Card className="gap-3">
        <TripPoint label="Pickup" name={booking.pickup.name} address={booking.pickup.address} />
        <TripPoint
          label="Destination"
          name={booking.destination.name}
          address={booking.destination.address}
        />
      </Card>

      <StatusTimeline timeline={booking.timeline} />

      {cancellable ? (
        <Button label="Cancel booking" variant="danger" onPress={cancel} fullWidth />
      ) : null}
    </Screen>
  );
}

function TripPoint({ label, name, address }: { label: string; name: string; address: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <Text className="font-medium text-ink">{name}</Text>
      <Text className="text-xs text-muted">{address}</Text>
    </View>
  );
}
