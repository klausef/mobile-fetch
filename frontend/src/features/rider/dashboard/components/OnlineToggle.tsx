import { Text, View } from "react-native";
import { Switch } from "react-native";
import { Card } from "@/components/Card";
import type { Rider } from "@/types";

/** The shift switch. Offline means no new requests reach the rider. */
export function OnlineToggle({
  rider,
  onChange,
  disabled,
}: {
  rider: Rider;
  onChange: (online: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Card className="flex-row items-center justify-between">
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-ink">
          {rider.online ? "You are online" : "You are offline"}
        </Text>
        <Text className="text-sm text-muted">
          {rider.online
            ? "New booking requests will reach you."
            : "Go online to receive booking requests."}
        </Text>
      </View>
      <Switch
        accessibilityLabel="Go online"
        value={rider.online}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: "#15803d", false: "#e7e0d8" }}
        thumbColor="#ffffff"
      />
    </Card>
  );
}
