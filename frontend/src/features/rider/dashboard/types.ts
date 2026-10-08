import type { Booking, EarningsSummary, Rider } from "@/types";

/** Everything the rider's home screen needs. */
export interface RiderDashboardData {
  rider: Rider;
  requests: Booking[];
  activeTrip: Booking | undefined;
  earnings: EarningsSummary;
}
