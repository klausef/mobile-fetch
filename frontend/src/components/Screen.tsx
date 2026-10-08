import { ScrollView, Text, View, type ReactNode } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { Pressable } from "react-native";

/**
 * The screen shell: safe area, a header with an optional back control, and a
 * scroll body. Every screen starts here so spacing and headers stay uniform.
 */
export function Screen({
  title,
  subtitle,
  onBack,
  scroll = true,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top"]}>
      <View className="flex-row items-center gap-1 px-4 pb-1 pt-2">
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            className="mr-1 rounded-full p-1 active:bg-line"
          >
            <ChevronLeft size={24} color="#1c1917" />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-2xl font-bold text-ink">{title}</Text>
          {subtitle ? <Text className="mt-0.5 text-sm text-muted">{subtitle}</Text> : null}
        </View>
      </View>
      {scroll ? (
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 gap-4 p-4">{children}</View>
      )}
    </SafeAreaView>
  );
}
