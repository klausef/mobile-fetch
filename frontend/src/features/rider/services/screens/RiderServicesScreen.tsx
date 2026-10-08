import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Loading, ErrorState, EmptyState } from "@/components/Feedback";
import { useRiderServices } from "../hooks/useRiderServices";
import { useRiderServiceToggles } from "../hooks/useRiderServiceToggles";
import { ServiceToggleCard } from "../components/ServiceToggleCard";
import { riderProfileApi } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";

/** What this rider can be booked for. */
export function RiderServicesScreen() {
  const router = useRouter();
  const profile = useAsync(() => riderProfileApi.getProfile(), []);
  const catalogue = useRiderServices(profile.data?.vehicle ? `${profile.data.vehicle.make} ${profile.data.vehicle.model}` : "");
  const { services, toggle } = useRiderServiceToggles(catalogue.data ?? []);

  return (
    <Screen title="My services" subtitle="What you take" onBack={() => router.back()}>
      {profile.loading || catalogue.loading ? <Loading /> : null}
      {profile.error ? <ErrorState message={profile.error.message} onRetry={() => void profile.refetch()} /> : null}
      {catalogue.error ? <ErrorState message={catalogue.error.message} onRetry={() => void catalogue.refetch()} /> : null}
      {services.length === 0 && !profile.loading && !catalogue.loading ? (
        <EmptyState title="No services" body="There is nothing to configure right now." />
      ) : (
        <View className="gap-3">
          {services.map((service) => (
            <ServiceToggleCard
              key={service.id}
              service={service}
              onToggle={(serviceId, enabled) => toggle(serviceId, enabled)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
