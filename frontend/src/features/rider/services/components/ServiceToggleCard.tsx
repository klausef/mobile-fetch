import { Switch, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { formatPeso } from "@/utils/format";
import type { RiderService } from "../types";

/** One service row with the served/not-served switch. */
export function ServiceToggleCard({
  service,
  onToggle,
}: {
  service: RiderService;
  onToggle: (serviceId: string, enabled: boolean) => void;
}) {
  return (
    <Card className="flex-row items-center gap-3">
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold text-ink">{service.name}</Text>
          <Text className="text-sm text-muted">
            {formatPeso(service.baseFare)} + {formatPeso(service.perKmFare)}/km
          </Text>
        </View>
        <Text className="text-sm text-muted" numberOfLines={2}>
          {service.description}
        </Text>
      </View>
      <Switch
        accessibilityLabel={`Serve ${service.name}`}
        value={service.enabled}
        onValueChange={(enabled) => onToggle(service.id, enabled)}
        trackColor={{ true: "#15803d", false: "#e7e0d8" }}
        thumbColor="#ffffff"
      />
    </Card>
  );
}
