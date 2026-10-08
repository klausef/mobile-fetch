import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { formatPeso } from "@/utils/format";
import type { EarningsSummary, Rider } from "@/types";

/** The rider's mock earnings: today on top, all-time underneath. */
export function EarningsCard({
  earnings,
  rider,
}: {
  earnings: EarningsSummary;
  rider: Rider;
}) {
  return (
    <Card className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
        Earnings
      </Text>
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-3xl font-bold text-ink">
            {formatPeso(earnings.todayTotal)}
          </Text>
          <Text className="text-xs text-muted">
            today · {earnings.todayTrips} trip{earnings.todayTrips === 1 ? "" : "s"}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold text-ink">
            {formatPeso(earnings.total)}
          </Text>
          <Text className="text-xs text-muted">
            all time · {earnings.trips} trips
          </Text>
        </View>
      </View>
      <Text className="text-xs text-muted">
        {rider.vehicle.color} {rider.vehicle.make} {rider.vehicle.model} ·{" "}
        {rider.vehicle.plate} · ★ {rider.rating.toFixed(1)}
      </Text>
    </Card>
  );
}
