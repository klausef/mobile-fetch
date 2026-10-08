import { Text, View } from "react-native";
import type { ReactNode } from "react";

/** The card everything else sits in. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`rounded-2xl border border-line bg-card p-4 ${className}`}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View className="mb-2 flex-row items-center justify-between">
      <Text className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </Text>
      {action}
    </View>
  );
}
