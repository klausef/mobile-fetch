import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { formatDistance, formatPeso, formatTime } from "@/utils/format";
import type { Booking } from "@/types";

/** An open booking the rider can take or pass on. */
export function RequestCard({
  booking,
  onAccept,
  onReject,
  busy,
}: {
  booking: Booking;
  onAccept: (booking: Booking) => void;
  onReject: (booking: Booking) => void;
  busy?: boolean;
}) {
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">{booking.serviceName}</Text>
        <Badge label={formatTime(booking.createdAt)} tone="neutral" />
      </View>
      <View className="gap-0.5">
        <Text className="text-sm text-ink" numberOfLines={1}>
          {booking.pickup.name}
        </Text>
        <Text className="text-sm text-muted" numberOfLines={1}>
          → {booking.destination.name}
        </Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          {formatDistance(booking.distanceKm)} · {booking.passengerName}
        </Text>
        <Text className="text-base font-bold text-ink">{formatPeso(booking.fare)}</Text>
      </View>
      <View className="flex-row gap-2">
        <Button label="Pass" variant="secondary" size="sm" onPress={() => onReject(booking)} disabled={busy} />
        <Button label="Accept" size="sm" onPress={() => onAccept(booking)} loading={busy} />
      </View>
    </Card>
  );
}
