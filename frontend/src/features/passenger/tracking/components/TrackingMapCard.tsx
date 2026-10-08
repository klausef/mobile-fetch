import { Text, View } from "react-native";
import { MapView } from "@/components/MapView";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/Badge";
import type { TrackingView } from "../types";

/** The live map, plus the one line the passenger needs: status and rider. */
export function TrackingMapCard({ view }: { view: TrackingView }) {
  const { booking, markers, route, center } = view;
  return (
    <Card className="gap-3 p-0">
      <MapView markers={markers} route={route} center={center} className="h-56 overflow-hidden rounded-t-2xl" />
      <View className="gap-1 p-4 pt-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-ink">{booking.serviceName}</Text>
          <StatusBadge status={booking.status} />
        </View>
        <Text className="text-sm text-muted" numberOfLines={2}>
          {booking.pickup.name} → {booking.destination.name}
          {booking.riderName ? ` · with ${booking.riderName}` : ""}
        </Text>
      </View>
    </Card>
  );
}
