import { useMemo } from "react";
import { useBookingDraftStore } from "@/store/useBookingDraftStore";
import { useAsync } from "@/hooks/useAsync";
import { passengerApi } from "@/services/api";
import { quoteFor } from "../services/booking.service";
import type { FareQuote } from "../types";

/**
 * The draft (service, pickup, destination) plus the live quote it prices to.
 * Both ends must be set before a fare exists to show.
 */
export function useBookingDraft() {
  const draft = useBookingDraftStore();

  const services = useAsync(() => passengerApi.getAvailableServices(), []);
  const service = (services.data ?? []).find(
    (candidate) => candidate.id === draft.serviceId,
  );

  const quote: FareQuote | undefined = useMemo(() => {
    if (!service || !draft.pickup || !draft.destination) return undefined;
    return quoteFor(service, draft.pickup, draft.destination);
  }, [service, draft.pickup, draft.destination]);

  return {
    draft,
    services: services.data ?? [],
    servicesLoading: services.loading,
    service,
    quote,
    ready: Boolean(service && draft.pickup && draft.destination),
  };
}
