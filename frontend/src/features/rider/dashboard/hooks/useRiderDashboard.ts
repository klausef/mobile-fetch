import { useAsync } from "@/hooks/useAsync";
import { usePolling } from "@/hooks/usePolling";
import { loadRiderDashboard } from "../services/riderDashboard.service";

/**
 * The rider's home data. Requests refresh on a short interval while the
 * screen is open — the stand-in for push notifications of new bookings.
 */
export function useRiderDashboard() {
  const result = useAsync(loadRiderDashboard, []);
  usePolling(result.refetch, 4000, !result.loading && !result.error);
  return result;
}
