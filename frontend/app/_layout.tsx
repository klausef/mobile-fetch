import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { convex } from "@/services/api/convex";
import { secureStoreTokenStorage } from "@/services/api/auth-storage";
import { colors } from "@/theme";

/** The root layout: providers first, then the navigation stack. */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConvexAuthProvider client={convex} storage={secureStoreTokenStorage}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="ride" options={{ presentation: "card", animation: "slide_from_bottom" }} />
          <Stack.Screen name="rider" options={{ presentation: "card", animation: "slide_from_right" }} />
          <Stack.Screen name="vehicle" options={{ presentation: "card", animation: "slide_from_right" }} />
          <Stack.Screen name="chat" options={{ presentation: "card", animation: "slide_from_right" }} />
        </Stack>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
