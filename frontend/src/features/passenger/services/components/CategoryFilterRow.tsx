import { Pressable, Text, View } from "react-native";
import type { ServiceFilter } from "../types";

/** Horizontal category chips. */
export function CategoryFilterRow({
  categories,
  selected,
  onSelect,
}: {
  categories: { id: ServiceFilter; label: string }[];
  selected: ServiceFilter;
  onSelect: (id: ServiceFilter) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {categories.map((category) => {
        const active = category.id === selected;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(category.id)}
            className={`rounded-full px-4 py-2 ${
              active ? "bg-brand" : "border border-line bg-card"
            }`}
          >
            <Text className={`text-sm font-semibold ${active ? "text-white" : "text-ink"}`}>
              {category.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
