import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, scroll, shadow, space, touch } from "@/lib/theme";

export function Screen({
  children,
  scroll = true,
  padded = true,
  background = colors.background,
  contentStyle,
  footer,
}: {
  children: ReactNode;
  /** Set false for screens that manage their own list (FlatList). */
  scroll?: boolean;
  padded?: boolean;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const inner = (
    <View
      style={[
        {
          paddingHorizontal: padded ? space.lg : 0,
          gap: scroll ? space.lg : space.md,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: background,
          paddingTop: insets.top > 0 ? insets.top : touch.iconTop,
        }}
      >
        {inner}
      </View>
    );
  }

  const fill = {
    flex: 1,
    backgroundColor: background,
    paddingTop: insets.top > 0 ? insets.top : touch.iconTop,
  };

  if (footer) {
    return (
      <View style={fill}>
        <ScrollView
          contentContainerStyle={[
            { paddingBottom: scroll ? space.xxl : space.lg },
            scroll && { minHeight: 1 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
        >
          {inner}
        </ScrollView>
        <View style={{ paddingBottom: insets.bottom + 6 }}>{footer}</View>
      </View>
    );
  }

  return (
    <View style={fill}>
      <ScrollView
        contentContainerStyle={[
          { paddingBottom: scroll ? space.xxl : space.lg },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {inner}
      </ScrollView>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.header, style]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[font.title, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[font.small, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = "plain",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "plain" | "brand" | "warm";
}) {
  const background =
    tone === "brand"
      ? colors.ink
      : tone === "warm"
        ? colors.secondary
        : colors.card;
  const border =
    tone === "brand" ? colors.ink : tone === "warm" ? colors.border : colors.border;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: background,
          borderColor: border,
          borderWidth: tone === "plain" ? 1 : 0,
        },
        shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  style,
  fullWidth = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.red, fg: "#ffffff", border: colors.red },
    gold: { bg: colors.gold, fg: colors.ink, border: colors.gold },
    secondary: { bg: colors.secondary, fg: colors.ink, border: colors.secondary },
    ghost: { bg: "transparent", fg: colors.ink, border: colors.border },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  };
  const { bg, fg, border } = palette[variant];
  const off = disabled || loading;

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
          borderWidth: variant === "ghost" ? 1 : 0,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={fg} />
      ) : null}
      <Text style={[font.bodyStrong, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function TextField({
  label,
  hint,
  error,
  style,
  multiline = false,
  ...props
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <Text style={[font.label, { color: colors.textMuted }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={[
          styles.input,
          multiline && {
            textAlignVertical: "top",
            height: multiline ? 96 : undefined,
            paddingTop: space.sm,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[font.small, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  active = false,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.ink : colors.muted,
          borderColor: active ? colors.ink : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.gold : colors.textMuted}
        />
      ) : null}
      <Text
        style={[
          font.label,
          { color: active ? "#ffffff" : colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "live" | "good" | "warn" | "bad" | "gold";
}) {
  const palette: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: colors.muted, fg: colors.textMuted },
    live: { bg: colors.secondary, fg: colors.red },
    good: { bg: colors.successSoft, fg: colors.success },
    warn: { bg: colors.warningSoft, fg: colors.warning },
    bad: { bg: colors.dangerSoft, fg: colors.danger },
    gold: { bg: "#fff4d1", fg: colors.warning },
  };
  const { bg, fg } = palette[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text
        style={[
          font.tiny,
          { color: fg, textTransform: "uppercase" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function Row({
  children,
  style,
  gap = space.sm,
  wrap,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
  wrap?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        { gap, flexWrap: wrap ? "wrap" : undefined },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Between({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function EmptyState({
  icon = "sparkles-outline",
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Card tone="warm">
      <View
        style={{ alignItems: "center", gap: space.sm, paddingVertical: space.md }}
      >
        <View style={styles.emptyIcon}>
          <Ionicons name={icon} size={22} color={colors.red} />
        </View>
        <Text
          style={[font.heading, { color: colors.ink, textAlign: "center" }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {body ? (
          <Text
            style={[
              font.small,
              { color: colors.textMuted, textAlign: "center" },
            ]}
            numberOfLines={3}
          >
            {body}
          </Text>
        ) : null}
        {action}
      </View>
    </Card>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View
      style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xxl }}
    >
      <ActivityIndicator color={colors.red} />
      <Text style={[font.small, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text
        style={[
          font.tiny,
          { color: colors.textFaint, textTransform: "uppercase" },
        ]}
      >
        {label}
      </Text>
      <Text style={[font.heading, { color: colors.ink }]}>{value}</Text>
      {hint ? (
        <Text style={[font.small, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Stars({
  value,
  onChange,
  size = 32,
}: {
  value: number;
  onChange?: (score: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <Pressable
            key={star}
            onPress={() => onChange?.(star)}
            style={({ pressed }) => [
              styles.starButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            disabled={!onChange}
          >
            <Ionicons
              name={filled ? "star" : "star-outline"}
              size={size}
              color={filled ? colors.gold : colors.textFaint}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + space.xl, maxHeight: "86%" },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Between style={{ paddingBottom: space.sm }}>
            <Text style={[font.heading, { color: colors.ink }]}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{ padding: 4 }}
            >
              <Ionicons
                name="close"
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
          </Between>
          <View style={{ gap: space.md }}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

/** A labelled line item, the shape every receipt is built from. */
export function LineItem({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <Between>
      <Text
        style={[
          strong ? font.bodyStrong : font.small,
          { color: muted ? colors.textMuted : colors.ink },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          strong ? font.bodyStrong : font.small,
          { color: muted ? colors.textMuted : colors.ink },
          { textAlign: "right" },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </Between>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 4,
  },
  card: {
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  button: {
    minHeight: touch.minHeight,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  fullWidth: {
    width: "100%",
  },
  input: {
    minHeight: touch.minHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    color: colors.ink,
    fontSize: 15,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: touch.tapTarget,
  },
  row: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  stars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  starButton: {
    padding: 2,
  },
});
