import type { ServiceCategory } from "@/types";
import { passengerApi } from "@/services/api";
import type { ServiceCatalogue, ServiceFilter } from "../types";

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ride: "Rides",
  delivery: "Packages",
  errand: "Errands",
};

/** The bookable catalogue, grouped by the filter the screen shows. */
export async function loadServiceCatalogue(): Promise<ServiceCatalogue> {
  const services = await passengerApi.getAvailableServices();
  const categories = Array.from(new Set(services.map((service) => service.category)));
  return {
    services,
    categories: [
      { id: "all", label: "All" },
      ...categories.map((category) => ({ id: category as ServiceFilter, label: CATEGORY_LABELS[category] })),
    ],
  };
}
