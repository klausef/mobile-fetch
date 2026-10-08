import { Redirect, Stack } from "expo-router";
import { useSessionStore } from "@/store/useSessionStore";
import { colors } from "@/theme/colors";

/** The rider tree, reachable only with the rider role selected. */
export default function RiderLayout() {
  const role = useSessionStore((state) => state.role);
  if (role !== "rider") return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    />
  );
}
