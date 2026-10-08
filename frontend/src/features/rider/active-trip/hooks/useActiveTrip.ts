import { useAsync } from "@/hooks/useAsync";
import { usePolling } from "@/hooks/usePolling";
import { loadActiveTrip } from "../services/activeTrip.service";

/** The trip in hand; polls so a passenger-side status change is seen. */
export function useActiveTrip() {
  const result = useAsync(loadActiveTrip, []);
  usePolling(result.refetch, 4000, !result.loading && !result.error);
  return result;
}
