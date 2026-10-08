import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/Badge";
import type { Booking } from "@/types";
import { formatDistance } from "@/utils/format";

/**
 * The booking a passenger currently has moving. It is the one card that opens
 * the tracker, so it shows the two things they want to know: how far along
 * the status is, and what it costs.
 */
export function ActiveBookingCard({
  booking,
  onTrack,
}: {
  booking: Booking;
  onTrack: (booking: Booking) => void;
}) {
  return (
    <Card className="gap-3 border-brand/30 bg-brand-soft">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
          Your trip
        </Text>
        <StatusBadge status={booking.status} />
      </View>
      <Text className="text-lg font-semibold text-ink">{booking.serviceName}</Text>
      <Text className="text-sm text-muted" numberOfLines={2}>
        {booking.pickup.name} → {booking.destination.name}
      </Text>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted">{formatDistance(booking.distanceKm)}</Text>
        <Button label="Track trip" size="sm" onPress={() => onTrack(booking)} />
      </View>
    </Card>
  );
}
