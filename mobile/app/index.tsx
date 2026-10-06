import { Ionicons } from "@expo/vector-icons";
import { useConvexAuth, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/shared";
import { Wordmark } from "@/components/brand";
import { Button, Loading } from "@/components/ui";
import { colors, font, radius, scroll, space, touch } from "@/lib/theme";

/**
 * The front door.
 *
 * Signed out, this is the app's handshake: who Fetch is, the three things it
 * does in Bukidnon, and one way in. Signed in, it is a gate — the router sends
 * the session to the right home rather than rendering a second menu nobody
 * asked for.
 */
export default function Index() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(
    api.profiles.getMyProfile,
    isAuthenticated ? {} : "skip",
  );

  if (authLoading || (isAuthenticated && profile === undefined)) {
    return <Loading label="Starting Fetch…" />;
  }

  if (isAuthenticated) {
    // A profile is created once, after the first sign-in; until then the only
    // thing the session can usefully do is introduce itself.
    if (profile === null) return <Redirect href="/onboarding" />;
    if (profile) {
      if (profile.role === "rider") return <Redirect href="/rider" />;
      if (profile.role === "admin") return <Redirect href="/(tabs)/profile" />;
      return <Redirect href="/(tabs)/book" />;
    }
  }

  return <Welcome />;
}

function Welcome() {
  return (
    <View style={styles.page}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.brand}>
        <Wordmark size={56} />
      </View>

      <View style={{ gap: space.md }}>
        <Text style={[font.display, { color: "#ffffff" }]}>
          Bukidnon moves
          {"\n"}
          with Fetch.
        </Text>
        <Text
          style={[font.body, { color: colors.textFaint }]}
          numberOfLines={3}
        >
          Book a tricycle, a motorcycle or a car in seconds — or send somebody
          to buy and deliver, across Malaybalay, Valencia and the towns between.
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <ServiceRow
          icon="car-sport"
          title="Ride"
          body="One seat, three, or a van for the whole barkada."
        />
        <ServiceRow
          icon="basket"
          title="Pabili"
          body="A rider shops for you and brings it home."
        />
        <ServiceRow
          icon="cube"
          title="Padala"
          body="Send a parcel across town without leaving the house."
        />
      </View>

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button
          label="Get started"
          onPress={() => router.push("/auth")}
          fullWidth
        />
        <Text
          style={[font.small, { color: colors.textMuted, textAlign: "center" }]}
        >
          Sign in with email, or continue as a guest.
        </Text>
      </View>
    </View>
  );
}

function ServiceRow({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/auth")}
      style={({ pressed }) => [
        styles.service,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.serviceIcon}>
        <Ionicons name={icon} size={20} color={colors.gold} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[font.bodyStrong, { color: "#ffffff" }]}>{title}</Text>
        <Text
          style={[font.small, { color: colors.textFaint }]}
          numberOfLines={2}
        >
          {body}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color="#6f6462" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl + space.xl,
    paddingBottom: space.xl,
    gap: space.xl,
  },
  glow: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.red,
    opacity: 0.35,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
  },
  service: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch.tapTarget,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,199,44,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
});
