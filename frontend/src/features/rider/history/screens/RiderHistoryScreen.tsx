import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Loading, ErrorState, EmptyState } from "@/components/Feedback";
import { formatPeso } from "@/utils/format";
import { useRiderHistory } from "../hooks/useRiderHistory";
import { HistoryRow } from "../components/HistoryRow";

/** The rider's shift report: totals on top, every settled trip under. */
export function RiderHistoryScreen() {
  const router = useRouter();
  const { data, loading, error, refetch } = useRiderHistory();

  return (
    <Screen title="Trip history" subtitle="Earnings and past trips" onBack={() => router.back()}>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={() => void refetch()} /> : null}
      {data ? (
        <>
          <Card className="gap-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
              Total earnings
            </Text>
            <Text className="text-3xl font-bold text-ink">
              {formatPeso(data.earnings.total)}
            </Text>
            <Text className="text-xs text-muted">
              {data.earnings.trips} trips · {formatPeso(data.earnings.todayTotal)} today
            </Text>
          </Card>

          {data.trips.length === 0 ? (
            <EmptyState
              title="No completed trips"
              body="Finish a trip and its receipt shows up here."
            />
          ) : (
            <View className="gap-3">
              {data.trips.map((trip) => (
                <HistoryRow key={trip.id} trip={trip} />
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}
