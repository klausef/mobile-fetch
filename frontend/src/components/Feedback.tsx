import { AlertCircle, Inbox, type LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Text, View } from "react-native";
import type { ReactNode } from "react";
import { Button } from "./Button";

/** The three non-happy states, so no screen invents its own. */

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View className="items-center justify-center gap-3 py-16">
      <ActivityIndicator size="large" color="#d92d20" />
      <Text className="text-sm text-muted">{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="items-center gap-3 rounded-2xl border border-dangerSoft bg-dangerSoft p-6">
      <AlertCircle size={28} color="#dc2626" />
      <Text className="text-center text-sm font-medium text-danger">{message}</Text>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} variant="secondary" size="sm" />
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <View className="items-center gap-2 rounded-2xl border border-line bg-card p-8">
      <View className="mb-1 rounded-full bg-paper p-3">
        <Icon size={24} color="#a8a29e" />
      </View>
      <Text className="text-base font-semibold text-ink">{title}</Text>
      <Text className="text-center text-sm text-muted">{body}</Text>
      {action}
    </View>
  );
}
