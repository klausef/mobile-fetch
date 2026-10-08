import { View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Loading, ErrorState } from "@/components/Feedback";
import { routes } from "@/navigation/routes";
import { isActiveStatus } from "@/utils/bookingStatus";
import { useBookingTracking } from "../hooks/useBookingTracking";
import { TrackingMapCard } from "../components/TrackingMapCard";
import { StatusTimeline } from "../components/StatusTimeline";

/**
 * The live trip: the map with both ends and the line between them, and the
 * status history underneath. Active bookings poll; finished ones just show.
 */
export function TrackingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refetch } = useBookingTracking(String(id ?? ""));

  if (loading && !data) return <Screen title="Tracking" onBack={() => router.back()}><Loading label="Finding your trip…" /></Screen>;
  if (error) {
    return (
      <Screen title="Tracking" onBack={() => router.back()}>
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (!data) return null;

  return (
    <Screen title="Tracking" subtitle={data.booking.serviceName} onBack={() => router.back()}>
      <TrackingMapCard view={data} />
      <StatusTimeline timeline={data.booking.timeline} />
      {isActiveStatus(data.booking.status) ? (
        <View className="gap-2">
          <Button
            label="Refresh status"
            variant="secondary"
            onPress={() => void refetch()}
            fullWidth
          />
          <Button
            label="Booking details"
            variant="ghost"
            onPress={() => router.push(`/passenger/booking/${data.booking.id}`)}
            fullWidth
          />
        </View>
      ) : (
        <Button label="Back to my trips" variant="secondary" onPress={() => router.push(routes.passengerTracking)} fullWidth />
      )}
    </Screen>
  );
}
