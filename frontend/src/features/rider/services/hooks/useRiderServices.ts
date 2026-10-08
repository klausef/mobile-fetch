import { useAsync } from "@/hooks/useAsync";
import { loadRiderServices } from "../services/riderServices.service";

/** The services this rider can be booked for, derived from their vehicle. */
export function useRiderServices(vehicle: string) {
  return useAsync(() => loadRiderServices(vehicle), [vehicle]);
}
