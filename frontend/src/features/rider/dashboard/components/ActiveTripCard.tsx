import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/Badge";
import { formatDistance, formatPeso } from "@/utils/format";
import type { Booking } from "@/types";

/** The trip the rider already has, linking straight into the active-trip flow. */
export function ActiveTripCard({
  booking,
  onOpen,
}: {
  booking: Booking;
  onOpen: (booking: Booking) => void;
}) {
  return (
    <Card className="gap-3 border-brand/30 bg-brand-soft">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
          Current trip
        </Text>
        <StatusBadge status={booking.status} />
      </View>
      <Text className="text-sm text-ink" numberOfLines={2}>
        {booking.pickup.name} → {booking.destination.name}
      </Text>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          {formatDistance(booking.distanceKm)} · {formatPeso(booking.fare)}
        </Text>
        <Button label="Open trip" size="sm" onPress={() => onOpen(booking)} />
      </View>
    </Card>
  );
}
