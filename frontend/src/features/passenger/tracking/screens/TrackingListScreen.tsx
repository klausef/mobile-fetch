import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Loading, ErrorState, EmptyState } from "@/components/Feedback";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/Badge";
import { useAsync } from "@/hooks/useAsync";
import { usePolling } from "@/hooks/usePolling";
import { formatDateTime, formatPeso } from "@/utils/format";
import { isActiveStatus } from "@/utils/bookingStatus";
import { trackingRoute, bookingDetailRoute } from "@/navigation/routes";
import { loadMyBookings } from "../services/tracking.service";
import type { Booking } from "@/types";

/**
 * Every booking the passenger has made, active ones first. An active one
 * opens the live tracker; a settled one opens its details.
 */
export function TrackingListScreen() {
  const router = useRouter();
  const { data, loading, error, refetch } = useAsync(loadMyBookings, []);
  usePolling(refetch, 6000, !loading && !error);

  const bookings = data ?? [];
  const active = bookings.filter((booking) => isActiveStatus(booking.status));
  const past = bookings.filter((booking) => !isActiveStatus(booking.status));

  return (
    <Screen title="My trips" subtitle="Live and past bookings" onBack={() => router.back()}>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={() => void refetch()} /> : null}
      {data && bookings.length === 0 ? (
        <EmptyState title="No bookings yet" body="Book a ride and watch it move here." />
      ) : null}
      {data ? (
        <View className="gap-3">
          {[...active, ...past].map((booking) => (
            <TripRow
              key={booking.id}
              booking={booking}
              onPress={() =>
                router.push(
                  isActiveStatus(booking.status)
                    ? trackingRoute(booking.id)
                    : bookingDetailRoute(booking.id),
                )
              }
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function TripRow({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card className="gap-1 active:bg-paper">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold text-ink">{booking.serviceName}</Text>
          <Text className="font-semibold text-ink">{formatPeso(booking.fare)}</Text>
        </View>
        <Text className="text-sm text-muted" numberOfLines={1}>
          {booking.pickup.name} → {booking.destination.name}
        </Text>
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-xs text-muted">{formatDateTime(booking.createdAt)}</Text>
          <StatusBadge status={booking.status} />
        </View>
      </Card>
    </Pressable>
  );
}
