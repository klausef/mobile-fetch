import type { Service, ServiceCategory } from "@/types";

export type ServiceFilter = ServiceCategory | "all";

export interface ServiceCatalogue {
  services: Service[];
  categories: { id: ServiceFilter; label: string }[];
}
