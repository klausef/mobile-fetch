import { ActivityIndicator, Pressable, Text } from "react-native";

/**
 * The button kit. Variants are whole class strings so Tailwind can see them
 * at build time — never build a class name by concatenation.
 */

const VARIANTS = {
  primary: "bg-brand active:bg-brand-dark",
  secondary: "border border-line bg-card active:bg-paper",
  danger: "bg-danger active:opacity-90",
  success: "bg-success active:opacity-90",
  ghost: "bg-transparent",
} as const;

const LABELS = {
  primary: "text-white",
  secondary: "text-ink",
  danger: "text-white",
  success: "text-white",
  ghost: "text-muted",
} as const;

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: keyof typeof VARIANTS;
  size?: "md" | "sm";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      className={`items-center justify-center rounded-xl ${
        size === "sm" ? "min-h-10 px-4" : "min-h-12 px-5"
      } ${fullWidth ? "w-full" : ""} ${VARIANTS[variant]} ${inactive ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "secondary" || variant === "ghost" ? "#78716c" : "#ffffff"} />
      ) : (
        <Text
          className={`font-semibold ${LABELS[variant]} ${size === "sm" ? "text-sm" : "text-base"}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
