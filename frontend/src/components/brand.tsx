import { StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import {
  colors,
  font,
  radius,
  scroll,
  space,
  touch,
} from "@/theme";

export function Crest({
  size = 48,
  tone = "default",
}: {
  size?: number;
  tone?: "default" | "white";
}) {
  return (
    <View
      style={[
        styles.crest,
        {
          width: size,
          height: size,
        },
        tone === "white" && styles.crestWhite,
      ]}
      accessibilityRole="image"
      accessibilityLabel="Fetch"
    >
      <View
        style={[
          styles.crestRing,
          {
            width: size - 8,
            height: size - 8,
          },
        ]}
      >
        <Text
          style={[styles.crestText, { fontSize: size * 0.4 }]}
          numberOfLines={1}
        >
          F
        </Text>
      </View>
    </View>
  );
}

export function Wordmark({
  size = 48,
  tone = "default",
}: {
  size?: number;
  tone?: "default" | "white";
}) {
  return (
    <View
      style={[
        styles.wordmarkShell,
        { gap: space.sm },
      ]}
      accessibilityRole="image"
      accessibilityLabel="Fetch"
    >
      <Crest size={size} tone={tone} />
      <Text
        style={[
          styles.wordmark,
          {
            fontSize: size * 0.22,
          },
          tone === "white" ? styles.wordmarkWhite : undefined,
        ]}
        numberOfLines={1}
      >
        Fetch
      </Text>
    </View>
  );
}

export function RideTimeline({ status }: { status: string }) {
  return (
    <View
      style={styles.timeline}
      accessibilityLabel={`Trip status: ${status}`}
    >
      <View style={styles.timelineDot} />
      <Text style={[font.bodyStrong, { color: colors.ink }]}>
        {status
          .toLowerCase()
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ")}
      </Text>
    </View>
  );
}

export function PointMarker({
  kind,
  size = 12,
}: {
  kind: "pickup" | "destination";
  size?: number;
}) {
  return (
    <View
      style={[
        styles.pointMarker,
        {
          width: size,
          height: size,
          borderColor: kind === "pickup" ? colors.gold : colors.red,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={kind === "pickup" ? "Pickup" : "Destination"}
    />
  );
}

export function WaveGradient({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <View
      style={styles.wave}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  crest: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.red,
  },
  crestWhite: {
    backgroundColor: colors.ink,
  },
  crestRing: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  crestText: {
    color: colors.gold,
    fontWeight: "800",
    fontFamily: "System",
  },
  wordmarkShell: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  wordmarkWhite: {
    color: "#ffffff",
  },
  timeline: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
  pointMarker: {
    borderRadius: 999,
    borderWidth: 2,
  },
  wave: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: scroll.cardGap,
  },
});
