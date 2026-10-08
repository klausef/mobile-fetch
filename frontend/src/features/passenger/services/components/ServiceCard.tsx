import { Pressable, Text, View } from "react-native";
import { Car, Package, ShoppingBag, Bike, type LucideIcon } from "lucide-react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { formatPeso } from "@/utils/format";
import { colors } from "@/theme/colors";
import type { Service } from "@/types";

const ICONS: Record<Service["icon"], LucideIcon> = {
  car: Car,
  bike: Bike,
  package: Package,
  shopping: ShoppingBag,
};

const CATEGORY_TONES = { ride: "brand", delivery: "info", errand: "success" } as const;

/** One bookable service: what it is, and what it starts at. */
export function ServiceCard({
  service,
  onSelect,
}: {
  service: Service;
  onSelect: (service: Service) => void;
}) {
  const Icon = ICONS[service.icon];
  return (
    <Pressable onPress={() => onSelect(service)}>
      <Card className="flex-row items-center gap-3 active:bg-paper">
        <View className="rounded-2xl bg-brand-soft p-3">
          <Icon size={22} color={colors.brand.DEFAULT} />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-semibold text-ink">{service.name}</Text>
            <Badge label={service.category} tone={CATEGORY_TONES[service.category]} />
          </View>
          <Text className="text-sm text-muted" numberOfLines={2}>
            {service.description}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold text-ink">
            {formatPeso(service.baseFare)}
          </Text>
          <Text className="text-[11px] text-muted">base fare</Text>
        </View>
      </Card>
    </Pressable>
  );
}
