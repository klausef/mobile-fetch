import { useAsync } from "@/hooks/useAsync";
import { loadServiceCatalogue } from "../services/catalogue.service";

/** The bookable services plus the category filters to slice them with. */
export function useServiceCatalogue() {
  return useAsync(loadServiceCatalogue, []);
}
