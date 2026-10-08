import { Text, TextInput, View, type TextInputProps } from "react-native";

/** A labelled text field. The label is always visible, never a placeholder. */
export function Input({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <TextInput
        className="rounded-xl border border-line bg-card px-4 py-3 text-base text-ink"
        placeholderTextColor="#a8a29e"
        {...props}
      />
    </View>
  );
}
