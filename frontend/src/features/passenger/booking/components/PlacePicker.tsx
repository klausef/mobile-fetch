import { Pressable, Text, View } from "react-native";
import { MapPin, Navigation } from "lucide-react-native";
import { Card } from "@/components/Card";
import { colors } from "@/theme/colors";
import type { Location } from "@/types";

/**
 * The two ends of a trip. Each row opens a place chooser; the same component
 * serves pickup and destination so the two can never look like different
 * concepts.
 */
export function PlacePicker({
  pickup,
  destination,
  onPickPickup,
  onPickDestination,
}: {
  pickup: Location | null;
  destination: Location | null;
  onPickPickup: () => void;
  onPickDestination: () => void;
}) {
  return (
    <Card className="gap-3">
      <PlaceRow
        icon={<Navigation size={18} color={colors.success} />}
        label="Pickup"
        value={pickup ? pickup.name : "Where from?"}
        onPress={onPickPickup}
      />
      <View className="ml-5 h-4 w-px bg-line" />
      <PlaceRow
        icon={<MapPin size={18} color={colors.brand.DEFAULT} />}
        label="Destination"
        value={destination ? destination.name : "Where to?"}
        onPress={onPickDestination}
      />
    </Card>
  );
}

function PlaceRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 active:opacity-80"
    >
      <View className="rounded-full bg-paper p-2">{icon}</View>
      <View className="flex-1">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </Text>
        <Text className={`text-base ${value.endsWith("?") ? "text-subtle" : "text-ink"}`}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}
