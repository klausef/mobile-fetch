import { useAsync } from "@/hooks/useAsync";
import { usePolling } from "@/hooks/usePolling";
import { loadTrackingView } from "../services/tracking.service";
import { isActiveStatus } from "@/utils/bookingStatus";

/**
 * The live view of one booking. While the booking is still active it polls —
 * the mock backend cannot push, so the screen asks every few seconds instead.
 */
export function useBookingTracking(id: string) {
  const result = useAsync(() => loadTrackingView(id), [id]);
  const active = result.data ? isActiveStatus(result.data.booking.status) : true;
  usePolling(result.refetch, 4000, active && !result.error);
  return result;
}
