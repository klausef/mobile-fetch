import { useAsync } from "@/hooks/useAsync";
import { usePolling } from "@/hooks/usePolling";
import { loadPassengerDashboard } from "../services/passengerDashboard.service";

/**
 * Dashboard data, refreshed while the screen is open so an accepted booking
 * appears without a manual pull.
 */
export function usePassengerDashboard() {
  const result = useAsync(loadPassengerDashboard, []);
  usePolling(result.refetch, 5000, !result.loading && !result.error);
  return result;
}
