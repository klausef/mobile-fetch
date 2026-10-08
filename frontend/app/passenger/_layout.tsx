import { Stack } from "expo-router";
import { Redirect } from "expo-router";
import { useSessionStore } from "@/store/useSessionStore";
import { colors } from "@/theme/colors";

/** The passenger tree, reachable only with the passenger role selected. */
export default function PassengerLayout() {
  const role = useSessionStore((state) => state.role);
  if (role !== "passenger") return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    />
  );
}
