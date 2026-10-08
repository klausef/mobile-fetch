import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/Badge";
import { formatDateTime, formatPeso } from "@/utils/format";
import type { Booking } from "@/types";

/** One settled trip: what it paid, when, and how it ended. */
export function HistoryRow({ trip }: { trip: Booking }) {
  return (
    <Card className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold text-ink">{trip.serviceName}</Text>
        <Text
          className={`font-semibold ${
            trip.status === "completed" ? "text-ink" : "text-subtle line-through"
          }`}
        >
          {formatPeso(trip.fare)}
        </Text>
      </View>
      <Text className="text-sm text-muted" numberOfLines={1}>
        {trip.pickup.name} → {trip.destination.name} · {trip.passengerName}
      </Text>
      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-xs text-muted">{formatDateTime(trip.updatedAt)}</Text>
        <StatusBadge status={trip.status} />
      </View>
    </Card>
  );
}
