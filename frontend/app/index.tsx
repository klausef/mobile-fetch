import { Pressable, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Armchair, Bike } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { routes } from "@/navigation/routes";
import { useSessionStore } from "@/store/useSessionStore";
import { colors } from "@/theme/colors";

/**
 * The front door: choose what you are here to do. Mock app, no auth — the
 * role picks the demo account and the whole navigation tree that follows.
 */
export default function RoleSelectionScreen() {
  const router = useRouter();
  const role = useSessionStore((state) => state.role);

  if (!role) {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <View className="flex-1 justify-center gap-6 p-6">
          <View className="gap-2">
            <Text className="text-4xl font-bold tracking-tight text-ink">FETCH</Text>
            <Text className="text-base text-muted">
              Rides, packages and errands in one app. Choose how you use it.
            </Text>
          </View>

          <View className="gap-3">
            <RoleCard
              title="I need a ride"
              body="Book trips, send packages, order errands."
              icon={<Armchair size={26} color={colors.brand.DEFAULT} />}
              onPress={() => {
                useSessionStore.getState().selectRole("passenger");
                router.replace(routes.passengerDashboard);
              }}
            />
            <RoleCard
              title="I drive"
              body="Go online, accept requests, earn from trips."
              icon={<Bike size={26} color={colors.brand.DEFAULT} />}
              onPress={() => {
                useSessionStore.getState().selectRole("rider");
                router.replace(routes.riderDashboard);
              }}
            />
          </View>

          <Text className="text-center text-xs text-subtle">
            Demo build — everything runs on local mock data.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // A returning session skips the door: passengers straight in, riders too.
  return (
    <Redirect
      href={role === "passenger" ? routes.passengerDashboard : routes.riderDashboard}
    />
  );
}

function RoleCard({
  title,
  body,
  icon,
  onPress,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-2xl border border-line bg-card p-5 active:bg-paper"
    >
      <View className="rounded-2xl bg-brand-soft p-3">{icon}</View>
      <View className="flex-1 gap-0.5">
        <Text className="text-lg font-semibold text-ink">{title}</Text>
        <Text className="text-sm text-muted">{body}</Text>
      </View>
    </Pressable>
  );
}
