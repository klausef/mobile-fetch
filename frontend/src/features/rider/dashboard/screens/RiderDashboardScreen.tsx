import { useState } from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/Card";
import { Loading, ErrorState, EmptyState } from "@/components/Feedback";
import { routes } from "@/navigation/routes";
import { riderApi, riderProfileApi } from "@/services/api";
import { useRiderDashboard } from "../hooks/useRiderDashboard";
import { OnlineToggle } from "../components/OnlineToggle";
import { EarningsCard } from "../components/EarningsCard";
import { RequestCard } from "../components/RequestCard";
import { ActiveTripCard } from "../components/ActiveTripCard";
import type { Booking } from "@/types";

/**
 * The rider's home: the shift switch, the money, the trip in hand, and the
 * open requests to take or pass on.
 */
export function RiderDashboardScreen() {
  const router = useRouter();
  const { data, loading, error, refetch } = useRiderDashboard();
  const [toggling, setToggling] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  if (loading && !data) return <Screen title="Rider" subtitle="Your shift"><Loading /></Screen>;
  if (error) {
    return (
      <Screen title="Rider" subtitle="Your shift">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (!data) return null;

  const setOnline = (online: boolean) => {
    setToggling(true);
    void riderProfileApi
      .setOnline(online)
      .then(() => refetch())
      .catch((cause: unknown) =>
        Alert.alert("Could not update", cause instanceof Error ? cause.message : "Try again."),
      )
      .finally(() => setToggling(false));
  };

  const accept = (booking: Booking) => {
    setActingOn(booking.id);
    void riderApi
      .acceptBooking(booking.id)
      .then(() => router.push(routes.riderActiveTrip))
      .catch((cause: unknown) =>
        Alert.alert("Could not accept", cause instanceof Error ? cause.message : "Try again."),
      )
      .finally(() => setActingOn(null));
  };

  const reject = (booking: Booking) => {
    // Passing on a request leaves it open for everyone else — the list simply
    // drops it for this rider on the next refresh.
    setActingOn(booking.id);
    refetch();
    setActingOn(null);
  };

  return (
    <Screen title={`Rider · ${data.rider.name.split(" ")[0]}`} subtitle="Your shift">
      <OnlineToggle rider={data.rider} onChange={setOnline} disabled={toggling} />
      <EarningsCard earnings={data.earnings} rider={data.rider} />

      {data.activeTrip ? (
        <ActiveTripCard
          booking={data.activeTrip}
          onOpen={() => router.push(routes.riderActiveTrip)}
        />
      ) : null}

      <View>
        <SectionTitle title="Available requests" />
        {!data.rider.online ? (
          <EmptyState
            title="You are offline"
            body="Go online to see booking requests from nearby passengers."
          />
        ) : data.requests.length === 0 ? (
          <EmptyState
            title="No requests right now"
            body="New bookings appear here as passengers book."
          />
        ) : (
          <View className="gap-3">
            {data.requests.map((booking) => (
              <RequestCard
                key={booking.id}
                booking={booking}
                onAccept={accept}
                onReject={reject}
                busy={actingOn === booking.id}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
