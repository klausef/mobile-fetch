import { useState } from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Text } from "react-native";
import { Loading, EmptyState } from "@/components/Feedback";
import { routes, trackingRoute } from "@/navigation/routes";
import { useBookingDraftStore } from "@/store/useBookingDraftStore";
import { useCurrentPassenger } from "@/store/useSessionStore";
import { useBookingDraft } from "../hooks/useBookingDraft";
import { submitBooking } from "../services/booking.service";
import { PlacePicker } from "../components/PlacePicker";
import { PlaceChooser } from "../components/PlaceChooser";
import { FareSummaryCard } from "../components/FareSummaryCard";
import type { Location } from "@/types";

/** Compose a booking: two ends, one service, one price, one confirmation. */
export function BookingScreen() {
  const router = useRouter();
  const passenger = useCurrentPassenger();
  const { draft, services, servicesLoading, quote, ready } = useBookingDraft();
  const [creating, setCreating] = useState(false);
  const [choosing, setChoosing] = useState<"pickup" | "destination" | null>(null);
  const [query, setQuery] = useState("");

  if (servicesLoading && services.length === 0) {
    return <Screen title="Book" onBack={() => router.back()}><Loading /></Screen>;
  }

  if (!servicesLoading && services.length === 0) {
    return (
      <Screen title="Book" onBack={() => router.back()}>
        <EmptyState title="No services" body="There is nothing bookable right now." />
      </Screen>
    );
  }

  const pick = (location: Location) => {
    if (choosing === "pickup") draft.setPickup(location);
    if (choosing === "destination") draft.setDestination(location);
    setChoosing(null);
    setQuery("");
  };

  const confirm = () => {
    if (!quote || !draft.pickup || !draft.destination || !draft.serviceId) return;
    setCreating(true);
    void submitBooking({
      passengerId: passenger.id,
      passengerName: passenger.name,
      serviceId: draft.serviceId,
      pickup: draft.pickup,
      destination: draft.destination,
    })
      .then((booking) => {
        draft.clear();
        router.replace(trackingRoute(booking.id));
      })
      .catch((cause: unknown) => {
        Alert.alert(
          "Could not book",
          cause instanceof Error ? cause.message : "Something went wrong.",
        );
      })
      .finally(() => setCreating(false));
  };

  return (
    <Screen title="Book" subtitle="Set your trip" onBack={() => router.back()}>
      {choosing ? (
        <PlaceChooser
          query={query}
          onQueryChange={setQuery}
          onPick={pick}
          excludeId={choosing === "pickup" ? draft.destination?.id : draft.pickup?.id}
        />
      ) : (
        <View className="gap-4">
          <PlacePicker
            pickup={draft.pickup}
            destination={draft.destination}
            onPickPickup={() => setChoosing("pickup")}
            onPickDestination={() => setChoosing("destination")}
          />

          <Card className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
              Service
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {services.map((service) => {
                const active = service.id === draft.serviceId;
                return (
                  <Button
                    key={service.id}
                    label={service.name}
                    size="sm"
                    variant={active ? "primary" : "secondary"}
                    onPress={() => draft.setService(service.id)}
                  />
                );
              })}
            </View>
          </Card>

          {quote ? <FareSummaryCard quote={quote} /> : null}

          <Button
            label={creating ? "Booking…" : "Confirm booking"}
            onPress={confirm}
            disabled={!ready || creating}
            loading={creating}
            fullWidth
          />
        </View>
      )}
    </Screen>
  );
}
