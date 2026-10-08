import { Pressable, Text, View } from "react-native";
import { BookOpen, LayoutGrid, Navigation } from "lucide-react-native";
import { colors } from "@/theme/colors";

const ACTIONS = [
  { key: "book", label: "Book a ride", icon: BookOpen },
  { key: "services", label: "Browse services", icon: LayoutGrid },
  { key: "track", label: "Track trips", icon: Navigation },
] as const;

/** The three things a passenger does here, as tappable rows. */
export function QuickActions({
  onAction,
}: {
  onAction: (action: (typeof ACTIONS)[number]["key"]) => void;
}) {
  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-card">
      {ACTIONS.map(({ key, label, icon: Icon }, index) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          onPress={() => onAction(key)}
          className={`flex-row items-center gap-3 px-4 py-4 active:bg-paper ${
            index > 0 ? "border-t border-line" : ""
          }`}
        >
          <View className="rounded-full bg-brand-soft p-2">
            <Icon size={18} color={colors.brand.DEFAULT} />
          </View>
          <Text className="flex-1 text-base font-medium text-ink">{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
