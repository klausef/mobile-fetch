import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/Card";
import { Loading, ErrorState, EmptyState } from "@/components/Feedback";
import { routes, bookingDetailRoute, trackingRoute } from "@/navigation/routes";
import { usePassengerDashboard } from "../hooks/usePassengerDashboard";
import { ActiveBookingCard } from "../components/ActiveBookingCard";
import { QuickActions } from "../components/QuickActions";
import { RecentBookingRow } from "../components/RecentBookingRow";

/**
 * The passenger's home: what is moving right now, the three things they do
 * here, and where they have been.
 */
export function PassengerDashboardScreen() {
  const router = useRouter();
  const { data, loading, error, refetch } = usePassengerDashboard();

  if (loading && !data) return <Screen title="FETCH"><Loading /></Screen>;
  if (error) {
    return (
      <Screen title="FETCH">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (!data) return <Screen title="FETCH"><EmptyState title="Nothing here" body="The dashboard could not be loaded." /></Screen>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen
      title={`${greeting}, ${data.passenger.name.split(" ")[0]}`}
      subtitle="Where are you heading?"
    >
      {data.activeBooking ? (
        <ActiveBookingCard
          booking={data.activeBooking}
          onTrack={(booking) => router.push(trackingRoute(booking.id))}
        />
      ) : null}

      <View>
        <SectionTitle title="Get moving" />
        <QuickActions
          onAction={(action) => {
            if (action === "book") router.push(routes.passengerBooking);
            if (action === "services") router.push(routes.passengerServices);
            if (action === "track") router.push(routes.passengerTracking);
          }}
        />
      </View>

      <View>
        <SectionTitle
          title="Recent trips"
          action={
            <Pressable onPress={() => router.push(routes.passengerTracking)}>
              <Text className="text-sm font-semibold text-brand">See all</Text>
            </Pressable>
          }
        />
        {data.recentBookings.length === 0 ? (
          <EmptyState
            title="No trips yet"
            body="Book your first ride and it will show up here."
          />
        ) : (
          <View className="gap-3">
            {data.recentBookings.map((booking) => (
              <Pressable key={booking.id} onPress={() => router.push(bookingDetailRoute(booking.id))}>
                <RecentBookingRow booking={booking} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
