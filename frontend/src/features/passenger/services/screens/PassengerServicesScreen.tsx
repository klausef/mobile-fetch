import { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Loading, ErrorState, EmptyState } from "@/components/Feedback";
import { routes } from "@/navigation/routes";
import { useBookingDraftStore } from "@/store/useBookingDraftStore";
import { useServiceCatalogue } from "../hooks/useServiceCatalogue";
import { ServiceCard } from "../components/ServiceCard";
import { CategoryFilterRow } from "../components/CategoryFilterRow";
import type { ServiceFilter } from "../types";

/** Browsing the catalogue; tapping a service starts a booking with it. */
export function PassengerServicesScreen() {
  const router = useRouter();
  const setService = useBookingDraftStore((state) => state.setService);
  const { data, loading, error, refetch } = useServiceCatalogue();
  const [filter, setFilter] = useState<ServiceFilter>("all");

  const visible = useMemo(
    () =>
      (data?.services ?? []).filter(
        (service) => filter === "all" || service.category === filter,
      ),
    [data, filter],
  );

  return (
    <Screen
      title="Services"
      subtitle="What would you like to book?"
      onBack={() => router.back()}
    >
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={() => void refetch()} /> : null}
      {data ? (
        <>
          <CategoryFilterRow
            categories={data.categories}
            selected={filter}
            onSelect={setFilter}
          />
          {visible.length === 0 ? (
            <EmptyState
              title="Nothing in this category"
              body="Try another filter, or check back soon."
            />
          ) : (
            <View className="gap-3">
              {visible.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onSelect={(selected) => {
                    setService(selected.id);
                    router.push(routes.passengerBooking);
                  }}
                />
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}
