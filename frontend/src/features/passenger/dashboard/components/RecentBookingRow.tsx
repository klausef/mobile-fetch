import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/Badge";
import type { Booking } from "@/types";
import { formatDateTime, formatPeso } from "@/utils/format";

/** One finished (or cancelled) booking in the dashboard's recent list. */
export function RecentBookingRow({ booking }: { booking: Booking }) {
  return (
    <Card>
      <View className="gap-1">
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
      </View>
    </Card>
  );
}
